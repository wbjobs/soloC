import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { User } from './user.schema';
import { lastValueFrom } from 'rxjs';
import * as crypto from 'crypto';

@Injectable()
export class UserService {
  constructor(
    @InjectModel('User') private userModel: Model<User>,
    private httpService: HttpService,
  ) {}

  async registerSingleSample(email: string, name: string, audioData: string) {
    const response = await lastValueFrom(
      this.httpService.post('http://localhost:5000/extract-embedding', {
        audio: audioData,
        denoise: true,
        vad: true,
      }),
    );

    if (!response.data.success) {
      throw new HttpException('声纹提取失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const user = new this.userModel({
      email,
      name,
      voiceEmbedding: response.data.embedding,
      voiceTemplate: {
        embedding: response.data.embedding,
        numSamples: 1,
        avgNoiseLevel: response.data.noise_level,
        qualityScore: response.data.quality_score,
        fusionMethod: 'single',
      },
      voiceRegistered: true,
    });

    return user.save();
  }

  async registerMultiSample(email: string, name: string, audioSamples: string[], fusionMethod: string = 'ensemble') {
    const response = await lastValueFrom(
      this.httpService.post('http://localhost:5000/extract-template', {
        audio_samples: audioSamples,
        fusion_method: fusionMethod,
      }),
    );

    if (!response.data.success) {
      throw new HttpException('声纹模板提取失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const sampleHashes = audioSamples.map(audio => 
      crypto.createHash('md5').update(audio.slice(0, 1000)).digest('hex')
    );

    const user = new this.userModel({
      email,
      name,
      voiceEmbedding: response.data.embedding,
      voiceTemplate: {
        embedding: response.data.embedding,
        numSamples: response.data.num_samples,
        avgNoiseLevel: response.data.avg_noise_level,
        qualityScore: response.data.quality_score,
        fusionMethod,
        sampleHashes,
      },
      voiceRegistered: true,
    });

    return user.save();
  }

  async login(audioData: string) {
    const users = await this.userModel.find({ voiceRegistered: true });

    if (users.length === 0) {
      throw new HttpException('没有注册的声纹用户', HttpStatus.NOT_FOUND);
    }

    for (const user of users) {
      const templateEmbedding = user.voiceTemplate?.embedding || user.voiceEmbedding;

      const response = await lastValueFrom(
        this.httpService.post('http://localhost:5000/verify', {
          verify_embedding: null,
          template_embedding: templateEmbedding,
        }),
      );

      const verifyResponse = await lastValueFrom(
        this.httpService.post('http://localhost:5000/verify-audio', {
          verify_audio: audioData,
          template_embedding: templateEmbedding,
        }),
      );

      if (verifyResponse.data.verified) {
        user.lastLoginAt = new Date();
        user.loginAttempts = user.loginAttempts + 1;
        user.successfulLogins = user.successfulLogins + 1;
        await user.save();

        return {
          success: true,
          user,
          verification: verifyResponse.data,
        };
      }
    }

    throw new HttpException('声纹验证失败', HttpStatus.UNAUTHORIZED);
  }

  async verifyByUserId(userId: string, audioData: string) {
    const user = await this.userModel.findById(userId);

    if (!user || !user.voiceRegistered) {
      throw new HttpException('用户不存在或未注册声纹', HttpStatus.NOT_FOUND);
    }

    const templateEmbedding = user.voiceTemplate?.embedding || user.voiceEmbedding;

    const response = await lastValueFrom(
      this.httpService.post('http://localhost:5000/verify-audio', {
        verify_audio: audioData,
        template_embedding: templateEmbedding,
      }),
    );

    user.loginAttempts = user.loginAttempts + 1;

    if (response.data.verified) {
      user.lastLoginAt = new Date();
      user.successfulLogins = user.successfulLogins + 1;
    }

    await user.save();

    return {
      success: response.data.verified,
      user,
      verification: response.data,
    };
  }

  async updateVoiceTemplate(userId: string, audioSamples: string[], fusionMethod: string = 'ensemble') {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new HttpException('用户不存在', HttpStatus.NOT_FOUND);
    }

    const response = await lastValueFrom(
      this.httpService.post('http://localhost:5000/extract-template', {
        audio_samples: audioSamples,
        fusion_method: fusionMethod,
      }),
    );

    if (!response.data.success) {
      throw new HttpException('声纹模板更新失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const sampleHashes = audioSamples.map(audio =>
      crypto.createHash('md5').update(audio.slice(0, 1000)).digest('hex')
    );

    user.voiceEmbedding = response.data.embedding;
    user.voiceTemplate = {
      embedding: response.data.embedding,
      numSamples: response.data.num_samples,
      avgNoiseLevel: response.data.avg_noise_level,
      qualityScore: response.data.quality_score,
      fusionMethod,
      sampleHashes,
    };

    return user.save();
  }

  findByEmail(email: string) {
    return this.userModel.findOne({ email });
  }

  findById(id: string) {
    return this.userModel.findById(id);
  }
}
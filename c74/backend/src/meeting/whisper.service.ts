import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as FormData from 'form-data';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WhisperService {
  private readonly apiKey: string;
  private readonly apiUrl = 'https://api.openai.com/v1/audio/transcriptions';

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY');
  }

  async transcribeAudio(audioFilePath: string, language: string = 'zh'): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(audioFilePath));
      formData.append('model', 'whisper-1');
      formData.append('language', language);
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'segment');

      const response = await lastValueFrom(
        this.httpService.post(this.apiUrl, formData, {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${this.apiKey}`,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }),
      );

      return response.data.text;
    } catch (error) {
      console.error('Whisper transcription error:', error.response?.data || error.message);
      throw new Error(`语音转文字失败: ${error.message}`);
    }
  }

  async transcribeAudioWithSegments(audioFilePath: string, language: string = 'zh'): Promise<{
    text: string;
    segments: Array<{
      id: number;
      start: number;
      end: number;
      text: string;
      speaker?: string;
    }>;
  }> {
    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(audioFilePath));
      formData.append('model', 'whisper-1');
      formData.append('language', language);
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'segment');

      const response = await lastValueFrom(
        this.httpService.post(this.apiUrl, formData, {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${this.apiKey}`,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }),
      );

      return {
        text: response.data.text,
        segments: response.data.segments?.map(seg => ({
          id: seg.id,
          start: seg.start,
          end: seg.end,
          text: seg.text,
        })) || [],
      };
    } catch (error) {
      console.error('Whisper transcription error:', error.response?.data || error.message);
      throw new Error(`语音转文字失败: ${error.message}`);
    }
  }

  async transcribeBase64Audio(base64Audio: string, fileExtension: string = 'wav'): Promise<string> {
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, `audio_${Date.now()}.${fileExtension}`);
    
    try {
      const audioBuffer = Buffer.from(base64Audio, 'base64');
      fs.writeFileSync(tempFilePath, audioBuffer);
      
      const result = await this.transcribeAudio(tempFilePath);
      
      fs.unlinkSync(tempFilePath);
      
      return result;
    } catch (error) {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      throw error;
    }
  }
}
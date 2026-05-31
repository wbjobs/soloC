import { Controller, Post, Body, Param, Get } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('register')
  async registerSingle(@Body() body: { email: string; name: string; audio: string }) {
    return this.userService.registerSingleSample(body.email, body.name, body.audio);
  }

  @Post('register-multi')
  async registerMulti(
    @Body() body: { email: string; name: string; audioSamples: string[]; fusionMethod?: string }
  ) {
    return this.userService.registerMultiSample(
      body.email,
      body.name,
      body.audioSamples,
      body.fusionMethod
    );
  }

  @Post('login')
  async login(@Body() body: { audio: string }) {
    return this.userService.login(body.audio);
  }

  @Post(':id/verify')
  async verifyByUserId(
    @Param('id') userId: string,
    @Body() body: { audio: string }
  ) {
    return this.userService.verifyByUserId(userId, body.audio);
  }

  @Post(':id/update-template')
  async updateVoiceTemplate(
    @Param('id') userId: string,
    @Body() body: { audioSamples: string[]; fusionMethod?: string }
  ) {
    return this.userService.updateVoiceTemplate(
      userId,
      body.audioSamples,
      body.fusionMethod
    );
  }

  @Get(':id')
  async getUser(@Param('id') userId: string) {
    return this.userService.findById(userId);
  }
}
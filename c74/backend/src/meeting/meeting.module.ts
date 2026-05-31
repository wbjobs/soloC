import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';
import { MeetingSchema } from './meeting.schema';
import { WhisperService } from './whisper.service';
import { MeetingAnalysisService } from './meeting-analysis.service';
import { EmailModule } from '../email/email.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Meeting', schema: MeetingSchema }]),
    HttpModule,
    EmailModule,
    ConfigModule,
  ],
  controllers: [MeetingController],
  providers: [MeetingService, WhisperService, MeetingAnalysisService],
  exports: [MeetingService],
})
export class MeetingModule {}
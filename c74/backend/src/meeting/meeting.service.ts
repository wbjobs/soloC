import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Meeting } from './meeting.schema';
import { WhisperService } from './whisper.service';
import { MeetingAnalysisService } from './meeting-analysis.service';
import { EmailService } from '../email/email.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MeetingService {
  constructor(
    @InjectModel('Meeting') private meetingModel: Model<Meeting>,
    private whisperService: WhisperService,
    private meetingAnalysisService: MeetingAnalysisService,
    private emailService: EmailService,
  ) {}

  async createMeeting(
    bookingId: string,
    title: string,
    description: string,
    roomId: string,
    organizerId: string,
    attendees: Array<{ userId: string; name: string; email: string }>,
    startTime: Date,
    endTime: Date,
  ) {
    const meeting = new this.meetingModel({
      bookingId: new Types.ObjectId(bookingId),
      title,
      description,
      roomId: new Types.ObjectId(roomId),
      organizerId: new Types.ObjectId(organizerId),
      attendees: attendees.map(a => ({
        userId: new Types.ObjectId(a.userId),
        name: a.name,
        email: a.email,
        emailSent: false,
      })),
      startTime,
      endTime,
      status: 'scheduled',
    });

    return meeting.save();
  }

  async startMeeting(meetingId: string) {
    const meeting = await this.meetingModel.findById(meetingId);
    if (!meeting) {
      throw new HttpException('会议不存在', HttpStatus.NOT_FOUND);
    }

    meeting.status = 'recording';
    meeting.startTime = new Date();
    return meeting.save();
  }

  async endMeeting(meetingId: string, base64Audio?: string) {
    const meeting = await this.meetingModel.findById(meetingId)
      .populate('roomId')
      .populate('organizerId', 'name email');
    
    if (!meeting) {
      throw new HttpException('会议不存在', HttpStatus.NOT_FOUND);
    }

    meeting.status = 'processing';
    meeting.endTime = new Date();
    await meeting.save();

    if (base64Audio) {
      try {
        const transcription = await this.whisperService.transcribeBase64Audio(base64Audio);
        meeting.transcription = transcription;
        await meeting.save();

        const analysis = await this.meetingAnalysisService.analyzeMeeting(transcription, meeting.title);
        meeting.summary = {
          title: analysis.title,
          overview: analysis.overview,
          decisions: analysis.decisions,
          todos: analysis.todos,
          keyPoints: analysis.keyPoints,
          duration: analysis.duration,
        };
        meeting.status = 'completed';
        meeting.completedAt = new Date();
        await meeting.save();

        await this.sendMeetingSummaryEmails(meeting);

        return meeting;
      } catch (error) {
        meeting.status = 'completed';
        meeting.processingError = error.message;
        meeting.completedAt = new Date();
        await meeting.save();
        throw new HttpException(`会议处理失败: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    } else {
      meeting.status = 'completed';
      meeting.completedAt = new Date();
      await meeting.save();
      return meeting;
    }
  }

  async processMeetingAudio(meetingId: string, base64Audio: string) {
    const meeting = await this.meetingModel.findById(meetingId);
    if (!meeting) {
      throw new HttpException('会议不存在', HttpStatus.NOT_FOUND);
    }

    meeting.status = 'processing';
    await meeting.save();

    try {
      const transcription = await this.whisperService.transcribeBase64Audio(base64Audio);
      meeting.transcription = transcription;

      const analysis = await this.meetingAnalysisService.analyzeMeeting(transcription, meeting.title);
      meeting.summary = {
        title: analysis.title,
        overview: analysis.overview,
        decisions: analysis.decisions,
        todos: analysis.todos,
        keyPoints: analysis.keyPoints,
        duration: analysis.duration,
      };

      meeting.status = 'completed';
      meeting.completedAt = new Date();
      await meeting.save();

      await this.sendMeetingSummaryEmails(meeting);

      return meeting;
    } catch (error) {
      meeting.processingError = error.message;
      meeting.status = 'completed';
      await meeting.save();
      throw error;
    }
  }

  private async sendMeetingSummaryEmails(meeting: Meeting) {
    const attendees = meeting.attendees.map(a => ({
      name: a.name,
      email: a.email,
    }));

    const roomName = (meeting.roomId as any)?.name || '会议室';
    const organizerName = (meeting.organizerId as any)?.name || '系统';

    const emailData = {
      meetingTitle: meeting.summary?.title || meeting.title,
      meetingDate: meeting.startTime,
      duration: meeting.summary?.duration || this.calculateDuration(meeting.startTime, meeting.endTime),
      roomName,
      organizer: organizerName,
      overview: meeting.summary?.overview || '',
      decisions: meeting.summary?.decisions || [],
      todos: meeting.summary?.todos || [],
      keyPoints: meeting.summary?.keyPoints || [],
      transcription: meeting.transcription,
    };

    const result = await this.emailService.sendMeetingSummaryBatch(attendees, emailData);

    for (let i = 0; i < meeting.attendees.length; i++) {
      const emailResult = result.details.find(d => d.email === meeting.attendees[i].email);
      if (emailResult) {
        meeting.attendees[i].emailSent = emailResult.success;
      }
    }

    await meeting.save();
    return result;
  }

  private calculateDuration(start: Date, end: Date): string {
    if (!start || !end) return '未知';
    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    return `${minutes}分钟`;
  }

  async getMeetingById(meetingId: string) {
    return this.meetingModel.findById(meetingId)
      .populate('roomId')
      .populate('organizerId', 'name email');
  }

  async getMeetingsByUser(userId: string, status?: string) {
    const query: any = {
      $or: [
        { organizerId: new Types.ObjectId(userId) },
        { 'attendees.userId': new Types.ObjectId(userId) },
      ],
    };

    if (status) {
      query.status = status;
    }

    return this.meetingModel.find(query)
      .populate('roomId')
      .sort({ startTime: -1 });
  }

  async getMeetingTranscription(meetingId: string) {
    const meeting = await this.meetingModel.findById(meetingId);
    if (!meeting) {
      throw new HttpException('会议不存在', HttpStatus.NOT_FOUND);
    }
    return { transcription: meeting.transcription };
  }

  async getMeetingSummary(meetingId: string) {
    const meeting = await this.meetingModel.findById(meetingId);
    if (!meeting) {
      throw new HttpException('会议不存在', HttpStatus.NOT_FOUND);
    }
    return meeting.summary;
  }

  async resendMeetingSummaryEmail(meetingId: string, email?: string) {
    const meeting = await this.meetingModel.findById(meetingId)
      .populate('roomId')
      .populate('organizerId', 'name email');
    
    if (!meeting) {
      throw new HttpException('会议不存在', HttpStatus.NOT_FOUND);
    }

    const roomName = (meeting.roomId as any)?.name || '会议室';
    const organizerName = (meeting.organizerId as any)?.name || '系统';

    const emailData = {
      meetingTitle: meeting.summary?.title || meeting.title,
      meetingDate: meeting.startTime,
      duration: meeting.summary?.duration || this.calculateDuration(meeting.startTime, meeting.endTime),
      roomName,
      organizer: organizerName,
      overview: meeting.summary?.overview || '',
      decisions: meeting.summary?.decisions || [],
      todos: meeting.summary?.todos || [],
      keyPoints: meeting.summary?.keyPoints || [],
      transcription: meeting.transcription,
    };

    if (email) {
      const attendee = meeting.attendees.find(a => a.email === email);
      if (!attendee) {
        throw new HttpException('该邮箱不是参会人', HttpStatus.BAD_REQUEST);
      }
      return this.emailService.sendMeetingSummary(
        { name: attendee.name, email },
        emailData,
      );
    } else {
      return this.sendMeetingSummaryEmails(meeting);
    }
  }

  async updateTodoStatus(meetingId: string, todoIndex: number, completed: boolean) {
    const meeting = await this.meetingModel.findById(meetingId);
    if (!meeting || !meeting.summary) {
      throw new HttpException('会议或摘要不存在', HttpStatus.NOT_FOUND);
    }

    if (todoIndex < 0 || todoIndex >= meeting.summary.todos.length) {
      throw new HttpException('待办事项索引无效', HttpStatus.BAD_REQUEST);
    }

    meeting.summary.todos[todoIndex].completed = completed;
    await meeting.save();

    return meeting.summary.todos[todoIndex];
  }

  async cancelMeeting(meetingId: string) {
    const meeting = await this.meetingModel.findById(meetingId);
    if (!meeting) {
      throw new HttpException('会议不存在', HttpStatus.NOT_FOUND);
    }

    meeting.status = 'cancelled';
    return meeting.save();
  }
}
import { Controller, Post, Get, Put, Delete, Body, Param, Query, HttpException, HttpStatus } from '@nestjs/common';
import { MeetingService } from './meeting.service';

@Controller('meetings')
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  @Post()
  async createMeeting(@Body() body: {
    bookingId: string;
    title: string;
    description?: string;
    roomId: string;
    organizerId: string;
    attendees: Array<{ userId: string; name: string; email: string }>;
    startTime: string;
    endTime: string;
  }) {
    return this.meetingService.createMeeting(
      body.bookingId,
      body.title,
      body.description,
      body.roomId,
      body.organizerId,
      body.attendees,
      new Date(body.startTime),
      new Date(body.endTime),
    );
  }

  @Post(':id/start')
  async startMeeting(@Param('id') meetingId: string) {
    return this.meetingService.startMeeting(meetingId);
  }

  @Post(':id/end')
  async endMeeting(
    @Param('id') meetingId: string,
    @Body() body?: { audio?: string },
  ) {
    return this.meetingService.endMeeting(meetingId, body?.audio);
  }

  @Post(':id/process-audio')
  async processMeetingAudio(
    @Param('id') meetingId: string,
    @Body() body: { audio: string },
  ) {
    return this.meetingService.processMeetingAudio(meetingId, body.audio);
  }

  @Get(':id')
  async getMeetingById(@Param('id') meetingId: string) {
    const meeting = await this.meetingService.getMeetingById(meetingId);
    if (!meeting) {
      throw new HttpException('会议不存在', HttpStatus.NOT_FOUND);
    }
    return meeting;
  }

  @Get()
  async getMeetingsByUser(
    @Query('userId') userId: string,
    @Query('status') status?: string,
  ) {
    if (!userId) {
      throw new HttpException('缺少userId参数', HttpStatus.BAD_REQUEST);
    }
    return this.meetingService.getMeetingsByUser(userId, status);
  }

  @Get(':id/transcription')
  async getMeetingTranscription(@Param('id') meetingId: string) {
    return this.meetingService.getMeetingTranscription(meetingId);
  }

  @Get(':id/summary')
  async getMeetingSummary(@Param('id') meetingId: string) {
    return this.meetingService.getMeetingSummary(meetingId);
  }

  @Post(':id/resend-email')
  async resendMeetingSummaryEmail(
    @Param('id') meetingId: string,
    @Body() body?: { email?: string },
  ) {
    return this.meetingService.resendMeetingSummaryEmail(meetingId, body?.email);
  }

  @Put(':id/todos/:index')
  async updateTodoStatus(
    @Param('id') meetingId: string,
    @Param('index') todoIndexStr: string,
    @Body() body: { completed: boolean },
  ) {
    const todoIndex = parseInt(todoIndexStr, 10);
    return this.meetingService.updateTodoStatus(meetingId, todoIndex, body.completed);
  }

  @Post(':id/cancel')
  async cancelMeeting(@Param('id') meetingId: string) {
    return this.meetingService.cancelMeeting(meetingId);
  }
}
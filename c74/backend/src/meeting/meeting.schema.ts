import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

class Attendee {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop()
  name: string;

  @Prop()
  email: string;

  @Prop({ default: false })
  emailSent: boolean;
}

class DecisionItem {
  @Prop({ required: true })
  content: string;

  @Prop()
  timestamp: string;

  @Prop()
  speaker: string;
}

class TodoItem {
  @Prop({ required: true })
  task: string;

  @Prop()
  assignee: string;

  @Prop()
  deadline: Date;

  @Prop({ default: false })
  completed: boolean;

  @Prop()
  timestamp: string;
}

class MeetingSummary {
  @Prop()
  title: string;

  @Prop()
  overview: string;

  @Prop({ type: [DecisionItem] })
  decisions: DecisionItem[];

  @Prop({ type: [TodoItem] })
  todos: TodoItem[];

  @Prop()
  keyPoints: string[];

  @Prop()
  duration: string;
}

@Schema()
export class Meeting extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Booking', required: true })
  bookingId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'Room' })
  roomId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  organizerId: Types.ObjectId;

  @Prop({ type: [Attendee] })
  attendees: Attendee[];

  @Prop()
  startTime: Date;

  @Prop()
  endTime: Date;

  @Prop({ default: 'scheduled' })
  status: 'scheduled' | 'recording' | 'processing' | 'completed' | 'cancelled';

  @Prop()
  audioFileUrl: string;

  @Prop()
  transcription: string;

  @Prop({ type: MeetingSummary })
  summary: MeetingSummary;

  @Prop()
  transcriptionId: string;

  @Prop()
  processingError: string;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop()
  completedAt: Date;
}

export const MeetingSchema = SchemaFactory.createForClass(Meeting);
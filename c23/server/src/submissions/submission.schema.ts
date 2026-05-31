import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SubmissionDocument = Submission & Document;

@Schema({ timestamps: true })
export class Submission {
  @Prop({ type: Types.ObjectId, ref: 'Form', required: true })
  formId: Types.ObjectId;

  @Prop({ type: Object, required: true })
  data: Record<string, any>;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  submittedBy: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const SubmissionSchema = SchemaFactory.createForClass(Submission);

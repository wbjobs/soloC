import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

class VoiceTemplate {
  @Prop({ required: true })
  embedding: number[];

  @Prop()
  numSamples: number;

  @Prop()
  avgNoiseLevel: number;

  @Prop()
  qualityScore: number;

  @Prop()
  fusionMethod: string;

  @Prop({ type: [String] })
  sampleHashes: string[];
}

@Schema()
export class User extends Document {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  voiceEmbedding: number[];

  @Prop({ type: VoiceTemplate })
  voiceTemplate: VoiceTemplate;

  @Prop({ default: false })
  voiceRegistered: boolean;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop()
  lastLoginAt: Date;

  @Prop({ default: 0 })
  loginAttempts: number;

  @Prop({ default: 0 })
  successfulLogins: number;
}

export const UserSchema = SchemaFactory.createForClass(User);
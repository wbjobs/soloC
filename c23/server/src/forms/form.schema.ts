import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { FormComponent, UserRole } from '../common/interfaces';

export type FormDocument = Form & Document;

@Schema({ timestamps: true })
export class Form {
  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop({ type: [{ type: Object }] })
  components: FormComponent[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({
    type: Object,
    default: {
      edit: [UserRole.ADMIN, UserRole.DESIGNER],
      view: [UserRole.ADMIN, UserRole.DESIGNER, UserRole.VIEWER],
      submit: [UserRole.ADMIN, UserRole.DESIGNER, UserRole.VIEWER],
    },
  })
  permissions: {
    edit: UserRole[];
    view: UserRole[];
    submit: UserRole[];
  };

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const FormSchema = SchemaFactory.createForClass(Form);

import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
import { Submission, SubmissionDocument } from './submission.schema';
import { FormsService } from '../forms/forms.service';
import { UserRole } from '../common/interfaces';

@Injectable()
export class SubmissionsService {
  constructor(
    @InjectModel(Submission.name) private submissionModel: Model<SubmissionDocument>,
    private formsService: FormsService,
  ) {}

  async create(
    formId: string,
    data: Record<string, any>,
    userId: string,
    userRole: UserRole,
  ): Promise<SubmissionDocument> {
    const canSubmit = await this.formsService.canSubmit(formId, userRole);
    if (!canSubmit) {
      throw new ForbiddenException('没有提交权限或表单已禁用');
    }
    const submission = new this.submissionModel({
      formId: new Types.ObjectId(formId),
      data,
      submittedBy: new Types.ObjectId(userId),
    });
    return submission.save();
  }

  async findAllByForm(formId: string, userRole: UserRole): Promise<SubmissionDocument[]> {
    const form = await this.formsService.findOne(formId, userRole);
    if (!form) {
      throw new NotFoundException('表单不存在');
    }
    return this.submissionModel.find({ formId: new Types.ObjectId(formId) })
      .populate('submittedBy', 'username')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string, formId: string, userRole: UserRole): Promise<SubmissionDocument> {
    await this.formsService.findOne(formId, userRole);
    const submission = await this.submissionModel.findById(id)
      .populate('submittedBy', 'username')
      .exec();
    if (!submission) {
      throw new NotFoundException('提交记录不存在');
    }
    return submission;
  }

  async exportToExcel(formId: string, userRole: UserRole): Promise<Buffer> {
    const form = await this.formsService.findOne(formId, userRole);
    const submissions = await this.findAllByForm(formId, userRole);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('表单数据');

    const headers = ['提交时间', '提交人', ...form.components.map((c) => c.label)];
    worksheet.addRow(headers);
    worksheet.getRow(1).font = { bold: true };

    submissions.forEach((submission) => {
      const row: any[] = [
        submission.createdAt ? submission.createdAt.toLocaleString() : '',
        submission.submittedBy ? (submission.submittedBy as any).username : '',
      ];
      form.components.forEach((component) => {
        const value = submission.data[component.id];
        if (Array.isArray(value)) {
          row.push(value.join(', '));
        } else {
          row.push(value ?? '');
        }
      });
      worksheet.addRow(row);
    });

    worksheet.columns.forEach((column) => {
      column.width = 20;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as unknown as Uint8Array);
  }
}

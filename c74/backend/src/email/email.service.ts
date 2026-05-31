import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

interface Attendee {
  name: string;
  email: string;
}

interface Decision {
  content: string;
  speaker: string;
}

interface Todo {
  task: string;
  assignee: string;
  deadline?: Date;
}

interface MeetingSummaryEmailData {
  meetingTitle: string;
  meetingDate: Date;
  duration: string;
  roomName: string;
  organizer: string;
  overview: string;
  decisions: Decision[];
  todos: Todo[];
  keyPoints: string[];
  transcription?: string;
}

@Injectable()
export class EmailService {
  private transporter;
  private fromEmail: string;

  constructor(private configService: ConfigService) {
    this.fromEmail = this.configService.get<string>('EMAIL_FROM') || 'your-email@gmail.com';
    
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('EMAIL_HOST') || 'smtp.gmail.com',
      port: this.configService.get<number>('EMAIL_PORT') || 587,
      secure: this.configService.get<boolean>('EMAIL_SECURE') || false,
      auth: {
        user: this.configService.get<string>('EMAIL_USER') || 'your-email@gmail.com',
        pass: this.configService.get<string>('EMAIL_PASS') || 'your-app-password',
      },
    });
  }

  async sendBookingConfirmation(to: string, qrCode: string, bookingDetails: any) {
    const mailOptions = {
      from: this.fromEmail,
      to,
      subject: '会议室预订确认',
      html: `
        <h1>会议室预订成功！</h1>
        <p>请在会议室门口扫描以下二维码进行验证：</p>
        <img src="${qrCode}" alt="QR Code" />
        <p>预订详情：</p>
        <ul>
          <li>会议室：${bookingDetails.roomName}</li>
          <li>时间：${bookingDetails.startTime} - ${bookingDetails.endTime}</li>
        </ul>
      `,
    };

    return this.transporter.sendMail(mailOptions);
  }

  async sendMeetingSummary(attendee: Attendee, meetingData: MeetingSummaryEmailData) {
    const htmlContent = this.generateMeetingSummaryEmail(attendee, meetingData);
    
    const mailOptions = {
      from: this.fromEmail,
      to: attendee.email,
      subject: `会议纪要: ${meetingData.meetingTitle}`,
      html: htmlContent,
      attachments: meetingData.transcription ? [
        {
          filename: `会议记录_${meetingData.meetingTitle}_${this.formatDate(meetingData.meetingDate)}.txt`,
          content: meetingData.transcription,
          contentType: 'text/plain',
        },
      ] : [],
    };

    try {
      await this.transporter.sendMail(mailOptions);
      return { success: true, email: attendee.email };
    } catch (error) {
      console.error(`Failed to send email to ${attendee.email}:`, error);
      return { success: false, email: attendee.email, error: error.message };
    }
  }

  async sendMeetingSummaryBatch(attendees: Attendee[], meetingData: MeetingSummaryEmailData) {
    const results = [];
    
    for (const attendee of attendees) {
      const result = await this.sendMeetingSummary(attendee, meetingData);
      results.push(result);
    }
    
    return {
      total: attendees.length,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      details: results,
    };
  }

  private generateMeetingSummaryEmail(attendee: Attendee, data: MeetingSummaryEmailData): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; }
    .header h1 { margin: 0; font-size: 28px; }
    .header p { margin: 10px 0 0; opacity: 0.9; }
    .section { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .section h2 { color: #2c3e50; border-bottom: 2px solid #667eea; padding-bottom: 10px; margin-top: 0; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
    .info-item { background: white; padding: 15px; border-radius: 6px; }
    .info-label { font-weight: bold; color: #667eea; display: block; margin-bottom: 5px; }
    .decision-item, .todo-item { background: white; padding: 15px; border-radius: 6px; margin-bottom: 10px; border-left: 4px solid; }
    .decision-item { border-left-color: #27ae60; }
    .todo-item { border-left-color: #f39c12; }
    .todo-meta { margin-top: 8px; font-size: 14px; color: #666; }
    .key-points li { margin-bottom: 8px; }
    .overview { background: white; padding: 20px; border-radius: 8px; line-height: 1.8; }
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #999; }
    .high-priority { background: #fff3cd; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📋 会议纪要</h1>
    <p>您好 ${attendee.name}，这是「${data.meetingTitle}」的会议纪要</p>
  </div>

  <div class="section">
    <h2>📅 会议信息</h2>
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">会议时间</span>
        ${this.formatDateTime(data.meetingDate)}
      </div>
      <div class="info-item">
        <span class="info-label">会议时长</span>
        ${data.duration}
      </div>
      <div class="info-item">
        <span class="info-label">会议室</span>
        ${data.roomName}
      </div>
      <div class="info-item">
        <span class="info-label">组织者</span>
        ${data.organizer}
      </div>
    </div>
  </div>

  <div class="section">
    <h2>📝 会议概述</h2>
    <div class="overview">${data.overview}</div>
  </div>

  ${data.decisions && data.decisions.length > 0 ? `
  <div class="section">
    <h2>✅ 会议决策 (${data.decisions.length})</h2>
    ${data.decisions.map(d => `
      <div class="decision-item">
        <div>${d.content}</div>
        ${d.speaker ? `<div style="margin-top: 8px; font-size: 14px; color: #666;">发言人: ${d.speaker}</div>` : ''}
      </div>
    `).join('')}
  </div>
  ` : ''}

  ${data.todos && data.todos.length > 0 ? `
  <div class="section">
    <h2>📋 待办事项 (${data.todos.length})</h2>
    ${data.todos.map(t => `
      <div class="todo-item">
        <div><strong>任务:</strong> ${t.task}</div>
        <div class="todo-meta">
          ${t.assignee ? `👤 负责人: ${t.assignee}` : ''}
          ${t.deadline ? ` | 📅 截止: ${this.formatDate(t.deadline)}` : ''}
        </div>
      </div>
    `).join('')}
  </div>
  ` : ''}

  ${data.keyPoints && data.keyPoints.length > 0 ? `
  <div class="section">
    <h2>💡 关键要点</h2>
    <ul class="key-points">
      ${data.keyPoints.map(k => `<li>${k}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  <div class="footer">
    <p>此邮件由智能会议室系统自动发送</p>
    <p>如有疑问，请联系会议组织者 ${data.organizer}</p>
  </div>
</body>
</html>
    `;
  }

  private formatDateTime(date: Date): string {
    if (!date) return '待定';
    return new Date(date).toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private formatDate(date: Date): string {
    if (!date) return '';
    return new Date(date).toLocaleDateString('zh-CN');
  }
}
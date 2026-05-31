import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as qrcode from 'qrcode';
import * as crypto from 'crypto';
import { Booking } from './booking.schema';
import { EmailService } from '../email/email.service';

@Injectable()
export class BookingService {
  constructor(
    @InjectModel('Booking') private bookingModel: Model<Booking>,
    private emailService: EmailService,
  ) {}

  async create(userId: string, roomId: string, startTime: Date, endTime: Date) {
    const conflict = await this.bookingModel.findOne({
      roomId: new Types.ObjectId(roomId),
      $or: [
        { startTime: { $lt: endTime, $gte: startTime } },
        { endTime: { $gt: startTime, $lte: endTime } },
        { startTime: { $lte: startTime }, endTime: { $gte: endTime } },
      ],
    });

    if (conflict) {
      throw new HttpException('该时间段会议室已被预订', HttpStatus.CONFLICT);
    }

    const verificationCode = crypto.randomBytes(16).toString('hex');
    const qrData = JSON.stringify({
      bookingId: '',
      verificationCode,
      userId,
    });

    const qrCodeData = await qrcode.toDataURL(qrData);

    const booking = new this.bookingModel({
      userId: new Types.ObjectId(userId),
      roomId: new Types.ObjectId(roomId),
      startTime,
      endTime,
      qrCode: qrCodeData,
      verificationCode,
    });

    await booking.save();

    const updatedQrData = JSON.stringify({
      bookingId: booking._id,
      verificationCode,
      userId,
    });

    const encryptedQr = crypto.createCipheriv('aes-256-cbc', Buffer.from('meetingroomsecret12345678901234'), Buffer.from('1234567890123456'))
      .update(updatedQrData, 'utf8', 'hex');

    booking.qrCode = await qrcode.toDataURL(encryptedQr);
    await booking.save();

    return booking;
  }

  async verifyQrCode(encryptedData: string) {
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from('meetingroomsecret12345678901234'), Buffer.from('1234567890123456'));
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    const data = JSON.parse(decrypted);
    const booking = await this.bookingModel.findById(data.bookingId);

    if (!booking) {
      throw new HttpException('预订不存在', HttpStatus.NOT_FOUND);
    }

    if (booking.verificationCode !== data.verificationCode) {
      throw new HttpException('验证失败', HttpStatus.UNAUTHORIZED);
    }

    booking.isVerified = true;
    await booking.save();

    return { success: true, booking };
  }

  async getHeatmapData(startDate: Date, endDate: Date) {
    const bookings = await this.bookingModel.find({
      startTime: { $gte: startDate },
      endTime: { $lte: endDate },
    }).populate('roomId');

    const heatmap = {};
    
    bookings.forEach(booking => {
      const roomName = (booking.roomId as any).name;
      const hour = new Date(booking.startTime).getHours();
      const key = `${roomName}-${hour}`;
      heatmap[key] = (heatmap[key] || 0) + 1;
    });

    return heatmap;
  }

  findByUser(userId: string) {
    return this.bookingModel.find({ userId: new Types.ObjectId(userId) })
      .populate('roomId')
      .sort({ startTime: -1 });
  }

  findAll() {
    return this.bookingModel.find()
      .populate('userId')
      .populate('roomId')
      .sort({ startTime: -1 });
  }
}
import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { BookingService } from './booking.service';

@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  async create(@Body() body: { userId: string; roomId: string; startTime: string; endTime: string }) {
    return this.bookingService.create(
      body.userId,
      body.roomId,
      new Date(body.startTime),
      new Date(body.endTime),
    );
  }

  @Post('verify')
  async verifyQrCode(@Body() body: { encryptedData: string }) {
    return this.bookingService.verifyQrCode(body.encryptedData);
  }

  @Get('heatmap')
  async getHeatmap(@Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.bookingService.getHeatmapData(new Date(startDate), new Date(endDate));
  }

  @Get()
  async findAll() {
    return this.bookingService.findAll();
  }
}
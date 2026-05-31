import { Controller, Get, Post, Body } from '@nestjs/common';
import { RoomService } from './room.service';

@Controller('rooms')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Post()
  async create(@Body() body: { name: string; capacity: number; location: string }) {
    return this.roomService.create(body.name, body.capacity, body.location);
  }

  @Get()
  async findAll() {
    return this.roomService.findAll();
  }
}
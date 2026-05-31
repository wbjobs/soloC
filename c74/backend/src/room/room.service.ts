import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Room } from './room.schema';

@Injectable()
export class RoomService {
  constructor(@InjectModel('Room') private roomModel: Model<Room>) {}

  async create(name: string, capacity: number, location: string) {
    const room = new this.roomModel({ name, capacity, location });
    return room.save();
  }

  findAll() {
    return this.roomModel.find({ isActive: true });
  }

  findById(id: string) {
    return this.roomModel.findById(id);
  }
}
import { Module } from '@nestjs/common';
import { MuseumGateway } from './websocket.gateway';
import { UserService } from './user.service';

@Module({
  providers: [MuseumGateway, UserService],
  exports: [UserService],
})
export class WebSocketModule {}

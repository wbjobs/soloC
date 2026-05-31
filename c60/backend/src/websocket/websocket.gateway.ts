import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UserService } from './user.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'museum',
})
export class MuseumGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly userService: UserService) {}

  handleConnection(@ConnectedSocket() client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    const user = this.userService.removeUser(client.id);
    if (user) {
      this.server.to(user.roomId).emit('userLeft', {
        userId: user.id,
        username: user.username,
      });
    }
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; username: string },
  ) {
    const { roomId, username } = data;

    client.join(roomId);

    const user = this.userService.addUser({
      id: client.id,
      username,
      roomId,
      position: { x: 0, y: 1.6, z: 5 },
      rotation: { x: 0, y: 0, z: 0 },
    });

    const usersInRoom = this.userService.getUsersInRoom(roomId);

    client.emit('roomJoined', {
      userId: client.id,
      users: usersInRoom.filter(u => u.id !== client.id),
    });

    client.to(roomId).emit('userJoined', {
      userId: user.id,
      username: user.username,
      position: user.position,
      rotation: user.rotation,
    });
  }

  @SubscribeMessage('updatePosition')
  handleUpdatePosition(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } },
  ) {
    const user = this.userService.getUser(client.id);
    if (user) {
      user.position = data.position;
      user.rotation = data.rotation;

      client.to(user.roomId).emit('userMoved', {
        userId: client.id,
        position: data.position,
        rotation: data.rotation,
      });
    }
  }

  @SubscribeMessage('voiceSignal')
  handleVoiceSignal(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { targetUserId: string; signal: any },
  ) {
    const user = this.userService.getUser(client.id);
    if (user) {
      client.to(data.targetUserId).emit('voiceSignal', {
        senderId: client.id,
        signal: data.signal,
      });
    }
  }

  @SubscribeMessage('chatMessage')
  handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { message: string },
  ) {
    const user = this.userService.getUser(client.id);
    if (user) {
      this.server.to(user.roomId).emit('chatMessage', {
        userId: client.id,
        username: user.username,
        message: data.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('pointing')
  handlePointing(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { position: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number } },
  ) {
    const user = this.userService.getUser(client.id);
    if (user) {
      client.to(user.roomId).emit('userPointing', {
        userId: client.id,
        position: data.position,
        direction: data.direction,
      });
    }
  }
}

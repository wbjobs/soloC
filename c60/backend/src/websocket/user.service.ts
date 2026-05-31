import { Injectable } from '@nestjs/common';

export interface User {
  id: string;
  username: string;
  roomId: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

@Injectable()
export class UserService {
  private users: Map<string, User> = new Map();

  addUser(user: User): User {
    this.users.set(user.id, user);
    return user;
  }

  removeUser(userId: string): User | undefined {
    const user = this.users.get(userId);
    if (user) {
      this.users.delete(userId);
    }
    return user;
  }

  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  getUsersInRoom(roomId: string): User[] {
    return Array.from(this.users.values()).filter(user => user.roomId === roomId);
  }

  getRoomUserCount(roomId: string): number {
    return this.getUsersInRoom(roomId).length;
  }

  getAllRooms(): string[] {
    const rooms = new Set<string>();
    this.users.forEach(user => rooms.add(user.roomId));
    return Array.from(rooms);
  }
}

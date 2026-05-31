import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { JwtPayload } from '../common/interfaces';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string): Promise<any> {
    const user = await this.usersService.findOne(username);
    if (user && await bcrypt.compare(password, user.password)) {
      const { password, ...result } = user.toObject();
      return result;
    }
    return null;
  }

  async login(username: string, password: string) {
    const user = await this.validateUser(username, password);
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const payload: JwtPayload = { 
      username: user.username, 
      sub: user._id.toString(), 
      role: user.role 
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
      },
    };
  }

  async register(username: string, password: string, role: string = 'viewer') {
    const existingUser = await this.usersService.findOne(username);
    if (existingUser) {
      throw new UnauthorizedException('用户名已存在');
    }
    const user = await this.usersService.create(username, password, role);
    const { password: _, ...result } = user.toObject();
    return result;
  }
}

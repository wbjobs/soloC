import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FormsModule } from './forms/forms.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { AuthService } from './auth/auth.service';
import { UserRole } from './common/interfaces';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    FormsModule,
    SubmissionsModule,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private authService: AuthService) {}

  async onModuleInit() {
    try {
      await this.authService.register('admin', 'admin123', UserRole.ADMIN);
      console.log('默认管理员账户已创建: admin / admin123');
    } catch (e) {
      console.log('默认管理员账户已存在');
    }
    try {
      await this.authService.register('designer', 'designer123', UserRole.DESIGNER);
      console.log('默认设计师账户已创建: designer / designer123');
    } catch (e) {
      console.log('默认设计师账户已存在');
    }
    try {
      await this.authService.register('viewer', 'viewer123', UserRole.VIEWER);
      console.log('默认查看者账户已创建: viewer / viewer123');
    } catch (e) {
      console.log('默认查看者账户已存在');
    }
  }
}

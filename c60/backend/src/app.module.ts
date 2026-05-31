import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { WebSocketModule } from './websocket/websocket.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/assets',
    }),
    ArtifactsModule,
    WebSocketModule,
  ],
})
export class AppModule {}

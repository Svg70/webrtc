import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  ClassSerializerInterceptor,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { winstonLogger } from './common/logger/winston.util';
import * as passport from 'passport';
import * as cookieParser from 'cookie-parser';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as expressBasicAuth from 'express-basic-auth';

class Application {
  private logger = new Logger(Application.name);
  private DEV_MODE: boolean;
  private PORT: string;
  private corsOriginList: string[] = ['http://localhost:3000'];
  private ADMIN_USER: string;
  private ADMIN_PASSWORD: string;
  private Domain: string;

  constructor(private server: NestExpressApplication) {
    this.server = server;

    this.DEV_MODE = process.env.NODE_ENV === 'production' ? false : true;
    this.PORT = process.env.PORT || '5001';
    this.corsOriginList = process.env.CORS_ORIGIN_LIST
      ? process.env.CORS_ORIGIN_LIST.split(',').map((origin) => origin.trim())
      : ['*'];
    this.ADMIN_USER = process.env.ADMIN_USER || 'username';
    this.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';
    this.Domain = process.env.DOMAIN || 'http://localhost';
  }

  // docs secure
  private setUpBasicAuth() {
    this.server.use(
      ['/api-docs', '/docs', '/docs-json'],
      expressBasicAuth({
        challenge: true,
        users: {
          [this.ADMIN_USER]: this.ADMIN_PASSWORD,
        },
      }),
    );
  }

  private setUpOpenAPIMidleware() {
    SwaggerModule.setup(
      'api-docs',
      this.server,
      SwaggerModule.createDocument(
        this.server,
        new DocumentBuilder()
          .setTitle('API DOCS')
          .setDescription('nestJS boilerplate')
          .setVersion('1.0')
          .build(),
      ),
    );
  }

  private async setUpGlobalMiddleware() {
    this.server.use(cookieParser());
    this.setUpBasicAuth();
    this.setUpOpenAPIMidleware();
    this.server.useGlobalPipes(
      new ValidationPipe({
        transform: true,
      }),
    );
    this.server.use(passport.initialize());
    this.server.useGlobalInterceptors(
      new ClassSerializerInterceptor(this.server.get(Reflector)),
    );
  }

  async bootstrap() {
    await this.setUpGlobalMiddleware();
    await this.server.listen(this.PORT);
  }

  startLog() {
    if (this.DEV_MODE) {
      this.logger.log(`✅ Server on ${this.Domain}:${this.PORT}`);
    } else {
      this.logger.log(`✅ Server on port ${this.PORT}...`);
    }
  }

  errorLog(error: string) {
    this.logger.error(`🆘 Server error ${error}`);
  }
}

async function init(): Promise<void> {
    const corsOriginList = process.env.CORS_ORIGIN_LIST
    ? process.env.CORS_ORIGIN_LIST.split(',').map((origin) => origin.trim())
    : ['*'];
  const server = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: winstonLogger,
    cors: {
      origin: (requestOrigin, callback) => {
        if (
          !requestOrigin ||
          corsOriginList.includes(requestOrigin) ||
          corsOriginList.includes('*')
        ) {
          // <--- ИСПОЛЬЗУЕМ whitelist НАПРЯМУЮ
          callback(null, true);
        } else {
          this.logger.warn(`CORS: Origin ${requestOrigin} not allowed.`);
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    },
  });
  const app = new Application(server);
  await app.bootstrap();

  app.startLog();
}

init().catch((error) => {
  new Logger('init').error(error);
});

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatMessage } from './chat.entity';
import { AuthKeycloakModule } from 'src/keycloak/auth.keycloak.module';
import { ChatController } from './chat.controller';
import { TokenVerificationService } from 'src/keycloak/token-verification.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChatMessage]), AuthKeycloakModule],
  providers: [ChatGateway, ChatService, TokenVerificationService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}

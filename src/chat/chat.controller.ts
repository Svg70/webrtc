// src/chat/chat.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatMessage } from './chat.entity';
import { Public } from 'nest-keycloak-connect';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('history/:auctionId')
  @Public()
  getHistory(@Param('auctionId') auctionId: string): Promise<ChatMessage[]> {
    return this.chatService.findByAuction(auctionId);
  }
}

// src/chat/chat.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from './chat.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage)
    private readonly repo: Repository<ChatMessage>,
  ) {}

  create(dto: Partial<ChatMessage>) {
    const msg = this.repo.create(dto);
    return this.repo.save(msg);
  }

  findByAuction(auctionId: string) {
    return this.repo.find({ where: { auctionId } });
  }
}

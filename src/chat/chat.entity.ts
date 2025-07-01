// src/chat/chat.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() auctionId: string;
  @Column() userId: string;
  @Column() username: string;
  @Column() text: string;
  @CreateDateColumn() createdAt: Date;
}

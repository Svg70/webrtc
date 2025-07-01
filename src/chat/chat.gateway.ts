import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  WsResponse,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import {
  Resource,
} from 'nest-keycloak-connect';
import { ChatService } from './chat.service';
import { WsAuthGuard } from 'src/keycloak/wsuser.decorator';

@Resource('chat')
@WebSocketGateway({
  namespace: 'chat',
  cors: {
    origin: process.env.CORS_ORIGIN_LIST
      ? process.env.CORS_ORIGIN_LIST.split(',').map((origin) => origin.trim())
      : ['*'],
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private readonly chatService: ChatService) {}

  async handleConnection(@ConnectedSocket() client: Socket) {
    // at this point nest-keycloak-connect has validated the token
    console.log(`Chat client connected: ${client.id}`);
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    console.log(`Chat client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinAuction')
  async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { auctionId: string },
  ) {
    const room = `auction_${payload.auctionId}`;
    client.join(room);
    client.emit('joinedAuction', room);
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('auctionMessage')
  async onMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { auctionId: string; text: string },
  ): Promise<WsResponse<any>> {
    const user = (client as any).user;

    if (!user?.sub || !user?.preferred_username) {
      throw new WsException('User not valid');
    }

    const now = new Date().toISOString();
    // Save to DB
    const msg = await this.chatService.create({
      auctionId: payload.auctionId,
      text: payload.text,
      userId: user.sub,
      username: user.preferred_username,
      //userId: client.handshake.auth['kc_tokenParsed'].sub, // depending on how keycloak sets user
    });

    // Broadcast
    const room = `auction_${payload.auctionId}`;
    this.server.to(room).emit('auctionMessage', {
      id: msg.id,
      text: msg.text,
      userId: msg.userId,
      username: user.preferred_username,
      createdAt: now,
    });

    return { event: 'auctionMessageAck', data: { success: true } };
  }
}

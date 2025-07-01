import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JoinChannelDto } from './dto/join-channel.dto';
import { RoomService } from '../mediasoup/room/room.service';
import { TransportService } from '../mediasoup/transport/transport.service';
import { ProducerConsumerService } from '../mediasoup/producer-consumer/producer-consumer.service';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN_LIST
      ? process.env.CORS_ORIGIN_LIST.split(',').map((origin) => origin.trim())
      : ['*'],
    credentials: true,
  },
})
export class SignalingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly roomService: RoomService,
    private readonly transportService: TransportService,
    private readonly producerConsumerService: ProducerConsumerService
  ) { }

  afterInit() {
    console.log(`WebSocket gateway initialized`);
  }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    const rooms = Array.from(client.rooms);
    for (const roomId of rooms) {
      if (roomId === client.id) continue;
      // Закрываем медиа-ресурсы отключившегося
      await this.producerConsumerService.closePeerResources(roomId, client.id);
      client.leave(roomId);
      client.to(roomId).emit("peer-left", { peerId: client.id });
      const room = this.roomService.getRoom(roomId);
      if (room && room.peers.size === 0) {
        this.roomService.removeRoom(roomId);
      }
    }
  }

  @SubscribeMessage("join-room")
  async handleJoinChannel(
    @MessageBody() dto: JoinChannelDto,
    @ConnectedSocket() client: Socket
  ) {
    const { roomId, peerId } = dto;

    try {
      // 1) Создаём или берём существующую комнату
      const newRoom = await this.roomService.createRoom(roomId);

      // 2) Создаём send- и recv-транспорты
      const sendTransportOptions =
        await this.transportService.createWebRtcTransport(
          roomId,
          peerId,
          "send"
        );
      const recvTransportOptions =
        await this.transportService.createWebRtcTransport(
          roomId,
          peerId,
          "recv"
        );

      // 3) Клиент входит в Socket.io-комнату, добавляем peer в RoomService
      client.join(roomId);
      this.roomService.addPeerToRoom(roomId, peerId);

      // 4) Берём список всех peerId, уже находящихся в комнате
      const room = this.roomService.getRoom(roomId)!;
      const peerIds = Array.from(room.peers.keys());

      // 5) Собираем existingProducers (audio/video) для нового peer
      const existingProducers: Array<{
        producerId: string;
        peerId: string;
        kind: "audio" | "video";
      }> = [];
      for (const [otherPeerId, peer] of room.peers) {
        if (otherPeerId === peerId) continue;
        for (const { producer } of peer.producers.values()) {
          existingProducers.push({
            producerId: producer.id,
            peerId: otherPeerId,
            kind: producer.kind as "audio" | "video",
          });
        }
      }

      // 6) Собираем existingDataProducers (SCTP «control-канал») для нового peer
      const existingDataProducers: Array<{
        dataProducerId: string;
        peerId: string;
      }> = [];
      for (const [otherPeerId, peer] of room.peers) {
        if (otherPeerId === peerId) continue;
        for (const { dataProducer } of peer.dataProducers.values()) {
          existingDataProducers.push({
            dataProducerId: dataProducer.id,
            peerId: otherPeerId,
          });
        }
      }

      // 7) Уведомляем остальных в комнате о появлении нового peer
      console.log(
        `SERVER → отправляем new-peer: peerId = ${peerId} в room = ${roomId}`
      );
      client.to(roomId).emit("new-peer", { peerId });

      // 8) Возвращаем в callback все параметры
      return {
        sendTransportOptions,
        recvTransportOptions,
        rtpCapabilities: newRoom.router.router.rtpCapabilities,
        peerIds,
        existingProducers,
        existingDataProducers,
      };
    } catch (error) {
      console.error("join-room error:", error);
      return { error: (error as Error).message };
    }
  }

  @SubscribeMessage("leave-room")
  async handleLeaveRoom(@ConnectedSocket() client: Socket) {
    const rooms = Array.from(client.rooms);
    for (const roomId of rooms) {
      if (roomId === client.id) continue;
      const room = this.roomService.getRoom(roomId);
      if (room) {
        await this.producerConsumerService.closePeerResources(
          roomId,
          client.id
        );
        client.leave(roomId);
        client.to(roomId).emit("peer-left", { peerId: client.id });
        if (room.peers.size === 0) {
          this.roomService.removeRoom(roomId);
        }
      }
    }
    return { left: true };
  }

  @SubscribeMessage("connect-transport")
  async handleConnectTransport(
    @MessageBody()
    data: {
      roomId: string;
      peerId: string;
      dtlsParameters: any;
      transportId: string;
    },
    @ConnectedSocket() client: Socket
  ) {
    const { roomId, peerId, dtlsParameters, transportId } = data;
    const room = this.roomService.getRoom(roomId);
    const peer = room?.peers.get(peerId);
    if (!peer) {
      return { error: "Peer not found" };
    }
    const transportData = peer.transports.get(transportId);
    if (!transportData) {
      return { error: "Transport not found" };
    }
    await transportData.transport.connect({ dtlsParameters });
    return { connected: true };
  }

  @SubscribeMessage("produce")
  async handleProduce(
    @MessageBody()
    data: {
      roomId: string;
      peerId: string;
      kind: "audio" | "video";
      transportId: string;
      rtpParameters: any;
    },
    @ConnectedSocket() client: Socket
  ) {
    const { roomId, peerId, kind, transportId, rtpParameters } = data;
    try {
      const producerId = await this.producerConsumerService.createProducer({
        roomId,
        peerId,
        transportId,
        kind,
        rtpParameters,
      });
      console.log(
        `SERVER → отправляем new-producer: producerId = ${producerId}, peerId = ${peerId}, kind = ${kind}`
      );
      client.to(roomId).emit("new-producer", { producerId, peerId, kind });
      return { producerId };
    } catch (error) {
      console.error("produce error:", error);
      return { error: (error as Error).message };
    }
  }

  @SubscribeMessage("consume")
  async handleConsume(
    @MessageBody()
    data: {
      roomId: string;
      peerId: string;
      producerId: string;
      rtpCapabilities: any;
      transportId: string;
    },
    @ConnectedSocket() client: Socket
  ) {
    const { roomId, peerId, producerId, rtpCapabilities, transportId } = data;
    try {
      const consumerData =
        await this.producerConsumerService.createConsumer({
          roomId,
          peerId,
          producerId,
          transportId,
          rtpCapabilities,
        });
      return { consumerData };
    } catch (error) {
      console.error("consume error:", error);
      return { error: (error as Error).message };
    }
  }

  @SubscribeMessage("create-data-producer")
  async handleCreateDataProducer(
    @MessageBody()
    data: {
      roomId: string;
      peerId: string;
      transportId: string;
      sctpStreamParameters: any;
      label: string;
      protocol: string;
    },
    @ConnectedSocket() client: Socket
  ) {
    const {
      roomId,
      peerId,
      transportId,
      sctpStreamParameters,
      label,
      protocol,
    } = data;
    try {
      const dataProducerId =
        await this.producerConsumerService.createDataProducer({
          roomId,
          peerId,
          transportId,
          kind: "data",
          sctpStreamParameters,
          label,
          protocol,
        });
      console.log(
        `SERVER → отправляем new-data-producer: dataProducerId = ${dataProducerId}, peerId = ${peerId}`
      );
      client.to(roomId).emit("new-data-producer", { dataProducerId, peerId });
      return { dataProducerId };
    } catch (error) {
      console.error("create-data-producer error:", error);
      return { error: (error as Error).message };
    }
  }

  @SubscribeMessage("consume-data")
  async handleConsumeData(
    @MessageBody()
    data: {
      roomId: string;
      peerId: string;
      dataProducerId: string;
      transportId: string;
      sctpStreamCapabilities: any;
    },
    @ConnectedSocket() client: Socket
  ) {
    const { roomId, peerId, dataProducerId, transportId, sctpStreamCapabilities } =
      data;
    try {
      const dataConsumerParams =
        await this.producerConsumerService.createDataConsumer({
          roomId,
          peerId,
          producerId: dataProducerId,
          transportId,
          sctpStreamCapabilities,
        });
      return { dataConsumerParams };
    } catch (error) {
      console.error("consume-data error:", error);
      return { error: (error as Error).message };
    }
  }
}
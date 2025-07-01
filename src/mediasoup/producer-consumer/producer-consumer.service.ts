import { Injectable } from '@nestjs/common';
import { RoomService } from '../room/room.service';
import type { IConsumeParams, IProduceParams } from '../producer-consumer/producer-consumer.interface';
import type {
  Consumer,
  Producer,
  DataProducer,
  DataConsumer,
  WebRtcTransport
} from 'mediasoup/node/lib/types';


@Injectable()
export class ProducerConsumerService {
  constructor(private readonly roomService: RoomService) { }

  // Создаёт только media-Producer (audio или video).
  public async createProducer(params: IProduceParams): Promise<string> {
    const { roomId, peerId, kind, rtpParameters, transportId } = params;

    if (kind === 'data') {
      throw new Error('Для data-канала используйте createDataProducer()');
    }

    const room = this.roomService.getRoom(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    const peer = room.peers.get(peerId);
    if (!peer) {
      throw new Error(`Peer ${peerId} not found in room ${roomId}`);
    }

    const transportData = peer.transports.get(transportId);
    if (!transportData) {
      throw new Error(`Transport ${transportId} not found for peer ${peerId}`);
    }
    const transport: WebRtcTransport = transportData.transport;

    // 🚩 Вызываем produce({ kind, rtpParameters }) только для audio|video
    const producer: Producer = await transport.produce({
      kind,
      rtpParameters: rtpParameters!,
    });
    peer.producers.set(producer.id, { producer });
    return producer.id;
  }

  // Создаёт только data-Producer (SCTP-канал).
  public async createDataProducer(params: IProduceParams): Promise<string> {
    const {
      roomId,
      peerId,
      transportId,
      sctpStreamParameters,
      label,
      protocol
    } = params;

    if (params.kind !== 'data') {
      throw new Error('Для media-канала используйте createProducer()');
    }

    const room = this.roomService.getRoom(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }
    const peer = room.peers.get(peerId);
    if (!peer) {
      throw new Error(`Peer ${peerId} not found in room ${roomId}`);
    }

    const transportData = peer.transports.get(transportId);
    if (!transportData) {
      throw new Error(`Transport ${transportId} not found for peer ${peerId}`);
    }
    const transport: WebRtcTransport = transportData.transport;

    // 🚩 Производим DataProducer через produceData({...})
    const dataProducer: DataProducer = await transport.produceData({
      sctpStreamParameters: sctpStreamParameters!,
      label: label || '',
      protocol: protocol || '',
    });
    peer.dataProducers.set(dataProducer.id, { dataProducer });
    return dataProducer.id;
  }

  //  Создаёт только media-Consumer (audio или video).
  public async createConsumer(params: IConsumeParams): Promise<{
    id: string;
    producerId: string;
    kind: string;
    rtpParameters: any;
  }> {
    const { roomId, peerId, producerId, rtpCapabilities, transportId } = params;

    const room = this.roomService.getRoom(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    // Проверяем, что роутер может потреблять данный producerId с такими rtpCapabilities
    if (
      !room.router.router.canConsume({
        producerId,
        rtpCapabilities: rtpCapabilities!,
      })
    ) {
      throw new Error(`Cannot consume producer ${producerId}`);
    }

    const peer = room.peers.get(peerId)!;
    const transportData = peer.transports.get(transportId);
    if (!transportData) {
      throw new Error(`Transport ${transportId} not found for peer ${peerId}`);
    }
    const transport: WebRtcTransport = transportData.transport;

    // 🚩 Фактический media-consume
    const consumer: Consumer = await transport.consume({
      producerId,
      rtpCapabilities: rtpCapabilities!,
      paused: false,
    });
    peer.consumers.set(consumer.id, { consumer });

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    };
  }

  //  Создаёт только data-Consumer (SCTP-канал).
  public async createDataConsumer(params: IConsumeParams): Promise<{
    id: string;
    dataProducerId: string;
    sctpStreamParameters: any;
    label: string;
    protocol: string;
  }> {
    const {
      roomId,
      peerId,
      producerId, // это dataProducerId
      sctpStreamCapabilities,
      transportId
    } = params;

    const room = this.roomService.getRoom(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }
    const peer = room.peers.get(peerId)!;
    const transportData = peer.transports.get(transportId);
    if (!transportData) {
      throw new Error(`Transport ${transportId} not found for peer ${peerId}`);
    }
    const transport: WebRtcTransport = transportData.transport;

    // 🚩 Фактический data-consume. Обратите внимание: мы не передаём “id”,
    // consumeData ждёт только { dataProducerId, sctpStreamParameters } (и опционально label/protocol).
    const dataConsumer: DataConsumer = await transport.consumeData({
      dataProducerId: producerId,
      sctpStreamParameters: sctpStreamCapabilities!,
    } as any);
    peer.dataConsumers.set(dataConsumer.id, { dataConsumer });

    return {
      id: dataConsumer.id,
      dataProducerId: producerId,
      sctpStreamParameters: dataConsumer.sctpStreamParameters,
      label: dataConsumer.label,
      protocol: dataConsumer.protocol,
    };
  }

  //  Закрывает ВСЕ producer’ы, consumer’ы, dataProducer’ы и dataConsumer’ы для указанного peer
  //  * (вызывается, когда сокет отключается или peer покидает комнату).
  public async closePeerResources(roomId: string, peerId: string) {
    const room = this.roomService.getRoom(roomId);
    if (!room) return;
    const peer = room.peers.get(peerId);
    if (!peer) return;

    // Закрываем все media-producer
    for (const { producer } of peer.producers.values()) {
      producer.close();
    }
    peer.producers.clear();

    // Закрываем все media-consumer
    for (const { consumer } of peer.consumers.values()) {
      consumer.close();
    }
    peer.consumers.clear();

    // Закрываем все data-producer
    for (const { dataProducer } of peer.dataProducers.values()) {
      dataProducer.close();
    }
    peer.dataProducers.clear();

    // Закрываем все data-consumer
    for (const { dataConsumer } of peer.dataConsumers.values()) {
      dataConsumer.close();
    }
    peer.dataConsumers.clear();

    // Закрываем все WebRtcTransport
    for (const { transport } of peer.transports.values()) {
      transport.close();
    }
    peer.transports.clear();

    room.peers.delete(peerId);
  }
}

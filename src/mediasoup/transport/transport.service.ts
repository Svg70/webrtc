import { Injectable } from '@nestjs/common';
import { RoomService } from '../room/room.service';
import { ITransportOptions } from './transport.interface';
import { WebRtcTransport } from 'mediasoup/node/lib/types';
import { webRtcTransport_options } from '../media.config';

@Injectable()
export class TransportService {
  constructor(private readonly roomService: RoomService) { }

  public async createWebRtcTransport(
    roomId: string,
    peerId: string,
    direction: 'send' | 'recv',
  ): Promise<ITransportOptions> {
    const room = this.roomService.getRoom(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);

    // Включаем SCTP при создании:
    const transport: WebRtcTransport =
      await room.router.router.createWebRtcTransport({
        ...webRtcTransport_options,
        enableSctp: true,
        numSctpStreams: { OS: 1024, MIS: 1024 },
        appData: { peerId, clientDirection: direction },
      });

    // Сохраняем этот транспорт в peer внутри комнаты
    this.roomService.addPeerToRoom(roomId, peerId);
    const peer = room.peers.get(peerId)!;
    peer.transports.set(transport.id, { transport });

    // Возвращаем клиенту все параметры, в том числе sctpParameters
    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters,
    };
  }
}

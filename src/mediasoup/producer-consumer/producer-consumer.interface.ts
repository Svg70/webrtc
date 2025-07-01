export interface IProduceParams {
  roomId: string;
  peerId: string;
  transportId: string;
  kind: 'audio' | 'video' | 'data';

  // для медиа-producer
  rtpParameters?: any;

  // для data-producer
  sctpStreamParameters?: any;
  label?: string;
  protocol?: string;
}

export interface IConsumeParams {
  roomId: string;
  peerId: string;
  transportId: string;

  // ID Producer’а (media или data)
  producerId: string;

  // для медиа-Consumer
  rtpCapabilities?: any;

  // для data-Consumer
  sctpStreamCapabilities?: any;
}



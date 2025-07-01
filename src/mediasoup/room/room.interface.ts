import type {
  Router,
  WebRtcTransport,
  Producer,
  Consumer,
  DataProducer,
  DataConsumer,
} from 'mediasoup/node/lib/types';

export interface IPeer {
  id: string;
  transports: Map<string, { transport: WebRtcTransport }>;
  producers: Map<string, { producer: Producer }>;
  consumers: Map<string, { consumer: Consumer }>;

  // ↓ Добавляем для поддержки data-каналов
  dataProducers: Map<string, { dataProducer: DataProducer }>;
  dataConsumers: Map<string, { dataConsumer: DataConsumer }>;
}

export interface IRoom {
  id: string;
  router: { router: Router };
  peers: Map<string, IPeer>;
}

import {
  DtlsParameters,
  IceCandidate,
  IceParameters,
  SctpParameters
} from 'mediasoup/node/lib/types';

export interface ITransportOptions {
  id: string;
  iceParameters: IceParameters;
  iceCandidates: IceCandidate[];
  dtlsParameters: DtlsParameters;
  sctpParameters?: SctpParameters;
}

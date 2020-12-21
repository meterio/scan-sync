import BigNumber from 'bignumber.js';

import { Token } from '../const';

export interface AuctionDist {
  address: string;
  amount: BigNumber;
  token: Token;
}

export interface Auction {
  id: string;
  startHeight: number;
  startEpoch: number;
  endHeight: number;
  endEpoch: number;
  createTime: number;
  releasedMTRG: BigNumber;
  reservedMTRG: BigNumber;
  reservedPrice: BigNumber;
  receivedMTR: BigNumber;
  actualPrice: BigNumber;
  distMTRG: AuctionDist[];
}
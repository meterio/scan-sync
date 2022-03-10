import BigNumber from 'bignumber.js';

import { BlockConcise } from './blockConcise.interface';

export interface TokenProfile {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  officialSite: string;
  totalSupply: BigNumber;
  holdersCount: BigNumber;
  transfersCount: BigNumber;

  master: string;
  creationTxHash: string;
  firstSeen: BlockConcise;
}

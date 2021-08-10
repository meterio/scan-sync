import BigNumber from 'bignumber.js';

import { BlockConcise } from './blockConcise.interface';

export interface TokenProfile {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  officialSite: string;
  totalSupply: BigNumber;
  circulation: BigNumber;
  holdersCount: BigNumber;
  transfersCount: BigNumber;

  creationTxHash?: string;
  firstSeen?: BlockConcise;
}

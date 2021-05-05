import BigNumber from 'bignumber.js';

import { Token } from '../const';
import { BlockConcise } from './blockConcise.interface';

export interface TokenBalance {
  address: string;
  tokenAddress: string;
  balance: BigNumber;
  symbol?: string;
  rank: number;

  lastUpdate: BlockConcise;
}

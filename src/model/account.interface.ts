import BigNumber from 'bignumber.js';

import { BlockConcise } from './blockConcise.interface';

export interface Account {
  address: string;
  mtrBalance: BigNumber;
  mtrgBalance: BigNumber;
  mtrRank: number;
  mtrgRank: number;

  code?: string;
  master?: string;

  firstSeen: BlockConcise;
  lastUpdate: BlockConcise;
}

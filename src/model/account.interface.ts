import BigNumber from 'bignumber.js';

import { BlockConcise } from './blockConcise.interface';

export interface Account {
  name?: string;
  address: string;
  mtrBalance: BigNumber;
  mtrgBalance: BigNumber;
  mtrBounded?: BigNumber;
  mtrgBounded?: BigNumber;

  mtrRank: number;
  mtrgRank: number;

  code?: string;
  master?: string;

  firstSeen: BlockConcise;
  lastUpdate: BlockConcise;
}

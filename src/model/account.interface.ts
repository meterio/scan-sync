import { BlockConcise } from './blockConcise.interface';
import BigNumber from 'bignumber.js';

export interface Account {
  address: string;
  mtrBalance: BigNumber;
  mtrgBalance: BigNumber;

  code?: string;
  master?: string;

  firstSeen: BlockConcise;
  lastUpdate: BlockConcise;
}

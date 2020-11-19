import { BlockConcise } from './blockConcise.interface';
import BigNumber from 'bignumber.js';

export interface Account {
  address: string;
  mtrBalance: BigNumber;
  mtrgBalance: BigNumber;

  firstSeen: BlockConcise;
  lastUpdate: BlockConcise;
}

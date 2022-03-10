import BigNumber from 'bignumber.js';

import { BlockConcise } from './blockConcise.interface';

export interface TxDigest {
  block: BlockConcise;
  txHash: string;
  fee: BigNumber;

  from: string;
  to: string;
  mtr: BigNumber;
  mtrg: BigNumber;
  clauseIndexs: number[];

  seq: number; // generated by sync system to sort importance with 0 as most important
}

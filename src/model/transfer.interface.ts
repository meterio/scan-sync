import BigNumber from 'bignumber.js';

import { Token } from '../const';
import { BlockConcise } from './blockConcise.interface';

export interface Transfer {
  from: string;
  to: string;
  amount: BigNumber;
  token: Token;
  tokenAddress: string;

  block: BlockConcise;
  txHash: string;
  clauseIndex: number;
  logIndex: number;
}

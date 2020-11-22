import { Token } from '../const';
import BigNumber from 'bignumber.js';
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

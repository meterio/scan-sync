import { Token } from '../const/model';
import BigNumber from 'bignumber.js';
import { BlockConcise } from './blockConcise.interface';

export interface Transfer {
  from: string;
  to: string;
  amount: BigNumber;
  token: Token;

  block: BlockConcise;
  txHash: string;
  clauseIndex: number;
}

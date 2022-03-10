import BigNumber from 'bignumber.js';

import { Token } from '../const';
import { BlockConcise } from './blockConcise.interface';

export interface Movement {
  from: string;
  to: string;
  amount: BigNumber;
  token: Token;
  tokenAddress: string;
  symbol?: string;
  decimals?: number;

  isSysContract: boolean;

  block: BlockConcise;
  txHash: string;
  clauseIndex: number;
  logIndex: number;
}

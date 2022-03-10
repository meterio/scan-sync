import BigNumber from 'bignumber.js';

import { BlockConcise } from './blockConcise.interface';

export interface Erc20TxDigest {
  block: BlockConcise;
  txHash: string;

  from: string;
  to: string;
  tokenAddress: string;
  value: BigNumber;

  name?: string;
  symbol: string;
  decimals: number;
}

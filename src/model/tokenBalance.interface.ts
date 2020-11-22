import BigNumber from 'bignumber.js';
import { Token } from '../const';

export interface TokenBalance {
  address: string;
  tokenAddress: string;
  balance: BigNumber;
}

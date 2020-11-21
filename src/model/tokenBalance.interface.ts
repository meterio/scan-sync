import BigNumber from 'bignumber.js';
import { Token } from '../const';

export interface TokenBalance {
  address: string;
  balance: BigNumber;
  contractAddress: string;
}

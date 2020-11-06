import { Token } from '../const/model';
import BigNumber from 'bignumber.js';

export interface Transfer {
  from: string;
  to: string;
  amount: BigNumber;
  token: Token;

  txHash: string;
  blockHash: string;
}

import { BlockConcise } from './blockConcise.interface';
import BigNumber from 'bignumber.js';
import { Token } from '../const/model';

export interface Account {
  address: string;
  balance: BigNumber;
  token: Token;

  firstSeen: BlockConcise;
  lastUpdate: BlockConcise;
}

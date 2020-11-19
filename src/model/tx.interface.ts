import { Token } from '../const';
import BigNumber from 'bignumber.js';
import { BlockConcise } from './blockConcise.interface';

export interface PosEvent {
  address: string;
  topics: string[];
  data: string;
}

export interface PosTransfer {
  sender: string;
  recipient: string;
  amount: string;
}

export interface TxOutput {
  contractAddress: string | null;
  events: PosEvent[];
  transfers: PosTransfer[];
}

export interface Clause {
  to: string | null;
  value: BigNumber;
  token: Token;
  data: string;
}

export interface Tx {
  hash: string;

  block: BlockConcise;
  txIndex: number;

  chainTag: number;
  blockRef: string;
  expiration: number;
  gasPriceCoef: number;
  gas: number;
  nonce: string;
  dependsOn: string | null;
  origin: string;

  clauses: Clause[];
  clauseCount: number;
  size: number;

  // receipt
  gasUsed: number;
  gasPayer: string;
  paid: BigNumber;
  reward: BigNumber;
  reverted: boolean;
  outputs: TxOutput[];
}

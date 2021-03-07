import BigNumber from 'bignumber.js';

export interface EpochReward {
  epoch: number;
  blockNum: number;
  txHash: string;
  clauseIndex: number;

  address: string;
  amount: BigNumber;
  type: string;
}

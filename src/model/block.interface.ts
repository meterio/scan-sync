import BigNumber from 'bignumber.js';
import { BlockType } from '../const';

export interface Block {
  // basics
  hash: string;
  number: number;
  parentID: string;
  timestamp: number;
  gasLimit: number;
  gasUsed: number;
  txsRoot: string;
  stateRoot: string;
  receiptsRoot: string;
  signer: string;
  beneficiary: string;
  size: number;

  // calculated
  txHashs: string[];
  totalScore: number;
  txCount: number;
  score: number;
  reward: BigNumber;
  gasChanged: number;
  blockType: BlockType;
}

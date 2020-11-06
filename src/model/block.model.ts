import * as mongoose from 'mongoose';
import BigNumber from 'bignumber.js';
import { Block } from './block.interface';
import { BlockType, enumKeys } from '../const/model';

const blockSchema = new mongoose.Schema({
  hash: { type: String, required: true },
  number: { type: Number, required: true },
  parentID: { type: String, required: true },
  timestamp: { type: Number, required: true },
  gasLimit: { type: Number, required: true },
  gasUsed: { type: Number, required: true },
  txsRoot: { type: String, required: true },
  stateRoot: { type: String, required: true },
  receiptsRoot: { type: String, required: true },
  signer: { type: String, required: true },
  beneficiary: { type: String, required: true },
  size: { type: Number, required: true },

  txHashs: [{ type: String }],
  totalScore: { type: Number, required: true },
  txCount: { type: Number, required: true },
  score: { type: Number, required: true },
  reward: {
    type: String,
    get: (num: string) => new BigNumber(num),
    set: (bnum: BigNumber) => bnum.toFixed(0),
    required: true,
  },
  gasChanged: { type: Number, required: true },
  blockType: {
    type: String,
    enum: enumKeys(BlockType),
    get: (enumValue: string) => BlockType[enumValue as keyof typeof BlockType],
    set: (enumValue: BlockType) => BlockType[enumValue],
    required: true,
  },
});

const blockModel = mongoose.model<Block & mongoose.Document>(
  'block',
  blockSchema
);

export default blockModel;

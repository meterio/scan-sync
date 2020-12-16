import BigNumber from 'bignumber.js';
import * as mongoose from 'mongoose';

import { BlockType, enumKeys } from '../const';
import { Block } from './block.interface';

export const committeeMemberSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true },
    netAddr: { type: String, required: true },
    pubKey: { type: String, required: true }, // Base64 ECDSA
  },
  { _id: false }
);

const qcSchema = new mongoose.Schema(
  {
    qcHeight: { type: Number, required: true },
    qcRound: { type: Number, required: true },
    voterBitArrayStr: { type: String, required: false },
    epochID: { type: Number, required: true },
  },
  { _id: false }
);

const blockSchema = new mongoose.Schema(
  {
    hash: { type: String, required: true, index: { unique: true } },
    number: { type: Number, required: true, index: { unique: true } },
    parentID: { type: String, required: true },
    timestamp: { type: Number, required: true },
    gasLimit: { type: Number, required: true },
    gasUsed: { type: Number, required: true },
    txsRoot: { type: String, required: true },
    stateRoot: { type: String, required: true },
    receiptsRoot: { type: String, required: true },
    signer: { type: String, required: true, index: true },
    beneficiary: { type: String, required: true },
    size: { type: Number, required: true },

    nonce: { type: String, required: true },
    lastKBlockHeight: { type: Number, required: true },
    committee: [{ type: committeeMemberSchema, required: false }],
    qc: { type: qcSchema, required: false },

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
    epoch: { type: Number, required: true },
    kblockData: [{ type: String }],

    createdAt: { type: Number, index: true },
  },
  {
    timestamps: {
      currentTime: () => Math.floor(Date.now() / 1000),
      updatedAt: false,
    },
  }
);

blockSchema.set('toJSON', {
  transform: (doc, ret, options) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

blockSchema.methods.toSummary = function () {
  return {
    number: this.number,
    hash: this.hash,
    parentID: this.parentID,
    timestamp: this.timestamp,
    txHashs: this.txHashs,
    lastKBlockHeight: this.lastKBlockHeight,
    epoch: this.qc.epochID,
    qcHeight: this.qc.qcHeight,
    blockType: this.blockType,
    gasUsed: this.gasUsed,
    txCount: this.txCount,
    signer: this.signer,
  };
};
const model = mongoose.model<Block & mongoose.Document>('block', blockSchema);

export default model;

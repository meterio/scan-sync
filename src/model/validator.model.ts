import * as mongoose from 'mongoose';

import { ValidatorStatus, enumKeys } from '../const';
import { Validator } from './validator.interface';

const distributorSchema = new mongoose.Schema(
  {
    address: { type: String, required: true },
    shares: { type: Number, required: true },
  },
  { _id: false }
);

const validatorSchema = new mongoose.Schema({
  pubKey: { type: String, required: true, unique: true },

  // updatable attributes
  name: { type: String, required: true },
  address: { type: String, required: true },
  ipAddress: { type: String, required: true },
  port: { type: Number, required: true },
  commission: { type: Number, required: true },

  status: {
    type: String,
    enum: enumKeys(ValidatorStatus),
    get: (enumValue: string) => ValidatorStatus[enumValue as keyof typeof ValidatorStatus],
    set: (enumValue: ValidatorStatus) => ValidatorStatus[enumValue],
    required: true,
  },

  // candidate
  buckets: [{ type: String }],

  // jailed fields
  totalPoints: { type: Number, required: false },
  bailAmount: { type: Number, required: false },
  jailedTime: { type: Number, required: false },
  infractions: { type: String, required: false },

  // only delegate has this field
  distributors: [distributorSchema],
});

validatorSchema.set('toJSON', {
  transform: (doc, ret, options) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

const txModel = mongoose.model<Validator & mongoose.Document>('validator', validatorSchema, 'validators');

export default txModel;

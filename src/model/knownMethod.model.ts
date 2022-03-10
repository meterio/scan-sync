import * as mongoose from 'mongoose';

import { KnownMethod } from './knownMethod.interface';

const knownMethodSchema = new mongoose.Schema<KnownMethod>({
  signature: { type: String, required: true, index: true },
  contractAddress: { type: String, require: true },
  name: { type: String, required: true },
  abi: { type: String, required: true },
});

knownMethodSchema.set('toJSON', {
  transform: (doc, ret, options) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

knownMethodSchema.index({ signature: 1, contractAddress: 1 }, { unique: true });

const model = mongoose.model<KnownMethod & mongoose.Document>('KnownMethod', knownMethodSchema, 'known_method');

export default model;

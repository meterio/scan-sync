import * as mongoose from 'mongoose';

import { KnownEvent } from './knownEvent.interface';

const knownEventSchema = new mongoose.Schema<KnownEvent>({
  signature: { type: String, required: true, index: true },
  contractAddress: { type: String, require: true },
  name: { type: String, required: true },
  abi: { type: String, required: true },
});

knownEventSchema.set('toJSON', {
  transform: (doc, ret, options) => {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

knownEventSchema.index({ signature: 1, contractAddress: 1 }, { unique: true });

const model = mongoose.model<KnownEvent & mongoose.Document>('KnownEvent', knownEventSchema, 'known_event');

export default model;

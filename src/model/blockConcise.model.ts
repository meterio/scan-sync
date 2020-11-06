import * as mongoose from "mongoose";

export const blockConciseSchema = new mongoose.Schema(
  {
    hash: { type: String, required: true },
    number: { type: Number, required: true },
    timestamp: { type: Number, required: true },
  },
  { _id: false }
);

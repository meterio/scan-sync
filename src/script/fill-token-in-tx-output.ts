#!/usr/bin/env node
require('../utils/validateEnv');

import mongoose from 'mongoose';

import TxRepo from '../repo/tx.repo';
import { Pos, getNetworkFromCli } from '../utils';
import { connectDB } from '../utils/db';

const fillTokenInTx = async () => {
  const net = getNetworkFromCli();
  const pos = new Pos(net);
  if (!net) {
    process.exit(-1);
  }

  await connectDB(net);
  const txRepo = new TxRepo();
  let txs = await txRepo.findAll();
  for (let tx of txs) {
    console.log('fix for tx: ', tx.hash);
    const receipt = await pos.getReceipt(tx.hash);
    let changed = false;
    for (const [clauseIndex, o] of tx.outputs.entries()) {
      for (let [logIndex, tr] of o.transfers.entries()) {
        console.log(tr);
        if (tr.token !== 0 && tr.token !== 1) {
          const rtr = receipt.outputs[clauseIndex].transfers[logIndex];
          if (rtr && rtr.hasOwnProperty('token')) {
            console.log('rtr:', rtr);
            tx.outputs[clauseIndex].transfers[logIndex].token = rtr.token;
            changed = true;
          }
        }
      }
    }
    if (changed) {
      await tx.save();
      console.log(`! updated tx`);
    }
  }
  await mongoose.disconnect();
};

(async () => {
  try {
    await fillTokenInTx();
  } catch (e) {
    console.log(`start error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

#!/usr/bin/env node
require('../utils/validateEnv');

import { Network, TxRepo, connectDB, disconnectDB } from '@meterio/scan-db/dist';

import { Pos, getNetworkFromCli } from '../utils';

const { network, standby } = getNetworkFromCli();

const fillTokenInTxOutput = async (net: Network, standby: boolean) => {
  const pos = new Pos(net);
  if (!net) {
    process.exit(-1);
  }

  await connectDB(net, standby);
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
  await disconnectDB();
};

(async () => {
  try {
    await fillTokenInTxOutput(network, standby);
    await disconnectDB();
  } catch (e) {
    console.log(`start error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

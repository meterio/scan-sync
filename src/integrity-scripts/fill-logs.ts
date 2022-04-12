#!/usr/bin/env node
require('../utils/validateEnv');

import {
  HeadRepo,
  connectDB,
  disconnectDB,
  LogEvent,
  LogEventRepo,
  LogTransfer,
  LogTransferRepo,
  TxRepo,
} from '@meterio/scan-db/dist';

import { checkNetworkWithDB, getNetworkFromCli } from '../utils';

const run = async () => {
  const { network, standby } = getNetworkFromCli();

  await connectDB(network, standby);
  const evtRepo = new LogEventRepo();
  const transRepo = new LogTransferRepo();
  const txRepo = new TxRepo();
  await checkNetworkWithDB(network);

  const txs = await txRepo.findAll();
  console.log('start checking...');
  let evts: LogEvent[] = [];
  let trs: LogTransfer[] = [];
  for (const tx of txs) {
    const block = tx.block;
    for (const [clauseIndex, o] of tx.outputs.entries()) {
      for (const [logIndex, e] of o.events.entries()) {
        evts.push({ ...e, txHash: tx.hash, block, clauseIndex, logIndex });
      }
      for (const [logIndex, t] of o.transfers.entries()) {
        trs.push({ ...t, txHash: tx.hash, block, clauseIndex, logIndex });
      }
    }
  }
  const ne = await evtRepo.bulkInsert(...evts);
  const nt = await transRepo.bulkInsert(...trs);
  console.log(ne, evts.length);
  console.log(nt, trs.length);
};

(async () => {
  try {
    await run();
    await disconnectDB();
  } catch (e) {
    console.log(`error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

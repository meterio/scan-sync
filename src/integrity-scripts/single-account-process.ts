#!/usr/bin/env node
require('../utils/validateEnv');

// other imports
import * as Logger from 'bunyan';
import mongoose from 'mongoose';

import { AccountCMD } from '../cmd/account.cmd';
import { Network } from '../const';
import BlockRepo from '../repo/block.repo';
import { connectDB } from '../utils/db';

let cmd = new AccountCMD(Network.MainNet);
let blockRepo = new BlockRepo();
(async () => {
  // const blockQueue = new BlockQueue('block');
  let shutdown = false;

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  signals.forEach((sig) => {
    process.on(sig, async (s) => {
      process.stdout.write(`Got signal: ${s}, terminating...\n`);
      if (!shutdown) {
        shutdown = true;
        await mongoose.disconnect();
        await cmd.stop();
        process.exit(0);
      }
    });
  });

  try {
    await connectDB();
    const blk = await blockRepo.findByNumber(5370624);
    const result = await cmd.processBlock(blk);
    console.log(result);
  } catch (e) {
    console.log(`process error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

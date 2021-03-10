#!/usr/bin/env node
require('../utils/validateEnv');

// other imports
import mongoose from 'mongoose';

import { PosCMD } from '../cmd/pos.cmd';
import { Network } from '../const';
import { Pos, getNetworkFromCli } from '../utils';
import { connectDB } from '../utils/db';

const net = getNetworkFromCli();
if (!net) {
  process.exit(-1);
}

const blockNum = 416378;

const processOneBlock = async (net: Network, blockNum: number) => {
  // const blockQueue = new BlockQueue('block');
  let shutdown = false;
  const cmd = new PosCMD(net);
  const posREST = new Pos(net);
  const blk = await posREST.getBlock(blockNum, 'expanded');
  console.log(`Process block ${blockNum} with pos cmd`);

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

  await connectDB(net);
  const result = await cmd.processBlock(blk);
  console.log(result);
};

(async () => {
  // const blockQueue = new BlockQueue('block');
  try {
    await processOneBlock(net, blockNum);
    await mongoose.disconnect();
  } catch (e) {
    console.log(`process error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

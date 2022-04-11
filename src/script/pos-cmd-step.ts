#!/usr/bin/env node
require('../utils/validateEnv');

import { Network, connectDB, disconnectDB } from '@meterio/scan-db/dist';

import { PosCMD } from '../cmd/pos.cmd';
import { Pos, getNetworkFromCli } from '../utils';

// other imports

const { network, standby } = getNetworkFromCli();

const blockNum = 27896;

const processOneBlock = async (net: Network, standby: boolean, blockNum: number) => {
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
        await disconnectDB();
        await cmd.stop();
        process.exit(0);
      }
    });
  });

  await connectDB(net, standby);
  const result = await cmd.processBlock(blk);
  console.log(result);
};

(async () => {
  // const blockQueue = new BlockQueue('block');
  try {
    await processOneBlock(network, standby, blockNum);
    await disconnectDB();
  } catch (e) {
    console.log(`process error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

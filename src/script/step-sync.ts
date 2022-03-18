#!/usr/bin/env node
require('../utils/validateEnv');

import { Network, connectDB, disconnectDB } from '@meterio/scan-db/dist';

import { PosCMD } from '../cmd/pos.cmd';
import { Pos } from '../utils';
import { getNetworkFromCli } from '../utils/utils';

// other imports

const net = getNetworkFromCli();
if (!net) {
  process.exit(-1);
}

const blockNum = 250000;

const processOneBlock = async (net: Network, blockNum: number) => {
  await connectDB(net);
  const cmd = new PosCMD(net);
  const pos = new Pos(net);
  const blk = await pos.getBlock(blockNum, 'expanded');
  await cmd.processBlock(blk);
  await disconnectDB();
  cmd.printCache();
};

processOneBlock(net, blockNum);

#!/usr/bin/env node
require('../utils/validateEnv');

import { Network, connectDB, disconnectDB } from '@meterio/scan-db/dist';

import { PosCMD } from '../cmd/pos.cmd';
import { Net, Pos } from '../utils';
import { getNetworkFromCli } from '../utils/utils';

// other imports

const net = getNetworkFromCli();
console.log(Network[net]);
const blockNum = 22280145;

const processOneBlock = async (net: Network, blockNum: number) => {
  await connectDB(net);
  console.log('process blockNum: ', blockNum);
  const cmd = new PosCMD(net);
  const pos = new Pos(net);
  const blk = await pos.getBlock(blockNum, 'expanded');
  await cmd.processBlock(blk);
  await disconnectDB();
  cmd.printCache();
};

(async () => {
  await processOneBlock(net, blockNum);
})();

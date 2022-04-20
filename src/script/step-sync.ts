#!/usr/bin/env node
require('../utils/validateEnv');

import { Network, connectDB, disconnectDB } from '@meterio/scan-db/dist';

import { PosCMD } from '../cmd/pos.cmd';
import { Net, Pos } from '../utils';
import { getNetworkFromCli } from '../utils/utils';

// other imports

const { network, standby } = getNetworkFromCli();
console.log(Network[network]);
const blockNum = 23022537;

const processOneBlock = async (net: Network, standby: boolean, blockNum: number) => {
  await connectDB(net, standby);
  console.log('process blockNum: ', blockNum);
  const cmd = new PosCMD(net);
  const pos = new Pos(net);
  const blk = await pos.getBlock(blockNum, 'expanded');
  await cmd.processBlock(blk);
  await disconnectDB();
  cmd.printCache();
};

(async () => {
  await processOneBlock(network, standby, blockNum);
})();

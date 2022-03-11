#!/usr/bin/env node
require('../utils/validateEnv');

import { BlockRepo, Network, PowInfo } from '@meterio/scan-db';
import mongoose from 'mongoose';

import { Pos, getNetworkFromCli } from '../utils';
import { connectDB } from '../utils/db';

const net = getNetworkFromCli();
if (!net) {
  process.exit(-1);
}

const fillPowblocksInKBlock = async (net: Network) => {
  const pos = new Pos(net);
  if (!net) {
    process.exit(-1);
  }

  await connectDB(net);
  const blockRepo = new BlockRepo();
  let kblks = await blockRepo.findKBlocksWithoutPowBlocks();
  while (!!kblks && kblks.length > 0) {
    for (let kb of kblks) {
      console.log('fix for kblock: ', kb.number, kb.epoch);
      const info = await pos.getEpochInfo(kb.epoch);
      let powBlocks: PowInfo[] = [];
      for (const pb of info.powBlocks) {
        powBlocks.push({
          hash: pb.hash,
          prevBlock: pb.previousBlockHash,
          height: pb.height,
          beneficiary: pb.Beneficiary || pb.beneficiary,
        });
      }
      kb.powBlocks = powBlocks;
      await kb.save();
      console.log(`updated with ${powBlocks.length} powblocks`);
    }
    kblks = await blockRepo.findKBlocksWithoutPowBlocks();
  }
  await mongoose.disconnect();
};

(async () => {
  try {
    await fillPowblocksInKBlock(net);
    await mongoose.disconnect();
  } catch (e) {
    console.log(`start error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

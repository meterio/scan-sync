#!/usr/bin/env node
require('../utils/validateEnv');

import { BlockRepo, Network, PowInfo, connectDB, disconnectDB } from '@meterio/scan-db/dist';

import { Pos, getNetworkFromCli } from '../utils';

const { network, standby } = getNetworkFromCli();

const fillPowblocksInKBlock = async (net: Network, standby: boolean) => {
  const pos = new Pos(net);
  if (!net) {
    process.exit(-1);
  }

  await connectDB(net, standby);
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
  await disconnectDB();
};

(async () => {
  try {
    await fillPowblocksInKBlock(network, standby);
    await disconnectDB();
  } catch (e) {
    console.log(`start error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

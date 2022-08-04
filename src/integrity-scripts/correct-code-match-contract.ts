#!/usr/bin/env node
require('../utils/validateEnv');

import { connectDB, disconnectDB, ContractRepo, Contract } from '@meterio/scan-db/dist';

import { checkNetworkWithDB, getNetworkFromCli } from '../utils';

const run = async () => {
  const { network, standby } = getNetworkFromCli();

  await connectDB(network, standby);
  const contractRepo = new ContractRepo();
  await checkNetworkWithDB(network);

  const contracts = await contractRepo.findCodeMatchVerifiedContracts();
  for (const c of contracts) {
    if (c.verified && c.verifiedFrom) {
      var root: Contract;
      do {
        root = await contractRepo.findByAddress(c.verifiedFrom);
      } while (root.status != 'match');
      if (root.address !== c.verifiedFrom) {
        console.log(`update verifiedFrom on ${c.addresss} from ${c.verifiedFrom} to ${root.address}`);
        c.verifiedFrom = root.address;
        await c.save();
      }
    }
  }
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

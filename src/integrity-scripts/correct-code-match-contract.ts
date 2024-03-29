#!/usr/bin/env node
require('../utils/validateEnv');

import { connectDB, disconnectDB, ContractRepo, Contract } from '@meterio/scan-db/dist';

import { checkNetworkWithDB, getNetworkFromCli } from '../utils';

const run = async () => {
  const { network, standby } = getNetworkFromCli();

  await connectDB(network, standby);
  const contractRepo = new ContractRepo();
  await checkNetworkWithDB(network);

  const contracts = await contractRepo.findCodeMatchVerifiedContract();
  for (const c of contracts) {
    console.log('correct contract: ', c.address);
    if (c.verified && c.verifiedFrom) {
      const root = await contractRepo.findByAddress(c.verifiedFrom);
      if (root.status === 'match') {
        const realRoot = await contractRepo.findVerifiedContractsWithCreationInputHash(c.creationInputHash);
        console.log(`update verifiedFrom on ${c.address} from ${c.verifiedFrom} to ${realRoot.address}`);
        c.verifiedFrom = realRoot.address;
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

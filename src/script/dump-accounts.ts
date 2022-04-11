#!/usr/bin/env node
require('../utils/validateEnv');

import * as path from 'path';

import { AccountRepo, Network, connectDB, disconnectDB } from '@meterio/scan-db/dist';

import { checkNetworkWithDB, getNetworkFromCli, saveCSV } from '../utils';

const { network, standby } = getNetworkFromCli();

const dumpAccounts = async (net: Network, standby: boolean) => {
  await connectDB(net, standby);
  const accountRepo = new AccountRepo();
  const accounts = await accountRepo.findAll();
  await checkNetworkWithDB(net);

  let accts = [];
  for (const acc of accounts) {
    if (acc.mtrBalance.isGreaterThan(0) || acc.mtrgBalance.isGreaterThan(0)) {
      accts.push({
        address: acc.address,
        mtr: acc.mtrBalance.dividedBy(1e18).toFixed(),
        mtrg: acc.mtrgBalance.dividedBy(1e18).toFixed(),
      });
    }
  }

  saveCSV(accts, ['address', 'mtr', 'mtrg'], path.join(__dirname, '..', '..', 'accounts.csv'));
  console.log('all done');
  await disconnectDB();
};

(async () => {
  try {
    await dumpAccounts(network, standby);
    await disconnectDB();
  } catch (e) {
    console.log(`start error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

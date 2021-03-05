#!/usr/bin/env node
require('../utils/validateEnv');

import * as path from 'path';

import mongoose from 'mongoose';

import { Network } from '../const';
import AccountRepo from '../repo/account.repo';
import { checkNetworkWithDB, getNetworkFromCli, saveCSV } from '../utils';
import { connectDB } from '../utils/db';

const net = getNetworkFromCli();
if (!net) {
  process.exit(-1);
}

const dumpAccounts = async (net: Network) => {
  await connectDB(net);
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
  await mongoose.disconnect();
};

(async () => {
  try {
    await dumpAccounts(net);
    await mongoose.disconnect();
  } catch (e) {
    console.log(`start error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

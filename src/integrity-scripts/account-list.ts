#!/usr/bin/env node
require('../utils/validateEnv');

import * as fs from 'fs';
import * as path from 'path';

import BigNumber from 'bignumber.js';

import AccountRepo from '../repo/account.repo';
import { connectDB } from '../utils/db';
import { checkNetworkWithDB } from '../utils/integrity';
import { getNetworkFromCli } from '../utils/utils';

const net = getNetworkFromCli();
if (!net) {
  process.exit(-1);
}

(async () => {
  try {
    await connectDB(net);
    const accountRepo = new AccountRepo();
    const accounts = await accountRepo.findAll();
    await checkNetworkWithDB(net);

    let accts = [];
    for (const acc of accounts) {
      if (acc.mtrBalance.isGreaterThan(0) && acc.mtrgBalance.isGreaterThan(0)) {
        accts.push({
          address: acc.address,
          mtr: acc.mtrBalance.dividedBy(1e18).toFixed(),
          mtrg: acc.mtrgBalance.dividedBy(1e18).toFixed(),
        });
      }
    }

    const mtrgDesc = accts.sort((a, b) => {
      return new BigNumber(a.mtrgBalance).isGreaterThan(b.mtrgBalance) ? 1 : -1;
    });
    const mtrgDescContent = JSON.stringify(mtrgDesc, null, 2);
    console.log('MTRG DESC:', mtrgDescContent);
    fs.writeFileSync(path.join(__dirname, '..', '..', 'mtrgDesc.json'), mtrgDescContent);

    const mtrDesc = accts.sort((a, b) => {
      return new BigNumber(a.mtrBalance).isGreaterThan(b.mtrBalance) ? 1 : -1;
    });
    const mtrDescContent = JSON.stringify(mtrDesc, null, 2);
    console.log('MTR DESC:', mtrDescContent);
    fs.writeFileSync(path.join(__dirname, '..', '..', 'mtrDesc.json'), mtrDescContent);

    console.log('all done');
  } catch (e) {
    console.log(`start error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

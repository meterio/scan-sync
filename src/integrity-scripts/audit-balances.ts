#!/usr/bin/env node
require('../utils/validateEnv');

import { AccountRepo, BigNumber, BlockRepo, HeadRepo, Token } from '@meterio/scan-db';
import mongoose from 'mongoose';

import { PrototypeAddress, ZeroAddress, prototype } from '../const';
import { Pos, checkNetworkWithDB, fromWei, getNetworkFromCli } from '../utils';
import { connectDB } from '../utils/db';

const auditBalance = async () => {
  const net = getNetworkFromCli();
  if (!net) {
    process.exit(-1);
  }

  await connectDB(net);
  const blockRepo = new BlockRepo();
  const headRepo = new HeadRepo();
  const accountRepo = new AccountRepo();
  const pos = new Pos(net);
  await checkNetworkWithDB(net);

  const posHead = await headRepo.findByKey('pos');
  console.log('POS Head:', posHead);
  const headBlock = await blockRepo.findByHash(posHead.hash);
  const head = headBlock.hash;
  const accounts = await accountRepo.findAll();

  let count = 0;
  console.log('start checking...');
  for (const acc of accounts) {
    let chainAcc: Flex.Meter.Account;
    let chainCode: Flex.Meter.Code;
    let chainMaster: string | null = null;
    try {
      chainAcc = await pos.getAccount(acc.address, head);
      chainCode = await pos.getCode(acc.address, head);
      // Get master
      let ret = await pos.explain(
        {
          clauses: [
            {
              to: PrototypeAddress,
              value: '0x0',
              data: prototype.master.encode(acc.address),
              token: Token.MTR,
            },
          ],
        },
        head
      );
      let decoded = prototype.master.decode(ret[0].data);
      if (decoded['0'] !== ZeroAddress) {
        chainMaster = decoded['0'];
      }
    } catch {
      continue;
    }

    const balance = new BigNumber(chainAcc.balance);
    if (acc.mtrgBalance.toFixed() !== balance.toFixed()) {
      // acc.mtrBalance = balance;
      // await acc.save();
      console.log(
        `Fatal: MTRG balance of Account(${acc.address}) mismatch, chain: ${fromWei(balance)} MTRG, db: ${fromWei(
          acc.mtrgBalance
        )} MTRG`
      );
    }
    const energy = new BigNumber(chainAcc.energy);
    if (acc.mtrBalance.toFixed() !== energy.toFixed()) {
      // acc.mtrBalance = energy;
      // await acc.save();
      console.log(
        `Fatal: MTR balance of Account(${acc.address}) mismatch, chain: ${fromWei(energy)} MTR, db: ${fromWei(
          acc.mtrBalance
        )} MTR`
      );
    }
    if (acc.master !== undefined && chainMaster !== null && acc.master.toLowerCase() !== chainMaster.toLowerCase()) {
      console.log(`Fatal: master of Account(${acc.address}) mismatch, chain: ${chainMaster} db: ${acc.master}`);
    }
    if (chainAcc.hasCode === true && acc.code !== chainCode.code) {
      console.log(`Fatal: Account(${acc.address}) code mismatch, chain: ${chainCode.code}, db: ${acc.code}`);
    }

    count++;
    if (count % 1000 === 0) {
      console.log('checked ', count);
    }
  }

  console.log('all done!');
};

(async () => {
  try {
    await auditBalance();
    await mongoose.disconnect();
  } catch (e) {
    console.log(`error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

#!/usr/bin/env node
require('../utils/validateEnv');

import BigNumber from 'bignumber.js';
import mongoose from 'mongoose';

import { Network, PrototypeAddress, Token, ZeroAddress, prototype } from '../const';
import AccountRepo from '../repo/account.repo';
import HeadRepo from '../repo/head.repo';
import { Pos, checkNetworkWithDB, fromWei, getNetworkFromCli } from '../utils';
import { connectDB } from '../utils/db';

const testnetRevision = '250000';

const adjustBalance = async () => {
  const net = getNetworkFromCli();
  if (!net) {
    process.exit(-1);
  }

  await connectDB(net);
  const headRepo = new HeadRepo();
  const accountRepo = new AccountRepo();
  const pos = new Pos(net);
  await checkNetworkWithDB(net);

  const posHead = await headRepo.findByKey('pos');
  console.log('POS Head:', posHead);

  let revision = '';
  if (net === Network.TestNet) {
    revision = testnetRevision;
  } else {
    revision = '' + posHead.num;
  }
  console.log(`Adjust account balances based on revision: ${revision}`);

  const accounts = await accountRepo.findAll();
  console.log('start checking...');
  for (const acc of accounts) {
    let chainAcc: Flex.Meter.Account;
    let chainCode: Flex.Meter.Code;
    let chainMaster: string | null = null;
    try {
      chainAcc = await pos.getAccount(acc.address, revision);
      chainCode = await pos.getCode(acc.address, revision);
      // Get master
      let ret = await pos.explain(
        {
          clauses: [
            {
              to: PrototypeAddress,
              value: '0x0',
              data: prototype.master.encode(acc.address),
              token: Token.SYSTEM_COIN,
            },
          ],
        },
        revision
      );
      let decoded = prototype.master.decode(ret[0].data);
      if (decoded['0'] !== ZeroAddress) {
        chainMaster = decoded['0'];
      }
    } catch {
      continue;
    }

    const balance = new BigNumber(chainAcc.balance);
    const energy = new BigNumber(chainAcc.energy);
    const boundedBalance = new BigNumber(chainAcc.boundbalance);
    const boundedEnergy = new BigNumber(chainAcc.boundenergy);
    if (
      acc.mtrgBalance.toFixed() !== balance.toFixed() ||
      acc.mtrBalance.toFixed() !== energy.toFixed() ||
      acc.mtrgBounded.toFixed() !== boundedBalance.toFixed() ||
      acc.mtrBounded.toFixed() !== boundedEnergy.toFixed()
    ) {
      const preMTR = acc.mtrBalance;
      const preMTRG = acc.mtrgBalance;
      const preBoundedMTR = acc.mtrBounded;
      const preBoundedMTRG = acc.mtrgBounded;
      acc.mtrBalance = energy;
      acc.mtrgBalance = balance;
      acc.mtrBounded = boundedEnergy;
      acc.mtrgBounded = boundedBalance;

      await acc.save();

      console.log('-'.repeat(50));
      console.log(`Fixing Account(${acc.address}):`);
      if (!preMTR.isEqualTo(energy)) {
        console.log(`MTR: ${fromWei(preMTR)} -> ${fromWei(energy)} `);
      }
      if (!preMTRG.isEqualTo(balance)) {
        console.log(`MTRG: ${fromWei(preMTRG)} -> ${fromWei(balance)}`);
      }
      if (!preBoundedMTR.isEqualTo(boundedEnergy)) {
        console.log(`Bounded MTR: ${fromWei(preBoundedMTR)} -> ${fromWei(boundedEnergy)}`);
      }
      if (!preBoundedMTRG.isEqualTo(boundedBalance)) {
        console.log(`Bounded MTRG: ${fromWei(preBoundedMTRG)} -> ${fromWei(boundedBalance)}`);
      }
    }
  }
};

(async () => {
  try {
    await adjustBalance();
    await mongoose.disconnect();
  } catch (e) {
    console.log(`error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

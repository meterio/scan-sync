#!/usr/bin/env node
require('../utils/validateEnv');

import BigNumber from 'bignumber.js';

import { PrototypeAddress, Token, ZeroAddress, prototype } from '../const';
import AccountRepo from '../repo/account.repo';
import BlockRepo from '../repo/block.repo';
import HeadRepo from '../repo/head.repo';
import { Pos, checkNetworkWithDB, fromWei, getNetworkFromCli } from '../utils';
import { connectDB } from '../utils/db';

const resetAccountBalance = async () => {
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
    const energy = new BigNumber(chainAcc.energy);
    const boundedBalance = new BigNumber(chainAcc.boundbalance);
    const boundedEnergy = new BigNumber(chainAcc.boundenergy);
    if (
      acc.mtrgBalance.toFixed() !== balance.toFixed() ||
      acc.mtrBalance.toFixed() !== energy.toFixed() ||
      acc.mtrgBounded.toFixed() !== boundedBalance.toFixed() ||
      acc.mtrBounded.toFixed() !== boundedEnergy.toFixed()
    ) {
      // acc.mtrBalance = balance;
      // await acc.save();
      acc.mtrBalance = energy;
      acc.mtrgBalance = balance;
      acc.mtrBounded = boundedEnergy;
      acc.mtrgBounded = boundedBalance;
      await acc.save();
      console.log(
        `Fixing Account(${acc.address}), \nbalance: ${fromWei(balance)} MTRG, energy: ${fromWei(energy)} MTR`
      );
      console.log(`bounded balance: ${fromWei(boundedBalance)} MTRG, bounded energy: ${fromWei(boundedEnergy)} MTR`);
    }
  }
};

(async () => {
  try {
    resetAccountBalance();
  } catch (e) {
    console.log(`error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

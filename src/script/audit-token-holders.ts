#!/usr/bin/env node
require('../utils/validateEnv');

import BigNumber from 'bignumber.js';
import mongoose from 'mongoose';

import { Token, totalSupply } from '../const';
import HeadRepo from '../repo/head.repo';
import TokenBalanceRepo from '../repo/tokenBalance.repo';
import TokenProfileRepo from '../repo/tokenProfile.repo';
import { Pos, checkNetworkWithDB, getNetworkFromCli } from '../utils';
import { connectDB } from '../utils/db';

const auditTokenBalances = async () => {
  const net = getNetworkFromCli();
  if (!net) {
    process.exit(-1);
  }

  await connectDB(net);
  const headRepo = new HeadRepo();
  const tokenProfileRepo = new TokenProfileRepo();
  const tokenBalanceRepo = new TokenBalanceRepo();
  const pos = new Pos(net);
  await checkNetworkWithDB(net);

  const profiles = await tokenProfileRepo.findAll();
  for (const p of profiles) {
    const balances = await tokenBalanceRepo.findByTokenAddress(p.address);
    const { symbol, name, address } = p;
    let sum = new BigNumber(0);
    for (const bal of balances) {
      const { balance } = bal;
      sum = sum.plus(balance);
    }
    const holderCount = balances.length;
    if (!p.totalSupply.isEqualTo(sum)) {
      const res = await pos.explain(
        {
          clauses: [{ to: address, value: '0x0', data: totalSupply.encode(), token: Token.MTR }],
        },
        'best'
      );
      const decoded = totalSupply.decode(res[0].data);
      const totalSupplyOnChain = decoded['0'];
      console.log('----------------------------------------');
      console.log(`Total supply != Holder's holdings for token ${symbol} ${address}`);
      console.log(`total supply : ${p.totalSupply.toFixed(0)}`);
      console.log(`sum of holders: ${sum.toFixed(0)}`);
      console.log(`total supply on chain: ${totalSupplyOnChain}`);
      console.log(`diff: ${p.totalSupply.minus(sum).toFixed(0)}`);
      console.log(`holder count: ${holderCount}`);
    }
  }
};

(async () => {
  try {
    await auditTokenBalances();
    await mongoose.disconnect();
  } catch (e) {
    console.log(`error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

#!/usr/bin/env node
require('../utils/validateEnv');

import {} from '../const';

import { abi } from '@meterio/devkit';
import { BigNumber, HeadRepo, Token, TokenBalanceRepo } from '@meterio/scan-db';
import mongoose from 'mongoose';

import { Pos, checkNetworkWithDB, getNetworkFromCli } from '../utils';
import { connectDB } from '../utils/db';

const balanceOfABI: abi.Function.Definition = {
  inputs: [{ name: 'account', type: 'address' }],
  name: 'balanceOf',
  outputs: [{ name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
  payable: false,
};

const auditTokenBalances = async () => {
  const net = getNetworkFromCli();
  if (!net) {
    process.exit(-1);
  }

  await connectDB(net);
  const headRepo = new HeadRepo();
  const tokenBalanceRepo = new TokenBalanceRepo();
  const pos = new Pos(net);
  await checkNetworkWithDB(net);

  const balances = await tokenBalanceRepo.findAll();
  console.log('start checking...');

  const balanceOfFunc = new abi.Function(balanceOfABI);
  for (const bal of balances) {
    const { address, tokenAddress, symbol, balance } = bal;
    try {
      const outputs = await pos.explain(
        {
          clauses: [{ to: tokenAddress, value: '0x0', data: balanceOfFunc.encode(address), token: Token.MTR }],
        },
        'best'
      );
      const decoded = balanceOfFunc.decode(outputs[0].data);
      const chainBal = new BigNumber(decoded[0]);
      if (!chainBal.isEqualTo(balance)) {
        console.log(`found NON-matching balance: chain ${chainBal} db:${balance}`);
        console.log(`tokenAddr: ${tokenAddress}, addr: ${address}, symbol: ${symbol}`);
        bal.balance = chainBal;
        console.log(`updated`);
        console.log('----------------------------------------');
        await bal.save();
      }
    } catch {
      continue;
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

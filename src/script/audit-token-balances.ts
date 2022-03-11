#!/usr/bin/env node
require('../utils/validateEnv');

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

  const posHead = await headRepo.findByKey('pos');
  console.log('POS Head:', posHead);

  const balances = await tokenBalanceRepo.findAll();
  console.log(`start checking ${balances.length} balances ...`);

  const balanceOfFunc = new abi.Function(balanceOfABI);
  let n = 1;
  for (const bal of balances) {
    const { address, tokenAddress, symbol, balance } = bal;
    try {
      const outputs = await pos.explain(
        {
          clauses: [{ to: tokenAddress, value: '0x0', data: balanceOfFunc.encode(address), token: Token.MTR }],
        },
        posHead.hash
      );
      const decoded = balanceOfFunc.decode(outputs[0].data);
      const chainBal = new BigNumber(decoded[0]);
      if (!chainBal.isEqualTo(balance)) {
        console.log(`found NON-matching balance: chain ${chainBal} db:${balance}`);
        console.log(`tokenAddr: ${tokenAddress}, addr: ${address}, symbol: ${symbol}`);
      }
      n++;
      if (n % 500 == 0) {
        console.log(`checked ${n} balances`);
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

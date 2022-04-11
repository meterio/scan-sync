#!/usr/bin/env node
require('../utils/validateEnv');

import { abi } from '@meterio/devkit';
import { BigNumber, HeadRepo, Token, TokenBalanceRepo, connectDB, disconnectDB } from '@meterio/scan-db/dist';

import { Pos, checkNetworkWithDB, getNetworkFromCli } from '../utils';

const balanceOfABI: abi.Function.Definition = {
  inputs: [{ name: 'account', type: 'address' }],
  name: 'balanceOf',
  outputs: [{ name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
  payable: false,
};

const auditTokenBalances = async () => {
  const { network, standby } = getNetworkFromCli();

  await connectDB(network, standby);
  const headRepo = new HeadRepo();
  const tokenBalanceRepo = new TokenBalanceRepo();
  const pos = new Pos(network);
  await checkNetworkWithDB(network);

  const balances = await tokenBalanceRepo.findAll();
  console.log('start checking...');

  const balanceOfFunc = new abi.Function(balanceOfABI);
  for (const bal of balances) {
    const { address, tokenAddress, balance } = bal;
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
        console.log(`tokenAddr: ${tokenAddress}, addr: ${address}`);
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
    await disconnectDB();
  } catch (e) {
    console.log(`error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

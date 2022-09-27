#!/usr/bin/env node
require('../utils/validateEnv');

import { ERC20 } from '@meterio/devkit';
import { BigNumber, Token, TokenBalanceRepo, connectDB, disconnectDB } from '@meterio/scan-db/dist';

import { Pos, checkNetworkWithDB, getNetworkFromCli } from '../utils';

const auditTokenBalances = async () => {
  const { network, standby } = getNetworkFromCli();

  await connectDB(network, standby);
  const tokenBalanceRepo = new TokenBalanceRepo();
  const pos = new Pos(network);
  await checkNetworkWithDB(network);

  const balances = await tokenBalanceRepo.findByTokenAddress('0x160361ce13ec33c993b5cca8f62b6864943eb083');
  console.log('start checking...');

  for (const bal of balances) {
    const { address, tokenAddress, balance } = bal;
    try {
      const outputs = await pos.explain(
        {
          clauses: [{ to: tokenAddress, value: '0x0', data: ERC20.balanceOf.encode(address), token: Token.MTR }],
        },
        'best'
      );
      const decoded = ERC20.balanceOf.decode(outputs[0].data);
      const chainBal = new BigNumber(decoded[0]);
      if (!chainBal.isEqualTo(balance)) {
        console.log(`found NON-matching balance: chain ${chainBal} db:${balance}`);
        console.log(`tokenAddr: ${tokenAddress}, addr: ${address}`);
        if (chainBal.isEqualTo(0)) {
          await bal.delete();
          console.log('deleted');
        } else {
          bal.balance = chainBal;
          await bal.save();
          console.log(`updated`);
        }
        console.log('----------------------------------------');
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

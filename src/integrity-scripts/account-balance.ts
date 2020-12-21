#!/usr/bin/env node
require('../utils/validateEnv');

import BigNumber from 'bignumber.js';

import { Network, PrototypeAddress, Token, ZeroAddress, prototype } from '../const';
import AccountRepo from '../repo/account.repo';
import BlockRepo from '../repo/block.repo';
import HeadRepo from '../repo/head.repo';
import { connectDB } from '../utils/db';
import { checkNetworkWithDB } from '../utils/integrity';
import { Net } from '../utils/net';
import { Pos } from '../utils/pos-rest';

(async () => {
  try {
    await connectDB();
    const blockRepo = new BlockRepo();
    const headRepo = new HeadRepo();
    const accountRepo = new AccountRepo();
    const pos = new Pos(new Net(process.env.POS_PROVIDER_URL));
    await checkNetworkWithDB(Network.MainNet);

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
          `Fatal: MTRG balance mismatch of Account(${
            acc.address
          }) chain:'${balance.toFixed()}' db:'${acc.mtrgBalance.toFixed()}'`
        );
      }
      const energy = new BigNumber(chainAcc.energy);
      if (acc.mtrBalance.toFixed() !== energy.toFixed()) {
        // acc.mtrBalance = energy;
        // await acc.save();
        console.log(
          `Fatal: MTR balance mismatch of Account(${
            acc.address
          }) chain:${energy.toFixed()} db:${acc.mtrBalance.toFixed()}`
        );
      }
      if (acc.master !== chainMaster && acc.master !== undefined && chainMaster !== null) {
        console.log(`Fatal: master of Account(${acc.address}) mismatch,chain:${chainMaster} db:${acc.master}`);
      }
      if (chainAcc.hasCode === true && acc.code !== chainCode.code) {
        console.log(`Fatal: Account(${acc.address}) code mismatch, chain:${chainCode.code}, db: ${acc.code}`);
      }

      count++;
      if (count % 1000 === 0) {
        console.log('checked ', count);
      }
    }

    console.log('all done!');
  } catch (e) {
    console.log(`start error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

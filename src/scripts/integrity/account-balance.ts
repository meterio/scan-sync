#!/usr/bin/env node
require('../../utils/validateEnv');

import BigNumber from 'bignumber.js';

import { Network, PrototypeAddress, Token, ZeroAddress, prototype } from '../../const';
import AccountRepo from '../../repo/account.repo';
import BlockRepo from '../../repo/block.repo';
import HeadRepo from '../../repo/head.repo';
import { connectDB } from '../../utils/db';
import { Net } from '../../utils/net';
import { Pos } from '../../utils/pos-rest';
import { checkNetworkWithDB } from '../network';

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

      if (!acc.mtrgBalance.isEqualTo(new BigNumber(chainAcc.balance))) {
        throw new Error(
          `Fatal: MTRG balance mismatch of Account(${acc.address}) chain:${chainAcc.balance} db:${acc.mtrgBalance}`
        );
      }
      if (!acc.mtrBalance.isEqualTo(new BigNumber(chainAcc.energy))) {
        throw new Error(
          `Fatal: MTR balance mismatch of Account(${acc.address}) chain:${chainAcc.energy} db:${acc.mtrBalance}`
        );
      }
      if (acc.master !== chainMaster && acc.master !== undefined && chainMaster !== null) {
        throw new Error(`Fatal: master of Account(${acc.address}) mismatch,chain:${chainMaster} db:${acc.master}`);
      }
      if (chainAcc.hasCode === true && acc.code !== chainCode.code) {
        throw new Error(`Fatal: Account(${acc.address}) code mismatch`);
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
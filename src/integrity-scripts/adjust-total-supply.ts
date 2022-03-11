#!/usr/bin/env node
require('../utils/validateEnv');

import { BigNumber, Token, TokenProfileRepo } from '@meterio/scan-db';
import mongoose from 'mongoose';

import { prototype, totalSupply } from '../const';
import { Pos, checkNetworkWithDB, fromWei, getNetworkFromCli } from '../utils';
import { connectDB } from '../utils/db';

const adjustTotalSupply = async () => {
  const net = getNetworkFromCli();
  if (!net) {
    process.exit(-1);
  }

  await connectDB(net);
  const tokenProfileRepo = new TokenProfileRepo();
  const pos = new Pos(net);
  await checkNetworkWithDB(net);

  const profiles = await tokenProfileRepo.findAll();
  console.log(`start checking ${profiles.length} token profiles...`);
  let updateCount = 0;
  for (const p of profiles) {
    const ret = await pos.explain(
      { clauses: [{ to: p.address, value: '0x0', data: totalSupply.encode(), token: Token.MTR }] },
      'best'
    );
    const decoded = totalSupply.decode(ret[0].data);
    const amount = decoded['0'];
    let updated = false;
    if (!p.totalSupply.isEqualTo(amount)) {
      console.log(`Update total supply for token ${p.symbol} from ${p.totalSupply.toFixed(0)} to ${amount}`);
      p.totalSupply = new BigNumber(amount);
      updated = true;
    }
    if (updated) {
      updateCount++;
      await p.save();
    }
  }
  console.log(`Updated ${updateCount} token profiles`);
};

(async () => {
  try {
    await adjustTotalSupply();
    await mongoose.disconnect();
  } catch (e) {
    console.log(`error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

#!/usr/bin/env node
require('../utils/validateEnv');

/***
 * list stake holders snapshot at tipping block num
 * including: address, balance (snapshot), tipping timestamp - first bound timestamp
 */
import * as path from 'path';

import BigNumber from 'bignumber.js';
import mongoose from 'mongoose';

import { Token } from '../const';
import BoundRepo from '../repo/bound.repo';
import UnboundRepo from '../repo/unbound.repo';
import { getNetworkFromCli } from '../utils';
import { Pos, saveCSV } from '../utils';
import { connectDB } from '../utils/db';

const tippingBlockNum = 14063032;

const listStakersSnapshot = async () => {
  const net = getNetworkFromCli();
  if (!net) {
    process.exit(-1);
  }
  const pos = new Pos(net);

  const keyBlock = await pos.getBlock(tippingBlockNum, 'regular');

  await connectDB(net);
  const boundRepo = new BoundRepo();
  const unboundRepo = new UnboundRepo();
  const bounds = await boundRepo.findBeforeNum(tippingBlockNum);
  const unbounds = await unboundRepo.findBeforeNum(tippingBlockNum);
  let data = [];
  let stakers = [];
  bounds.forEach((b) => {
    data.push({ ...b.toJSON(), type: 'bound' });
  });
  unbounds.forEach((u) => {
    data.push({ ...u.toJSON(), type: 'unbound' });
  });

  data = data.sort((a, b) => (!a.block ? -1 : !b.block ? 1 : a.block.number < b.block.number ? -1 : 1));
  for (const d of data) {
    const { owner, amount, block } = d;
    if (!owner) {
      console.log('no owner: ', d);
      continue;
    }
    const addr = owner.toLowerCase();
    if (d.type === 'bound') {
      // handle bound
      if (!(addr in stakers)) {
        stakers[addr] = {
          balance: new BigNumber(amount),
          firstSeenAt: block.timestamp,
        };
      } else {
        stakers[addr].balance = stakers[addr].balance.plus(amount);
      }
    } else if (d.type === 'unbound') {
      // handle unbound
      if (!(addr in stakers)) {
        console.log('unbound before bound !!! for ', owner);
      } else {
        stakers[addr].balance = stakers[addr].balance.minus(amount);
      }
    } else {
      console.log('unsupported type');
    }
    // } else {
    // console.log('unsupported token:', d.token);
    // }
  }
  let accts = [];
  for (const addr in stakers) {
    accts.push({
      address: addr,
      balance: stakers[addr].balance.dividedBy(1e18).toFixed(1),
      ndays: Math.floor((keyBlock.timestamp - stakers[addr].firstSeenAt) / 3600 / 24),
    });
  }

  saveCSV(accts, ['address', 'balance', 'ndays'], path.join(__dirname, '..', '..', 'stakers-snapshot.csv'));
};

(async () => {
  try {
    await listStakersSnapshot();
    await mongoose.disconnect();
  } catch (e) {
    console.log(`error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

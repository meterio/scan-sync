#!/usr/bin/env node
require('../utils/validateEnv');

import BigNumber from 'bignumber.js';
import mongoose from 'mongoose';

import EpochRewardRepo from '../repo/epochReward.repo';
import EpochRewardSummaryRepo from '../repo/epochRewardSummary.repo';
import { checkNetworkWithDB, getNetworkFromCli } from '../utils';
import { connectDB } from '../utils/db';

const adjustEpochRewardSummary = async () => {
  const net = getNetworkFromCli();
  if (!net) {
    process.exit(-1);
  }

  await connectDB(net);
  await checkNetworkWithDB(net);

  const epochRewardRepo = new EpochRewardRepo();
  const epochRewardSummaryRepo = new EpochRewardSummaryRepo();

  const summaries = await epochRewardSummaryRepo.findAll();
  for (const summary of summaries) {
    if (summary.totalReward.isLessThanOrEqualTo(0)) {
      continue;
    }
    const rewards = await epochRewardRepo.findByEpoch(summary.epoch);
    let autobidTotal = new BigNumber(0);
    let autobidCount = 0;
    let userbidTotal = new BigNumber(0);
    let userbidCount = 0;
    for (const r of rewards) {
      if (r.type == 'autobid') {
        autobidTotal = autobidTotal.plus(r.amount);
        autobidCount++;
      } else if (r.type == 'userbid') {
        userbidTotal = userbidTotal.plus(r.amount);
        userbidCount++;
      }
    }

    let updated = true;
    if (!autobidTotal.isEqualTo(summary.autobidTotal)) {
      console.log(`update autobidTotal from: ${summary.autobidTotal.toFixed()} to ${autobidTotal.toFixed()}`);
      summary.autobidTotal = autobidTotal;
      updated = true;
    }
    if (!userbidTotal.isEqualTo(summary.transferCount)) {
      summary.transferTotal = userbidTotal;
      console.log(`update transferTotal from: ${summary.transferTotal.toFixed()} to ${userbidTotal.toFixed()}`);
      updated = true;
    }
    if (autobidCount != summary.autobidCount) {
      summary.autobidCount = autobidCount;
      console.log(`update autobidCount from: ${summary.autobidCount} to ${autobidCount}`);
      updated = true;
    }
    if (userbidCount != summary.transferCount) {
      summary.transferCount = userbidCount;
      console.log(`update transferCount from: ${summary.transferCount} to ${userbidCount}`);
      updated = true;
    }
    if (updated) {
      console.log(`saved summary on epoch ${summary.epoch}`);
      // await summary.save();
    }
  }
};

(async () => {
  try {
    await adjustEpochRewardSummary();
    await mongoose.disconnect();
  } catch (e) {
    console.log(`error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

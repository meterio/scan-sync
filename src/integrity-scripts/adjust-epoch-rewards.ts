#!/usr/bin/env node
require('../utils/validateEnv');

import BigNumber from 'bignumber.js';
import mongoose from 'mongoose';

import BidRepo from '../repo/bid.repo';
import EpochRewardRepo from '../repo/epochReward.repo';
import { checkNetworkWithDB, getNetworkFromCli } from '../utils';
import { connectDB } from '../utils/db';

const adjustEpochRewards = async () => {
  const net = getNetworkFromCli();
  if (!net) {
    process.exit(-1);
  }

  await connectDB(net);
  await checkNetworkWithDB(net);

  const bidRepo = new BidRepo();
  const epochRewardRepo = new EpochRewardRepo();

  const bids = await bidRepo.findAll();
  for (const b of bids) {
    if (b.type != 'autobid') {
      continue;
    }

    const amount = new BigNumber(b.amount).toFixed();
    const ereward = await epochRewardRepo.findByBid(b.epoch, b.blockNum, b.address, new BigNumber(amount));
    if (!ereward) {
      console.log(
        `create epoch reward: epoch:${b.epoch}, blockNum:${b.blockNum}, txHash:${b.txHash}, address:${b.address}, amount:${amount}`
      );
      // await epochRewardRepo.create({
      //   epoch: b.epoch,
      //   blockNum: b.blockNum,
      //   txHash: b.txHash,
      //   clauseIndex: b.clauseIndex,
      //   bidID: b.id,

      //   address: b.address,
      //   amount: new BigNumber(b.amount),
      //   type: 'autobid',
      // });
    } else {
      let updated = false;
      if (ereward.txHash != b.txHash) {
        console.log(`update txHash from ${ereward.txHash} to ${b.txHash} `);
        ereward.txHash = b.txHash;
        updated = true;
      }
      if (ereward.clauseIndex != b.clauseIndex) {
        console.log(`update clauseIndex from ${ereward.clauseIndex} to ${b.clauseIndex} `);
        ereward.clauseIndex = b.clauseIndex;
        updated = true;
      }
      if (ereward.bidID != b.id) {
        console.log(`update bidID from ${ereward.bidID} to ${b.id} `);
        ereward.bidID = b.id;
        updated = true;
      }
      if (updated) {
        console.log('save updated reward');
        // await ereward.save();
      } else {
        console.log(
          `skip: epoch:${b.epoch}, blockNum:${b.blockNum}, txHash:${b.txHash}, address:${b.address}, amount:${amount}`
        );
      }
    }
  }
};

(async () => {
  try {
    await adjustEpochRewards();
    await mongoose.disconnect();
  } catch (e) {
    console.log(`error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

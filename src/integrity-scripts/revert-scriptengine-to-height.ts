#!/usr/bin/env node
require('../utils/validateEnv');

import mongoose from 'mongoose';

import { Network } from '../const';
import AuctionRepo from '../repo/auction.repo';
import AuctionSummaryRepo from '../repo/auctionSummary.repo';
import BidRepo from '../repo/bid.repo';
import BlockRepo from '../repo/block.repo';
import BoundRepo from '../repo/bound.repo';
import EpochRewardRepo from '../repo/epochReward.repo';
import EpochRewardSummaryRepo from '../repo/epochRewardSummary.repo';
import HeadRepo from '../repo/head.repo';
import UnboundRepo from '../repo/unbound.repo';
import { checkNetworkWithDB, getNetworkFromCli } from '../utils';
import { connectDB } from '../utils/db';

const revertHeight = 4200000;

const revertToHeight = async () => {
  const net = getNetworkFromCli();
  if (!net) {
    process.exit(-1);
  }

  if (net === Network.MainNet) {
    console.log('NO REVERT ALLOWED ON MAINNET!!!');
    process.exit(-1);
  }

  await connectDB(net);
  const blockRepo = new BlockRepo();
  const blk = await blockRepo.findByNumber(revertHeight);
  if (!blk) {
    console.log('could not find this block: ', revertHeight);
    process.exit(-1);
  }

  await checkNetworkWithDB(net);

  const headRepo = new HeadRepo();
  const auctionRepo = new AuctionRepo();
  const auctionSummaryRepo = new AuctionSummaryRepo();
  const bidRepo = new BidRepo();
  const boundRepo = new BoundRepo();
  const unboundRepo = new UnboundRepo();
  const epochRewardRepo = new EpochRewardRepo();
  const epochRewardSummaryRepo = new EpochRewardSummaryRepo();
  let res: any;

  console.log('update auctions');
  res = await auctionRepo.deleteAfter(revertHeight);
  console.log(`deleted ${res.deletedCount} auctions: ${res.ok}`);

  console.log('update auctionSummaries');
  res = await auctionSummaryRepo.deleteAfter(revertHeight);
  console.log(`deleted ${res.deletedCount} auctionSummary: ${res.ok}`);

  console.log('update bids');
  res = await bidRepo.deleteAfter(revertHeight);
  console.log(`deleted ${res.deletedCount} bids: ${res.ok}`);

  console.log('update bounds');
  res = await boundRepo.deleteAfter(revertHeight);
  console.log(`deleted ${res.deletedCount} bounds: ${res.ok}`);

  console.log('update unbounds');
  res = await unboundRepo.deleteAfter(revertHeight);
  console.log(`deleted ${res.deletedCount} unbounds: ${res.ok}`);

  console.log('update epochRewards');
  res = await epochRewardRepo.deleteAfter(revertHeight);
  console.log(`deleted ${res.deletedCount} epochRewards: ${res.ok}`);

  console.log('update epochRewardSummaries');
  res = await epochRewardSummaryRepo.deleteAfter(revertHeight);
  console.log(`deleted ${res.deletedCount} epochRewardSummaries: ${res.ok}`);

  const seHead = await headRepo.findByKey('scriptengine');

  console.log('update heads');
  for (const head of [seHead]) {
    if (head.num > revertHeight) {
      head.num = blk.number;
      head.hash = blk.hash;
      await head.save();
      console.log(`update head ${head.key} to ${head.num}`);
    }
  }
};

(async () => {
  try {
    await revertToHeight();
    await mongoose.disconnect();
  } catch (e) {
    console.log(`error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

#!/usr/bin/env node
require('../utils/validateEnv');

import mongoose from 'mongoose';

import { Network } from '../const';
import AccountRepo from '../repo/account.repo';
import AuctionRepo from '../repo/auction.repo';
import AuctionSummaryRepo from '../repo/auctionSummary.repo';
import BidRepo from '../repo/bid.repo';
import BlockRepo from '../repo/block.repo';
import BoundRepo from '../repo/bound.repo';
import BucketRepo from '../repo/bucket.repo';
import CommitteeRepo from '../repo/committee.repo';
import EpochRewardRepo from '../repo/epochReward.repo';
import EpochRewardSummaryRepo from '../repo/epochRewardSummary.repo';
import HeadRepo from '../repo/head.repo';
import MovementRepo from '../repo/movement.repo';
import TxRepo from '../repo/tx.repo';
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
  const accountRepo = new AccountRepo();
  const auctionRepo = new AuctionRepo();
  const auctionSummaryRepo = new AuctionSummaryRepo();
  const bidRepo = new BidRepo();
  const boundRepo = new BoundRepo();
  const unboundRepo = new UnboundRepo();
  const bucketRepo = new BucketRepo();
  const committeeRepo = new CommitteeRepo();
  const epochRewardRepo = new EpochRewardRepo();
  const epochRewardSummaryRepo = new EpochRewardSummaryRepo();
  const movementRepo = new MovementRepo();
  const txRepo = new TxRepo();

  console.log('update accounts');
  await accountRepo.deleteAfter(revertHeight);

  console.log('update auctions');
  await auctionRepo.deleteAfter(revertHeight);

  console.log('update auctionSummaries');
  await auctionSummaryRepo.deleteAfter(revertHeight);

  console.log('update bids');
  await bidRepo.deleteAfter(revertHeight);

  console.log('update bounds');
  await boundRepo.deleteAfter(revertHeight);

  console.log('update unbounds');
  await unboundRepo.deleteAfter(revertHeight);

  console.log('update buckets');
  await bucketRepo.deleteAfterTimestamp(blk.timestamp);

  console.log('update committees');
  await committeeRepo.deleteAfter(revertHeight);

  console.log('update epochRewards');
  await epochRewardRepo.deleteAfter(revertHeight);

  console.log('update epochRewardSummaries');
  await epochRewardSummaryRepo.deleteAfter(revertHeight);

  console.log('update transfers');
  await movementRepo.deleteAfter(revertHeight);

  console.log('update txs');
  await txRepo.deleteAfter(revertHeight);

  console.log('update blocks');
  await blockRepo.deleteAfter(revertHeight);

  const posHead = await headRepo.findByKey('pos');
  const acctHead = await headRepo.findByKey('account');
  const seHead = await headRepo.findByKey('scriptengine');

  console.log('update heads');
  for (const head of [posHead, acctHead, seHead]) {
    if (head.num > revertHeight) {
      head.num = blk.number;
      head.hash = blk.hash;
      await head.save();
    }
  }
  console.log('POS Head:', posHead);
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

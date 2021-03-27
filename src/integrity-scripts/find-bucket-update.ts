#!/usr/bin/env node
require('../utils/validateEnv');

import { ScriptEngine } from '@meterio/devkit';
import BigNumber from 'bignumber.js';
import mongoose from 'mongoose';

import TxRepo from '../repo/tx.repo';
import { fromWei } from '../utils';
import { getNetworkFromCli } from '../utils';
import { connectDB } from '../utils/db';

const blockNum = 9470000;
const findBucketUpdate = async () => {
  const net = getNetworkFromCli();
  if (!net) {
    process.exit(-1);
  }

  await connectDB(net);
  const txRepo = new TxRepo();
  const txs = await txRepo.findTxsAfter(blockNum);
  let total = new BigNumber(0);
  let buckets = [];
  for (const tx of txs) {
    for (const c of tx.clauses) {
      try {
        if (c.data.length < 2) {
          continue;
        }
        const scriptData = ScriptEngine.decodeScriptData(c.data);
        if (scriptData.header.modId !== ScriptEngine.ModuleID.Staking) {
          continue;
        }
        const body = ScriptEngine.decodeStakingBody(scriptData.payload);
        if (body.opCode !== ScriptEngine.StakingOpCode.BucketUpdate) {
          continue;
        }
        buckets.push({
          amount: new BigNumber(body.amount).toFixed(),
          block: tx.block.number,
          txHash: tx.hash,
          from: tx.origin,
          bucketID: '0x' + body.bucketID.toString('hex'),
        });
        total = total.plus(body.amount);
        console.log(
          'found tx:',
          tx.hash,
          'on block: ',
          tx.block.number,
          ', from:',
          tx.origin,
          'amount: ',
          fromWei(new BigNumber(body.amount).toFixed())
        );
        break;
      } catch (e) {
        continue;
      }
    }
  }
  console.log('TOTAL mistaken amount: ', fromWei(total));
  for (const b of buckets) {
    console.log(`{"${b.bucketID}", "${b.from}", "${b.amount}"}, // ${b.block}`);
  }
};

(async () => {
  try {
    await findBucketUpdate();
    await mongoose.disconnect();
  } catch (e) {
    console.log(`error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

#!/usr/bin/env node
require('../utils/validateEnv');

import {
  HeadRepo,
  connectDB,
  disconnectDB,
  TxDigest,
  TxRepo,
  TxDigestRepo,
  Token,
  BigNumber,
} from '@meterio/scan-db/dist';

import { checkNetworkWithDB, getNetworkFromCli } from '../utils';
import { ZeroAddress } from '../const';

const run = async () => {
  const { network, standby } = getNetworkFromCli();

  await connectDB(network, standby);
  const headRepo = new HeadRepo();
  const txRepo = new TxRepo();
  const txDigestRepo = new TxDigestRepo();
  await checkNetworkWithDB(network);

  const pos = await headRepo.findByKey('pos');
  const best = pos.num;
  const step = 100000;

  for (let i = 0; i < best; i += step) {
    const start = i;
    const end = i + step - 1 > best ? best : i + step - 1;

    const txs = await txRepo.findInBlockRangeSortAsc(start, end);
    console.log(`searching for txs in blocks [${start}, ${end}]`);
    let txDigestsCache: TxDigest[] = [];
    for (const tx of txs) {
      for (const [clauseIndex, clause] of tx.clauses.entries()) {
        if (clause.data && clause.data.length == 10) {
          const signature = clause.data.substring(0, 10);

          const from = tx.origin;
          const to = clause.to || ZeroAddress;
          const exist = await txDigestRepo.existID(tx.block.number, tx.hash, from, to);
          if (!exist) {
            console.log(
              `Found missing txDigest { blockNum:${tx.block.number}, txHash:${tx.hash}, from:${from}, to:${to}}`
            );
            txDigestsCache.push({
              block: tx.block,
              txHash: tx.id,
              fee: new BigNumber(tx.paid),
              from,
              to,
              mtr: clause.token === Token.MTR ? new BigNumber(clause.value) : new BigNumber(0),
              mtrg: clause.token === Token.MTRG ? new BigNumber(clause.value) : new BigNumber(0),
              method: signature,
              reverted: tx.reverted,
              clauseIndexs: [clauseIndex],
              seq: 0,
            });
          }
        }
      }
    }
    if (txDigestsCache.length > 0) {
      console.log(`prepare to save ${txDigestsCache.length} txDigests`);
      const m = await txDigestRepo.bulkInsert(...txDigestsCache);
      console.log(`done`, m);
    }
  }
};

(async () => {
  try {
    await run();
    await disconnectDB();
  } catch (e) {
    console.log(`error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

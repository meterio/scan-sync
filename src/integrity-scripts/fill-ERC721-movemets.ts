#!/usr/bin/env node
require('../utils/validateEnv');

import { ERC721, abi } from '@meterio/devkit';
import {
  HeadRepo,
  connectDB,
  disconnectDB,
  LogEventRepo,
  LogTransfer,
  Movement,
  MovementRepo,
  BigNumber,
  Token,
  ContractRepo,
  ContractType,
  TokenBalanceRepo,
} from '@meterio/scan-db/dist';
import { TokenBalanceCache } from '../types';

import { checkNetworkWithDB, getNetworkFromCli } from '../utils';

const run = async () => {
  const { network, standby } = getNetworkFromCli();

  await connectDB(network, standby);
  const headRepo = new HeadRepo();
  const evtRepo = new LogEventRepo();
  const mvtRepo = new MovementRepo();
  const contractRepo = new ContractRepo();
  const tokenBalanceRepo = new TokenBalanceRepo();
  await checkNetworkWithDB(network);

  const pos = await headRepo.findByKey('pos');
  const best = pos.num;
  const step = 2000;

  for (let i = 0; i < best; i += step) {
    const start = i;
    const end = i + step - 1 > best ? best : i + step - 1;

    const transferEvts = await evtRepo.findByTopic0InBlockRangeSortAsc(ERC721.Transfer.signature, start, end);
    console.log('start checking...');
    let movementsCache: Movement[] = [];
    let tokenBalanceCache = new TokenBalanceCache(network);
    for (const evt of transferEvts) {
      if (evt.topics && evt.topics[0] === ERC721.Transfer.signature) {
        let decoded: abi.Decoded;
        try {
          decoded = ERC721.Transfer.decode(evt.data, evt.topics);
        } catch (e) {
          console.log('error decoding transfer event');
          return;
        }

        const from = decoded.from.toLowerCase();
        const to = decoded.to.toLowerCase();
        const tokenId = new BigNumber(decoded.tokenId).toNumber();
        const nftTransfers = [{ tokenId, value: 1 }];
        // ### Handle movement
        let movement: Movement = {
          from,
          to,
          amount: new BigNumber(0),
          token: Token.ERC721,
          tokenAddress: evt.address,
          nftTransfers,
          txHash: evt.txHash,
          block: evt.block,
          clauseIndex: evt.clauseIndex,
          logIndex: evt.logIndex,
        };

        const contract = await contractRepo.findByAddress(evt.address);
        if (contract && contract.type === ContractType.ERC721) {
          tokenBalanceCache.minusNFT(from, evt.address, nftTransfers, evt.block);
          tokenBalanceCache.plusNFT(to, evt.address, nftTransfers, evt.block);
        } else {
          console.log('[Warning] Found ERC721 transfer event, but ERC721 contract is not tracked!!');
          console.log('contract address: ', evt.address);
          console.log('event: ', evt);
          console.log('tx hash: ', evt.txHash);
        }

        movementsCache.push(movement);
      }
    }
    const bals = tokenBalanceCache.nftBalances();
    console.log(`prepare to update ${bals.length} balances`);
    for (const b of bals) {
      let tb = await tokenBalanceRepo.findByID(b.address, b.tokenAddress);
      if (!tb) {
        tb = await tokenBalanceRepo.create(b.address, b.tokenAddress, b.lastUpdate);
      }
      tb.nftBalances = b.nftBalances;
      const r = await tb.save();
      console.log(`done: `, b, r);
    }
    console.log(`prepare to save ${movementsCache.length} movements`);
    const m = await mvtRepo.bulkUpsert(...movementsCache);
    console.log(`done`, m);
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
#!/usr/bin/env node
require('../utils/validateEnv');

import {
  HeadRepo,
  connectDB,
  disconnectDB,
  TxRepo,
  ContractRepo,
  Tx,
  Contract,
  TraceOutput,
} from '@meterio/scan-db/dist';
import { prototype } from '../const';
import { Keccak } from 'sha3';

import { checkNetworkWithDB, getNetworkFromCli, isTraceable, Pos } from '../utils';
import { Document } from 'mongoose';
import PromisePool from '@supercharge/promise-pool/dist';

const run = async () => {
  const { network, standby } = getNetworkFromCli();

  await connectDB(network, standby);
  const headRepo = new HeadRepo();
  const txRepo = new TxRepo();
  const pos = new Pos(network);
  const contractRepo = new ContractRepo();
  await checkNetworkWithDB(network);

  const posHead = await headRepo.findByKey('pos');
  const best = posHead.num;
  const step = 100000;
  let updatedTxCache: (Tx & Document<any, any, any>)[] = [];
  let updatedContractCache: (Contract & Document<any, any, any>)[] = [];

  for (let i = 0; i < best; i += step) {
    const start = i;
    const end = i + step - 1 > best ? best : i + step - 1;

    const txs = await txRepo.findInBlockRangeSortAsc(start, end);
    console.log(`searching for txs in blocks [${start}, ${end}]`);
    for (const tx of txs) {
      if (tx.traces.length > 0) {
        // skip tx with traces
        continue;
      }

      let traces: TraceOutput[] = [];
      for (const [clauseIndex, clause] of tx.clauses.entries()) {
        let tracer: Pos.CallTracerOutput;
        if (isTraceable(tx.clauses[clauseIndex].data)) {
          tracer = await pos.traceClause(tx.block.hash, tx.id, clauseIndex);
          traces.push({ json: JSON.stringify(tracer), clauseIndex });
        }

        // try to find contract creation event
        if (tx.outputs && tx.outputs[clauseIndex]) {
          const o = tx.outputs[clauseIndex];
          for (const [logIndex, evt] of o.events.entries()) {
            if (evt.topics && evt.topics[0] === prototype.$Master.signature) {
              // contract creation tx
              const contract = await contractRepo.findByAddress(evt.address);

              // find creationInput in tracing
              let q = [tracer];
              let creationInputHash = '';
              while (q.length) {
                const node = q.shift();
                if (node.calls) {
                  for (const c of node.calls) {
                    q.push(c);
                  }
                }
                if ((node.type === 'CREATE' || node.type === 'CREATE2') && node.to === evt.address) {
                  const creationInput = node.input;
                  const hash = new Keccak(256);
                  hash.update(creationInput.replace('0x', ''));
                  creationInputHash = hash.digest('hex');
                  break;
                }
              }

              if (creationInputHash !== '') {
                if (!contract.verified) {
                  // if contract is unverified, try to do a code-match
                  const verifiedContract = await contractRepo.findVerifiedContractsWithCreationInputHash(
                    creationInputHash
                  );
                  if (verifiedContract) {
                    contract.verified = true;
                    contract.status = 'match';
                    contract.verifiedFrom = verifiedContract.address;
                    contract.creationInputHash = creationInputHash;
                    console.log(`plan to update contract ${contract.address} with code-match verification`);
                    updatedContractCache.push(contract);
                    continue;
                  }
                }

                if (contract.creationInputHash !== creationInputHash) {
                  contract.creationInputHash = creationInputHash;
                  console.log(`plan to update contract ${contract.address} with new creationInputHash`);
                  updatedContractCache.push(contract);
                }
              }
            }
          }
        }
      }

      if (traces.length > 0) {
        tx.traces = traces;
        console.log(`plan to update tx ${tx.hash} with ${traces.length} traces`);
        updatedTxCache.push(tx);
      }
    }

    if (updatedTxCache.length > 0) {
      console.log(`updated ${updatedTxCache.length} txs with traces`);
      await PromisePool.withConcurrency(4)
        .for(updatedTxCache)
        .process((doc) => {
          return doc.save();
        });
      updatedTxCache = [];
    }

    if (updatedContractCache.length > 0) {
      console.log(`updated ${updatedContractCache.length} contracts with creationInputHash`);
      await PromisePool.withConcurrency(4)
        .for(updatedContractCache)
        .process((doc) => {
          return doc.save();
        });
      updatedContractCache = [];
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

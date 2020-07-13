import { Meter } from '../../meter-rest';
import { Persist } from './persist';
import { blockIDtoNum, displayID } from '../../utils';
import { EnergyAddress, getPreAllocAccount, Network } from '../../const';
import { getConnection, EntityManager } from 'typeorm';
import { BlockProcessor, SnapAccount } from './block-processor';
import { AssetMovement } from '../../powergrid-db/entity/movement';
import { Account } from '../../powergrid-db/entity/account';
import { Snapshot } from '../../powergrid-db/entity/snapshot';
import {
  insertSnapshot,
  clearSnapShot,
  removeSnapshot,
  listRecentSnapshot,
} from '../../service/snapshot';
import { Processor, BlockSource } from '../processor';
import { AssetType, SnapType, MoveType } from '../../powergrid-db/types';
import * as logger from '../../logger';
import { AggregatedMovement } from '../../powergrid-db/entity/aggregated-move';
import { Block } from '../../powergrid-db/entity/block';
import { TransactionMeta } from '../../powergrid-db/entity/tx-meta';
import { getBlockByNumber, getBest } from '../../service/persist';

export class AssetTracking extends Processor {
  static HEAD_KEY = 'move-head';
  static SOURCE = BlockSource.LocalDB;

  constructor(readonly meter: Meter) {
    super(Mo);
    this.persist = new Persist();
  }

  protected bornAt() {
    return Promise.resolve(0);
  }

  protected get snapType() {
    return SnapType.DualToken;
  }

  /**
   * @return inserted column number
   */
  protected async processBlock(
    block: Block,
    txs: TransactionMeta[],
    manager: EntityManager,
    saveSnapshot = false
  ) {
    const proc = new BlockProcessor(block, this.meter, manager);

    const attachAggregated = (transfer: AssetMovement) => {
      if (transfer.sender === transfer.recipient) {
        const move = manager.create(AggregatedMovement, {
          participant: transfer.sender,
          type: MoveType.Self,
          asset: transfer.asset,
          seq: {
            blockNumber: block.number,
            moveIndex: transfer.moveIndex,
          },
        });

        transfer.aggregated = [move];
      } else {
        const sender = manager.create(AggregatedMovement, {
          participant: transfer.sender,
          type: MoveType.Out,
          asset: transfer.asset,
          seq: {
            blockNumber: block.number,
            moveIndex: transfer.moveIndex,
          },
        });

        const recipient = manager.create(AggregatedMovement, {
          participant: transfer.recipient,
          type: MoveType.In,
          asset: transfer.asset,
          seq: {
            blockNumber: block.number,
            moveIndex: transfer.moveIndex,
          },
        });

        transfer.aggregated = [sender, recipient];
      }
    };

    for (const meta of txs) {
      console.log('process tx: ', meta);
      for (const [clauseIndex, o] of meta.transaction.outputs.entries()) {
        for (const [logIndex, t] of o.transfers.entries()) {
          const token = meta.transaction.clauses[clauseIndex].token;
          let asset = AssetType.MTR;
          if (token === 1) {
            asset = AssetType.MTRG;
          }
          const transfer = manager.create(AssetMovement, {
            ...t,
            amount: BigInt(t.amount),
            txID: meta.txID,
            blockID: block.id,
            asset: asset,
            moveIndex: {
              txIndex: meta.seq.txIndex,
              clauseIndex,
              logIndex,
            },
          });
          attachAggregated(transfer);

          if (token === 1) {
            await proc.transferMTR(transfer);
          } else {
            await proc.transferMTRG(transfer);
          }
          if (saveSnapshot) {
            logger.log(
              `Account(${transfer.sender}) -> Account(${transfer.recipient}): ${transfer.amount} VET`
            );
          }
        }
      }
      await proc.touchMTR(meta.transaction.gasPayer);
    }
    if (txs.length) {
      await proc.touchMTR(block.beneficiary);
    }

    if (proc.Movement.length) {
      await this.persist.saveMovements(proc.Movement, manager);
    }
    if (saveSnapshot) {
      const snap = proc.snapshot();
      await insertSnapshot(snap, manager);
    }

    await proc.finalize();
    const accs = proc.accounts();
    if (accs.length) {
      await this.persist.saveAccounts(accs, manager);
    }

    return proc.Movement.length + accs.length;
  }

  protected async processGenesis() {
    const block = (await getBlockByNumber(0))!;
    const best = await getBest();
    console.log('BEST BLOCK:', best);

    await getConnection().transaction(async (manager) => {
      const proc = new BlockProcessor(block, this.meter, manager);

      for (const addr of getPreAllocAccount(block.id as Network)) {
        await proc.genesisAccount(addr);
      }

      await proc.finalize();
      console.log('genesis', proc.accounts);
      await this.persist.saveAccounts(proc.accounts(), manager);
      await this.saveHead(0, manager);
    });
    this.head = 0;
  }
}

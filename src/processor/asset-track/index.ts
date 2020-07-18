import { Meter } from '../../meter-rest';
import { getPreAllocAccount, Network } from '../../const';
import { getConnection, EntityManager } from 'typeorm';
import { BlockProcessor } from './block-processor';
import { AssetMovement } from '../../powergrid-db/entity/movement';
import { PosProcessor, BlockSource, ChainIndicator } from '../pos-processor';
import { AssetType, MoveType } from '../../powergrid-db/types';
import * as logger from '../../logger';
import { AggregatedMovement } from '../../powergrid-db/entity/aggregated-move';
import { Block } from '../../powergrid-db/entity/block';
import { Transaction } from '../../powergrid-db/entity/transaction';
import { PersistService } from '../../service';

const HEAD_KEY = 'asset-track-head';
const SOURCE = BlockSource.LocalDB;

export class AssetTrack extends PosProcessor {
  constructor(readonly meter: Meter) {
    super(HEAD_KEY, SOURCE, meter);
  }

  protected bornAt() {
    return Promise.resolve(0);
  }

  /**
   * @return inserted column number
   */
  protected async processBlock(
    block: Block,
    txs: Transaction[],
    manager: EntityManager
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

    for (const tx of txs) {
      console.log('process tx: ', tx);
      for (const [clauseIndex, o] of tx.outputs.entries()) {
        for (const [logIndex, t] of o.transfers.entries()) {
          const token = tx.clauses[clauseIndex].token;
          let asset = AssetType.MTR;
          if (token === 1) {
            asset = AssetType.MTRG;
          }
          const transfer = manager.create(AssetMovement, {
            ...t,
            amount: BigInt(t.amount),
            txID: tx.txID,
            blockID: block.id,
            asset: asset,
            moveIndex: {
              txIndex: tx.seq.txIndex,
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
        }
      }
      await proc.touchMTR(tx.gasPayer);
    }
    if (txs.length) {
      await proc.touchMTR(block.beneficiary);
    }

    if (proc.Movement.length) {
      await this.persist.saveMovements(proc.Movement);
    }

    await proc.finalize();
    const accs = proc.accounts();
    if (accs.length) {
      await this.persist.saveAccounts(accs);
    }

    return proc.Movement.length + accs.length;
  }

  protected async processGenesis() {
    const block = await this.meter.getBlock(0, 'expanded');
    const genesis = this.normalize(block, null);

    await getConnection().transaction(async (manager) => {
      const proc = new BlockProcessor(genesis.block, this.meter, manager);

      for (const addr of getPreAllocAccount(block.id as Network)) {
        await proc.genesisAccount(addr);
      }

      await proc.finalize();
      console.log('genesis', proc.accounts);
      const persistService = new PersistService(manager);
      await persistService.saveAccounts(proc.accounts());
      const head = new ChainIndicator(0, block.id);
      await persistService.saveHead(this.headKey, head);
      this.head = head;
    });
    return this.head;
  }
}

import { getConnection, MoreThan, EntityManager, In } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Block } from '../powergrid-db/entity/block';
import { ChainIndicator } from '../processor/processor';
import { Transaction } from '../powergrid-db/entity/transaction';
import { Config } from '../powergrid-db/entity/config';
import { Account } from '../powergrid-db/entity/account';
import { AssetMovement } from '../powergrid-db/entity/movement';
import { AssetType } from '../powergrid-db/types';

export class PersistService {
  manager: EntityManager = null;

  constructor(manager?: EntityManager) {
    if (!!manager) {
      this.manager = manager;
    } else {
      this.manager = getConnection().manager;
    }
  }

  // -----------------------------------------------------------------------
  // Config
  // -----------------------------------------------------------------------
  public saveHead(headKey: string, head: ChainIndicator) {
    const config = new Config();
    config.key = headKey;
    config.value = `${head.number},${head.hash}`;

    return this.manager.save(config);
  }

  public async loadHead(headKey: string): Promise<ChainIndicator | null> {
    const head = await this.manager
      .getRepository(Config)
      .findOne({ key: headKey });
    if (head) {
      const items = head.value.split(',');
      return new ChainIndicator(parseInt(items[0], 10), items[1]);
    } else {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Block
  // -----------------------------------------------------------------------
  public getBest() {
    return this.manager
      .getRepository(Block)
      .findOne({
        where: { isTrunk: true },
        order: { id: 'DESC' },
      })
      .then((block) => {
        if (!!block) {
          return Promise.resolve(new ChainIndicator(block.number, block.id));
        }
        return Promise.resolve(null);
      });
  }

  public getBlockByID(blockID: string) {
    return this.manager.getRepository(Block).findOne({ id: blockID });
  }

  public getBlockByNumber(num: number) {
    return this.manager
      .getRepository(Block)
      .findOne({ number: num, isTrunk: true });
  }

  public async getExpandedBlockByNumber(num: number) {
    const block = await this.manager
      .getRepository(Block)
      .findOne({ number: num, isTrunk: true });

    if (!block) {
      return { block, txs: [] } as {
        block: Block | undefined;
        txs: Transaction[];
      };
    }

    const txs = await this.manager.getRepository(Transaction).find({
      where: { blockID: block.id },
      order: { seq: 'ASC' },
    });

    return { block, txs };
  }

  public async getExpandedBlockByID(id: string) {
    const block = await this.manager.getRepository(Block).findOne({ id });

    if (!block) {
      return { block, txs: [] } as {
        block: Block | undefined;
        txs: Transaction[];
      };
    }

    const txs = await this.manager.getRepository(Transaction).find({
      where: { blockID: block.id },
      order: { seq: 'ASC' },
    });

    return { block, txs };
  }

  public listRecentBlock(head: number) {
    const blockID =
      '0x' + BigInt(head).toString(16).padStart(8, '0').padEnd(64, 'f');

    return this.manager.getRepository(Block).find({
      where: { id: MoreThan(blockID) },
      order: { id: 'ASC' },
    });
  }

  public updateBlock(id: string, partialEntity: QueryDeepPartialEntity<Block>) {
    return this.manager.getRepository(Block).update({ id }, partialEntity);
  }

  public removeBlock(id: string) {
    return this.manager.getRepository(Block).delete({ id });
  }

  public insertBlock(block: QueryDeepPartialEntity<Block>) {
    return this.manager.insert(Block, block);
  }

  // -----------------------------------------------------------------------
  // Transaction
  // -----------------------------------------------------------------------
  public insertTransaction(txs: Array<QueryDeepPartialEntity<Transaction>>) {
    return this.manager.insert(Transaction, txs);
  }

  // -----------------------------------------------------------------------
  // AssetMovement
  // -----------------------------------------------------------------------
  public saveMovements(moves: AssetMovement[]) {
    return this.manager.save(AssetMovement, moves);
  }

  public removeMovements(ids: string[]) {
    return this.manager.getRepository(AssetMovement).delete({
      blockID: In([...ids]),
      asset: In([AssetType.MTR, AssetType.MTRG]),
    });
  }

  // -----------------------------------------------------------------------
  // Account
  // -----------------------------------------------------------------------
  public saveAccounts(accs: Account[]) {
    return this.manager.save(accs);
  }

  public removeAccounts(accs: string[]) {
    return this.manager.getRepository(Account).delete({
      address: In([...accs]),
    });
  }
}

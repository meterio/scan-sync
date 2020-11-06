import '@meterio/flex';
import '@meterio/flex-framework';
import { Network } from '../const';
import { Net } from './net';
import LRU from 'lru-cache';
import { blockIDtoNum, isBytes32 } from './utils';

export namespace Pos {
  export type ExpandedBlock = Omit<
    Required<Flex.Meter.Block>,
    'transactions'
  > & {
    transactions: Array<
      Omit<Flex.Meter.Transaction, 'meta'> & Omit<Flex.Meter.Receipt, 'meta'>
    >;
  };
  export type Block<T extends 'expanded' | 'regular'> = T extends 'expanded'
    ? ExpandedBlock
    : Required<Flex.Meter.Block>;
  export type Transaction = Flex.Meter.Transaction;
  export type Receipt = Flex.Meter.Receipt;
  export type Account = Flex.Meter.Account;
  export type Code = Flex.Meter.Code;
  export type Storage = Flex.Meter.Storage;
  export type Event = Flex.Meter.Event;
  export type VMOutput = Flex.Meter.VMOutput;
}

export class Pos {
  private cache: LRU<string, any>;
  private get headerValidator() {
    return (headers: Record<string, string>) => {
      const xGeneID = headers['x-genesis-id'];
      if (xGeneID && xGeneID !== this.genesisID) {
        throw new Error(`responded 'x-genesis-id' not match`);
      }
    };
  }

  // default genesis ID to mainnet
  constructor(readonly net: Net, readonly genesisID = Network.MainNet) {
    this.cache = new LRU<string, any>(1024 * 4);
  }

  public async getBlock<T extends 'expanded' | 'regular'>(
    revision: string | number,
    type: T
  ): Promise<Pos.Block<T> | null> {
    const expanded = type === 'expanded';
    const cacheOrLoad = async (func: () => Promise<Pos.Block<T> | null>) => {
      if (revision === 'best') {
        return func();
      }

      const { key, IDKey } = ((): { key: string; IDKey: string } => {
        if (typeof revision === 'string' && isBytes32(revision)) {
          return {
            key: (expanded ? 'b-e' : 'b-r') + blockIDtoNum(revision).toString(),
            IDKey: (expanded ? 'b-e' : 'b-r') + revision,
          };
        } else if (typeof revision === 'number') {
          return {
            key: (expanded ? 'b-e' : 'b-r') + revision.toString(),
            IDKey: '',
          };
        } else {
          throw new Error('invalid block revision');
        }
      })();

      if (this.cache.has(key!)) {
        return this.cache.get(key!) as Pos.Block<T>;
      } else if (!!IDKey && this.cache.has(IDKey)) {
        return this.cache.get(IDKey!) as Pos.Block<T>;
      }

      const b = await func();
      // cache blocks 10 minutes earlier than now
      if (b) {
        if (expanded) {
          const regular = {
            ...b,
            transactions: (b as Pos.ExpandedBlock).transactions.map(
              (x) => x.id
            ),
          };
          this.cache.set('b-r' + b.number, regular);
          this.cache.set('b-r' + b.id, regular);

          this.cache.set('b-e' + b.number, b);
          this.cache.set('b-e' + b.id, b);
        } else {
          this.cache.set('b-r' + b.number, b);
          this.cache.set('b-r' + b.id, b);
        }
      }
      return b;
    };

    return cacheOrLoad(() => {
      return this.httpGet<Pos.Block<T> | null>(`blocks/${revision}`, {
        expanded,
      });
    });
  }
  public getTransaction(id: string, head?: string) {
    return this.httpGet<Pos.Transaction>(
      `transactions/${id}`,
      head ? { head } : {}
    );
  }
  public getReceipt(id: string, head?: string) {
    return this.httpGet<Pos.Receipt>(
      `transactions/${id}/receipt`,
      head ? { head } : {}
    );
  }
  public async getAccount(addr: string, revision?: string) {
    const get = () => {
      return this.httpGet<Pos.Account>(
        `accounts/${addr}`,
        revision ? { revision } : {}
      );
    };
    if (revision && isBytes32(revision)) {
      const key = 'a' + revision + addr;
      if (this.cache.has(key)) {
        return this.cache.get(key) as Pos.Account;
      }

      const acc = await get();
      this.cache.set(key, acc);
      return acc;
    }

    return get();
  }
  public getCode(addr: string, revision?: string) {
    return this.httpGet<Pos.Code>(
      `accounts/${addr}/code`,
      revision ? { revision } : {}
    );
  }
  public getStorage(addr: string, key: string, revision?: string) {
    return this.httpGet<Pos.Storage>(
      `accounts/${addr}/storage/${key}`,
      revision ? { revision } : {}
    );
  }

  public filterEventLogs(arg: Flex.Driver.FilterEventLogsArg) {
    return this.httpPost<Pos.Event[]>('logs/event', arg);
  }

  public explain(arg: Flex.Driver.ExplainArg, revision: string) {
    return this.httpPost<Pos.VMOutput[]>('accounts/*', arg, { revision });
  }

  public httpPost<T>(
    path: string,
    body: object,
    query?: Record<string, string>
  ): Promise<T> {
    return this.net.http('POST', path, {
      query,
      body,
      validateResponseHeader: this.headerValidator,
    });
  }

  protected httpGet<T>(path: string, query?: Record<string, any>): Promise<T> {
    return this.net.http('GET', path, {
      query,
      validateResponseHeader: this.headerValidator,
    });
  }
}

import BigNumber from 'bignumber.js';
import * as Logger from 'bunyan';

import { MTRGSystemContract, MTRSystemContract, Network, Token, TransferEvent } from '../const';
import { Block } from '../model/block.interface';
import { Transfer } from '../model/transfer.interface';
import { Tx } from '../model/tx.interface';
import { TokenBalanceRepo } from '../repo/tokenBalance.repo';
import { BlockReviewer } from './blockReviewer';

class TokenDeltaMap {
  private accts: { [key: string]: BigNumber } = {};
  constructor() {}

  public minus(addr: string, tokenAddr: string, amount: string | BigNumber) {
    const key = `${addr}_${tokenAddr}`;
    if (!(key in this.accts)) {
      this.accts[key] = new BigNumber(0);
    }
    this.accts[key] = this.accts[key].minus(amount);
  }

  public plus(addr: string, tokenAddr: string, amount: string | BigNumber) {
    const key = `${addr}_${tokenAddr}`;
    if (!(key in this.accts)) {
      this.accts[key] = new BigNumber(0);
    }
    this.accts[key] = this.accts[key].plus(amount);
  }

  public keys(): string[] {
    return Object.keys(this.accts);
  }

  public getDelta(key: string): BigNumber {
    if (key in this.accts) {
      return this.accts[key];
    }
    return new BigNumber(0);
  }
}

export class ERC20CMD extends BlockReviewer {
  private tokenBalanceRepo = new TokenBalanceRepo();
  constructor(net: Network) {
    super(net);
    this.name = 'erc20';
    this.logger = Logger.createLogger({ name: this.name });
  }

  getERC20Transfers(tx: Tx, txIndex: number): Transfer[] {
    let transfers: Transfer[] = [];
    for (const [clauseIndex, o] of tx.outputs.entries()) {
      for (const [logIndex, e] of o.events.entries()) {
        if (e.topics[0] === TransferEvent.signature) {
          if (e.address === MTRSystemContract.address || e.address === MTRGSystemContract.address) {
            continue;
          }
          const decoded = TransferEvent.decode(e.data, e.topics);
          let transfer = {
            from: decoded._from,
            to: decoded._to,
            amount: new BigNumber(decoded._value),
            token: Token.ERC20,
            tokenAddress: decoded._from,
            txHash: tx.hash,
            block: tx.block,
            clauseIndex,
            logIndex,
          };
          transfers.push(transfer);
        }
      }
    }
    return transfers;
  }

  async processBlock(blk: Block) {
    let transfers = [];
    // extract ERC20 transfers
    for (const [txIndex, txHash] of blk.txHashs.entries()) {
      const txModel = await this.txRepo.findByHash(txHash);
      const erc20Tranfers = this.getERC20Transfers(txModel, txIndex);
      transfers = transfers.concat(erc20Tranfers);
    }
    await this.transferRepo.bulkInsert(...transfers);

    // calculate token balance deltas
    let accts = new TokenDeltaMap();
    for (const tr of transfers) {
      const from = tr.from;
      const to = tr.to;
      accts.minus(from, tr.tokenAddress, tr.amount);
      accts.plus(to, tr.tokenAddress, tr.amount);
      this.logger.info(
        { from, to, amount: tr.amount.toFixed(0), token: Token[tr.token], tokenAddress: tr.tokenAddress },
        'transfer'
      );
    }

    // apply deltas to actual token balance
    for (const key of accts.keys()) {
      const items = key.split('_');
      const addr = items[0];
      const tokenAddr = items[1];
      const delta = accts.getDelta(addr);
      let tb = await this.tokenBalanceRepo.findByAddress(addr, tokenAddr);
      if (!tb) {
        const blockConcise = {
          number: blk.number,
          hash: blk.hash,
          timestamp: blk.timestamp,
        };
        tb = await this.tokenBalanceRepo.create(addr, tokenAddr);
        tb.balance = delta;
      } else {
        tb.balance = tb.balance.plus(delta);
      }
      await tb.save();
    }
  }

  async processGenesis() {
    return;
  }
}

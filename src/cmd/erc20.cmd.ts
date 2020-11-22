import BigNumber from 'bignumber.js';
import * as Logger from 'bunyan';

import { Network, Token, TokenBasic, TransferEvent, getERC20Token } from '../const';
import { Block } from '../model/block.interface';
import { Transfer } from '../model/transfer.interface';
import { Tx } from '../model/tx.interface';
import { TokenBalanceRepo } from '../repo/tokenBalance.repo';
import { BlockReviewer } from './blockReviewer';

class TokenDeltaMap {
  private accts: { [key: string]: BigNumber } = {};
  constructor() {}

  public minus(addr: string, amount: string | BigNumber) {
    if (!(addr in this.accts)) {
      this.accts[addr] = new BigNumber(0);
    }
    this.accts[addr] = this.accts[addr].minus(amount);
  }

  public plus(addr: string, amount: string | BigNumber) {
    if (!(addr in this.accts)) {
      this.accts[addr] = new BigNumber(0);
    }
    this.accts[addr] = this.accts[addr].plus(amount);
  }

  public addresses(): string[] {
    return Object.keys(this.accts);
  }

  public getDelta(addr: string): BigNumber {
    if (addr in this.accts) {
      return this.accts[addr];
    }
    return new BigNumber(0);
  }
}

export class ERC20CMD extends BlockReviewer {
  private token: TokenBasic;
  private tokenBalanceRepo = new TokenBalanceRepo();
  constructor(net: Network, tokenName: string) {
    super(net);
    const token: Token = Token[tokenName.toUpperCase() as keyof typeof Token];
    if (token === undefined) {
      throw new Error(`unknown token: ${tokenName}|`);
    }
    this.name = 'erc20';
    this.token = getERC20Token(this.network, token);
    this.logger = Logger.createLogger({ name: this.name });
  }

  processTx(tx: Tx, txIndex: number): Transfer[] {
    let transfers: Transfer[] = [];
    for (const [clauseIndex, o] of tx.outputs.entries()) {
      for (const [logIndex, e] of o.events.entries()) {
        if (e.address === this.token.address && e.topics[0] === TransferEvent.signature) {
          const decoded = TransferEvent.decode(e.data, e.topics);
          let transfer = {
            from: decoded._from,
            to: decoded._to,
            token: this.token.token,
            amount: new BigNumber(decoded._value),
            address: decoded._from,
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
    for (const [txIndex, txHash] of blk.txHashs.entries()) {
      const txModel = await this.txRepo.findByHash(txHash);
      const txTranfers = this.processTx(txModel, txIndex);
      transfers = transfers.concat(txTranfers);
    }
    await this.transferRepo.bulkInsert(...transfers);

    let accts = new TokenDeltaMap();
    for (const tr of transfers) {
      const from = tr.from;
      const to = tr.to;
      accts.minus(from, tr.amount);
      accts.plus(to, tr.amount);
      this.logger.info({ from, to, amount: tr.amount.toFixed(0), token: Token[tr.token] }, 'transfer');
    }

    for (const addr of accts.addresses()) {
      const delta = accts.getDelta(addr);
      let acct = await this.tokenBalanceRepo.findByAddress(addr, this.token.token);
      if (!acct) {
        const blockConcise = {
          number: blk.number,
          hash: blk.hash,
          timestamp: blk.timestamp,
        };
        acct = await this.tokenBalanceRepo.create(addr, this.token.address);
        acct.balance = delta;
      } else {
        acct.balance = acct.balance.plus(delta);
      }
      await acct.save();
    }
  }
  async processGenesis() {
    return;
  }
}

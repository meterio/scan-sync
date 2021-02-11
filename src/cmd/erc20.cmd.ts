import { hasUncaughtExceptionCaptureCallback } from 'process';

import BigNumber from 'bignumber.js';
import * as Logger from 'bunyan';

import {
  MTRGSystemContract,
  MTRSystemContract,
  Network,
  Token,
  TransferEvent,
  decimalsABIFunc,
  nameABIFunc,
  prototype,
  symbolABIFunc,
  totalSupply,
} from '../const';
import { Block } from '../model/block.interface';
import { Transfer } from '../model/transfer.interface';
import { Tx } from '../model/tx.interface';
import { TokenBalanceRepo } from '../repo/tokenBalance.repo';
import { TokenProfileRepo } from '../repo/tokenProfile.repo';
import { TxBlockReviewer } from './blockReviewer';

class TokenDeltaMap {
  private accts: { [key: string]: BigNumber } = {};
  constructor() {}

  public minus(addrStr: string, tokenAddr: string, amount: string | BigNumber) {
    const addr = addrStr.toLowerCase();
    const key = `${addr}_${tokenAddr}`;
    if (!(key in this.accts)) {
      this.accts[key] = new BigNumber(0);
    }
    this.accts[key] = this.accts[key].minus(amount);
  }

  public plus(addrStr: string, tokenAddr: string, amount: string | BigNumber) {
    const addr = addrStr.toLowerCase();
    const key = `${addr}_${tokenAddr}`;
    if (!(key in this.accts)) {
      this.accts[key] = new BigNumber(0);
    }
    this.accts[key] = this.accts[key].plus(amount);
  }

  public keys(): string[] {
    return Object.keys(this.accts);
  }

  public getDelta(addrStr: string): BigNumber {
    const addr = addrStr.toLowerCase();

    if (addr in this.accts) {
      return this.accts[addr];
    }
    return new BigNumber(0);
  }
}

export class ERC20CMD extends TxBlockReviewer {
  private tokenBalanceRepo = new TokenBalanceRepo();
  private tokenProfileRepo = new TokenProfileRepo();
  constructor(net: Network) {
    super(net);
    this.name = 'erc20';
    this.logger = Logger.createLogger({ name: this.name });
  }

  async getERC20Transfers(tx: Tx, txIndex: number, blkHash: string): Promise<Transfer[]> {
    let transfers: Transfer[] = [];
    for (const [clauseIndex, o] of tx.outputs.entries()) {
      for (const [logIndex, e] of o.events.entries()) {
        // ERC20 contract creation
        try {
          if (e.topics[0] === prototype.$Master.signature) {
            const outputs = await this.pos.explain(
              {
                clauses: [
                  { to: e.address, value: '0x0', data: nameABIFunc.encode(), token: Token.MTR },
                  { to: e.address, value: '0x0', data: symbolABIFunc.encode(), token: Token.MTR },
                  { to: e.address, value: '0x0', data: decimalsABIFunc.encode(), token: Token.MTR },
                  { to: e.address, value: '0x0', data: totalSupply.encode(), token: Token.MTR },
                ],
              },
              blkHash
            );
            const nameDecoded = nameABIFunc.decode(outputs[0].data);
            const symbolDecoded = symbolABIFunc.decode(outputs[1].data);
            const decimalsDecoded = decimalsABIFunc.decode(outputs[2].data);
            const totalSupplyDecoded = totalSupply.decode(outputs[3].data);
            const name = nameDecoded['0'];
            const symbol = symbolDecoded['0'];
            const decimals = decimalsDecoded['0'];
            const totalSupplyVal = totalSupplyDecoded['0'];
            await this.tokenProfileRepo.create(name, symbol, e.address, '', new BigNumber(totalSupplyVal), decimals);
          }
        } catch (e) {
          console.log('error during erc20 creation');
        }

        if (e.topics[0] === TransferEvent.signature) {
          const decoded = TransferEvent.decode(e.data, e.topics);
          let transfer = {
            from: decoded._from.toLowerCase(),
            to: decoded._to.toLowerCase(),
            amount: new BigNumber(decoded._value),
            token: Token.ERC20,
            tokenAddress: e.address.toLowerCase(),
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

  // deprecated
  isTransferOnly(tx: Tx): boolean {
    for (const o of tx.outputs) {
      if (o.events && o.events.length > 0) {
        // if event is returned, it must be a call
        return false;
      }
      if ((!o.transfers || o.transfers.length == 0) && (!o.events || o.events.length == 0)) {
        // if no transfer/event found, it must not be transfer
        return false;
      }
    }
    return true;
  }

  async processBlock(blk: Block) {
    let transfers = [];
    for (const [txIndex, txHash] of blk.txHashs.entries()) {
      const txModel = await this.txRepo.findByHash(txHash);
      if (!txModel) {
        throw new Error('could not find tx, maybe the block is still being processed');
      }
      const erc20Tranfers = await this.getERC20Transfers(txModel, txIndex, blk.hash);
      transfers = transfers.concat(erc20Tranfers);
    }
    await this.transferRepo.bulkInsert(...transfers);

    // calculate token balance deltas
    let accts = new TokenDeltaMap();
    for (const tr of transfers) {
      if (
        tr.tokenAddress.toLowerCase() === MTRGSystemContract.address ||
        tr.tokenAddress.toLowerCase() === MTRSystemContract.address
      ) {
        continue;
      }
      const from = tr.from;
      const to = tr.to;
      accts.minus(from, tr.tokenAddress, tr.amount);
      accts.plus(to, tr.tokenAddress, tr.amount);
      this.logger.info(
        { from, to, amount: tr.amount.toFixed(0), token: Token[tr.token], tokenAddress: tr.tokenAddress },
        'transfer'
      );
    }
    const blockConcise = {
      number: blk.number,
      hash: blk.hash,
      timestamp: blk.timestamp,
    };

    // apply deltas to actual token balance
    for (const key of accts.keys()) {
      const items = key.split('_');
      const addr = items[0];
      const tokenAddr = items[1];
      const delta = accts.getDelta(addr);
      let tb = await this.tokenBalanceRepo.findByAddress(addr, tokenAddr);
      if (!tb) {
        tb = await this.tokenBalanceRepo.create(addr, tokenAddr, blockConcise);
        tb.balance = delta;
      } else {
        tb.balance = tb.balance.plus(delta);
        tb.lastUpdate = blockConcise;
      }
      await tb.save();
    }
  }

  async processGenesis() {
    return;
  }
}

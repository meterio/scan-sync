import BigNumber from 'bignumber.js';
import * as Logger from 'bunyan';

import { Network, Token, TransferEvent, getERC20Token, getPreAllocAccount, prototype } from '../const';
import { Block } from '../model/block.interface';
import { Transfer } from '../model/transfer.interface';
import { Tx } from '../model/tx.interface';
import { BlockReviewer } from './blockReviewer';

interface AccountDelta {
  mtr: BigNumber;
  mtrg: BigNumber;
}

class AccountDeltaMap {
  private accts: { [key: string]: AccountDelta } = {};

  public minus(addr: string, token: Token, amount: string | BigNumber) {
    if (!(addr in this.accts)) {
      this.accts[addr] = { mtr: new BigNumber(0), mtrg: new BigNumber(0) };
    }
    if (token === Token.MTR) {
      this.accts[addr].mtr = this.accts[addr].mtr.minus(amount);
    }
    if (token === Token.MTRG) {
      this.accts[addr].mtrg = this.accts[addr].mtrg.minus(amount);
    }
  }

  public plus(addr: string, token: Token, amount: string | BigNumber) {
    if (!(addr in this.accts)) {
      this.accts[addr] = { mtr: new BigNumber(0), mtrg: new BigNumber(0) };
    }
    if (token === Token.MTR) {
      this.accts[addr].mtr = this.accts[addr].mtr.plus(amount);
    }
    if (token === Token.MTRG) {
      this.accts[addr].mtrg = this.accts[addr].mtrg.plus(amount);
    }
  }

  public addresses(): string[] {
    return Object.keys(this.accts);
  }

  public getDelta(addr: string): AccountDelta {
    if (addr in this.accts) {
      return this.accts[addr];
    }
    return { mtr: new BigNumber(0), mtrg: new BigNumber(0) };
  }
}

export class AccountCMD extends BlockReviewer {
  private contracts: { [key: string]: string } = {};
  constructor(net: Network) {
    super(net);
    this.name = 'account';
    this.logger = Logger.createLogger({ name: this.name });
  }

  processTx(tx: Tx, txIndex: number): Transfer[] {
    let transfers: Transfer[] = [];
    if (tx.reverted) {
      return [];
    }
    const mtrToken = getERC20Token(this.network, Token.MTR);
    const mtrgToken = getERC20Token(this.network, Token.MTRG);
    for (const [clauseIndex, o] of tx.outputs.entries()) {
      const clause = tx.clauses[clauseIndex];

      // track native transfers
      for (const [logIndex, t] of o.transfers.entries()) {
        transfers.push({
          from: tx.origin,
          to: clause.to,
          token: clause.token,
          tokenAddress: '',
          amount: new BigNumber(clause.value),
          txHash: tx.hash,
          block: tx.block,
          clauseIndex,
          logIndex,
        });
      }
      for (const [logIndex, e] of o.events.entries()) {
        // contract creation
        if (e.topics[0] === prototype.$Master.signature) {
          const decoded = prototype.$Master.decode(e.data, e.topics);
          this.contracts[e.address] = decoded.newMaster;
          // await proc.master(e.address, decoded.newMaster);
        }

        // track system contract transfers
        if (e.topics[0] === TransferEvent.signature) {
          const decoded = TransferEvent.decode(e.data, e.topics);
          let transfer = {
            from: decoded._from,
            to: decoded._to,
            token: Token.ERC20,
            amount: new BigNumber(decoded._value),
            tokenAddress: '',
            txHash: tx.hash,
            block: tx.block,
            clauseIndex,
            logIndex,
          };
          if (e.address === mtrToken.address) {
            transfer.token = Token.MTR;
            transfers.push(transfer);
          }
          if (e.address === mtrgToken.address) {
            transfer.token = Token.MTRG;
            transfers.push(transfer);
          }
        }
      }
    }
    return transfers;
  }

  async processBlock(blk: Block) {
    let transfers = [];
    let accts = new AccountDeltaMap();
    for (const [txIndex, txHash] of blk.txHashs.entries()) {
      const txModel = await this.txRepo.findByHash(txHash);
      const txTranfers = this.processTx(txModel, txIndex);
      transfers = transfers.concat(txTranfers);

      // substract fee from gas payer
      accts.minus(txModel.gasPayer, Token.MTR, txModel.paid);
    }
    for (const tr of transfers) {
      console.log(tr.from, tr.to, tr.amount.toFixed(), '>', tr.txHash, tr.clauseIndex);
    }
    await this.transferRepo.bulkInsert(...transfers);

    for (const tr of transfers) {
      const from = tr.from;
      const to = tr.to;
      accts.minus(from, tr.token, tr.amount);
      accts.plus(to, tr.token, tr.amount);
      this.logger.info({ from, to, amount: tr.amount.toFixed(0), token: Token[tr.token] }, 'transfer');
    }

    const blockConcise = {
      number: blk.number,
      hash: blk.hash,
      timestamp: blk.timestamp,
    };

    // account balance update
    for (const addr of accts.addresses()) {
      const delta = accts.getDelta(addr);
      let acct = await this.accountRepo.findByAddress(addr);
      if (!acct) {
        acct = await this.accountRepo.create(addr, blockConcise, blockConcise);
        acct.mtrBalance = delta.mtr;
        acct.mtrgBalance = delta.mtrg;
      } else {
        acct.mtrBalance = acct.mtrBalance.plus(delta.mtr);
        acct.mtrgBalance = acct.mtrgBalance.plus(delta.mtrg);
      }
      this.logger.info({ addr: acct.address, mtr: acct.mtrBalance, mtrg: acct.mtrgBalance }, 'account updated');
      await acct.save();
    }

    // contract creation
    for (const address in this.contracts) {
      let acct = await this.accountRepo.findByAddress(address);
      if (!acct) {
        acct = await this.accountRepo.create(address, blockConcise, blockConcise);
      }
      const code = await this.pos.getCode(address, blk.hash);
      if (code && code.code !== '0x') {
        acct.code = code.code;
      }
      await acct.save();
    }

    this.logger.info({ number: blk.number, id: blk.hash }, `processed block ${blk.number}`);
  }

  protected async processGenesis() {
    const genesis = (await this.blockRepo.findByNumber(0))!;
    this.logger.info({ number: genesis.number, hash: genesis.hash }, 'process genesis');

    for (const addr of getPreAllocAccount(this.network)) {
      const chainAcc = await this.pos.getAccount(addr, genesis.hash);

      const blockConcise = { number: genesis.number, hash: genesis.hash, timestamp: genesis.timestamp };
      let acct = await this.accountRepo.create(addr, blockConcise, blockConcise);
      acct.mtrgBalance = new BigNumber(chainAcc.balance);
      acct.mtrBalance = new BigNumber(chainAcc.energy);

      if (chainAcc.hasCode) {
        const chainCode = await this.pos.getCode(addr, genesis.hash);
        acct.code = chainCode.code;
      }
      this.logger.info(
        { address: addr, MTR: acct.mtrBalance.toFixed(), MTRG: acct.mtrgBalance.toFixed() },
        `saving genesis account`
      );
      await acct.save();
    }
  }
}

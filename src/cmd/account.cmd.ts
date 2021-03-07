import * as devkit from '@meterio/devkit';
import BigNumber from 'bignumber.js';
import * as Logger from 'bunyan';

import {
  BoundEvent,
  Network,
  Token,
  TransferEvent,
  UnboundEvent,
  ZeroAddress,
  getERC20Token,
  getPreAllocAccount,
  prototype,
} from '../const';
import { Block } from '../model/block.interface';
import { Bound } from '../model/bound.interface';
import { Transfer } from '../model/transfer.interface';
import { Tx } from '../model/tx.interface';
import { Unbound } from '../model/unbound.interface';
import BoundRepo from '../repo/bound.repo';
import UnboundRepo from '../repo/unbound.repo';
import { fromWei } from '../utils/utils';
import { TxBlockReviewer } from './blockReviewer';

interface AccountDelta {
  mtr: BigNumber;
  mtrg: BigNumber;

  mtrBounded: BigNumber;
  mtrgBounded: BigNumber;
}

const printTransfer = (t: Transfer) => {
  console.log(
    `Transfer #${t.clauseIndex}: ${t.from} to ${t.to} with ${fromWei(t.amount)} ${Token[t.token]} (${t.logIndex})`
  );
};

class AccountDeltaMap {
  private accts: { [key: string]: AccountDelta } = {};

  public minus(addrStr: string, token: Token, amount: string | BigNumber) {
    const addr = addrStr.toLowerCase();
    this.setDefault(addrStr);
    if (token === Token.MTR) {
      this.accts[addr].mtr = this.accts[addr].mtr.minus(amount);
    }
    if (token === Token.MTRG) {
      this.accts[addr].mtrg = this.accts[addr].mtrg.minus(amount);
    }
  }

  private setDefault(addrStr: string) {
    const addr = addrStr.toLowerCase();
    if (!(addr in this.accts)) {
      this.accts[addr] = {
        mtr: new BigNumber(0),
        mtrg: new BigNumber(0),
        mtrBounded: new BigNumber(0),
        mtrgBounded: new BigNumber(0),
      };
    }
  }

  public plus(addrStr: string, token: Token, amount: string | BigNumber) {
    const addr = addrStr.toLowerCase();
    this.setDefault(addrStr);
    if (token === Token.MTR) {
      this.accts[addr].mtr = this.accts[addr].mtr.plus(amount);
    }
    if (token === Token.MTRG) {
      this.accts[addr].mtrg = this.accts[addr].mtrg.plus(amount);
    }
  }

  public bound(addrStr: string, token: Token, amount: string | BigNumber) {
    const addr = addrStr.toLowerCase();
    this.setDefault(addrStr);
    if (token === Token.MTR) {
      this.accts[addr].mtr = this.accts[addr].mtr.minus(amount);
      this.accts[addr].mtrBounded = this.accts[addr].mtrBounded.plus(amount);
    }
    if (token === Token.MTRG) {
      this.accts[addr].mtrg = this.accts[addr].mtrg.minus(amount);
      this.accts[addr].mtrgBounded = this.accts[addr].mtrgBounded.plus(amount);
    }
  }

  public unbound(addrStr: string, token: Token, amount: string | BigNumber) {
    const addr = addrStr.toLowerCase();
    this.setDefault(addrStr);
    if (token === Token.MTR) {
      this.accts[addr].mtr = this.accts[addr].mtr.plus(amount);
      this.accts[addr].mtrBounded = this.accts[addr].mtrBounded.minus(amount);
    }
    if (token === Token.MTRG) {
      this.accts[addr].mtrg = this.accts[addr].mtrg.plus(amount);
      this.accts[addr].mtrgBounded = this.accts[addr].mtrgBounded.minus(amount);
    }
  }

  public has(addrStr: string) {
    const addr = addrStr.toLowerCase();
    return addr in this.accts;
  }

  public addresses(): string[] {
    return Object.keys(this.accts);
  }

  public getDelta(addrStr: string): AccountDelta {
    this.setDefault(addrStr);
    const addr = addrStr.toLowerCase();
    if (addr in this.accts) {
      return this.accts[addr];
    }
  }
}

export class AccountCMD extends TxBlockReviewer {
  private contracts: { [key: string]: string } = {};

  protected boundRepo = new BoundRepo();
  protected unboundRepo = new UnboundRepo();

  constructor(net: Network) {
    super(net);
    this.name = 'account';
    this.logger = Logger.createLogger({ name: this.name });
  }

  processTx(tx: Tx, txIndex: number): { transfers: Transfer[]; bounds: Bound[]; unbounds: Unbound[] } {
    this.logger.info(`start to process ${tx.hash}`);
    let transfers: Transfer[] = [];
    let bounds: Bound[] = [];
    let unbounds: Unbound[] = [];
    if (tx.reverted) {
      this.logger.info(`Tx is reverted`);
      return { transfers: [], bounds: [], unbounds: [] };
    }
    const mtrToken = getERC20Token(this.network, Token.MTR);
    const mtrgToken = getERC20Token(this.network, Token.MTRG);

    // process outputs
    for (const [clauseIndex, o] of tx.outputs.entries()) {
      const clause = tx.clauses[clauseIndex];

      // process native transfers
      for (const [logIndex, t] of o.transfers.entries()) {
        console.log(t.sender, t.recipient, t.amount, t.token);
        transfers.push({
          from: t.sender.toLowerCase(),
          to: t.recipient.toLowerCase(),
          token: new BigNumber(t.token).isEqualTo(1) ? Token.MTRG : Token.MTR,
          tokenAddress: '',
          amount: new BigNumber(t.amount),
          txHash: tx.hash,
          block: tx.block,
          clauseIndex,
          logIndex,
        });
      }

      // process events
      for (const [logIndex, e] of o.events.entries()) {
        // contract creation
        if (e.topics[0] === prototype.$Master.signature) {
          const decoded = prototype.$Master.decode(e.data, e.topics);
          this.contracts[e.address] = decoded.newMaster;
          // await proc.master(e.address, decoded.newMaster);
        }

        // system contract transfers
        if (e.topics[0] === TransferEvent.signature) {
          const decoded = TransferEvent.decode(e.data, e.topics);
          let transfer = {
            from: decoded._from.toLowerCase(),
            to: decoded._to.toLowerCase(),
            token: Token.ERC20,
            amount: new BigNumber(decoded._value),
            tokenAddress: '',
            txHash: tx.hash,
            block: tx.block,
            clauseIndex,
            logIndex,
          };
          if (e.address.toLowerCase() === mtrToken.address) {
            transfer.token = Token.MTR;
            transfers.push(transfer);
          }
          if (e.address.toLowerCase() === mtrgToken.address) {
            transfer.token = Token.MTRG;
            transfers.push(transfer);
          }
        }

        // staking bound event
        if (e.topics[0] === BoundEvent.signature) {
          const decoded = BoundEvent.decode(e.data, e.topics);
          const owner = decoded.owner.toLowerCase();
          bounds.push({
            owner,
            amount: new BigNumber(decoded.amount),
            token: decoded.token == 1 ? Token.MTRG : Token.MTR,
            txHash: tx.hash,
            block: tx.block,
            clauseIndex,
            logIndex,
          });
        }

        // staking unbound event
        if (e.topics[0] === UnboundEvent.signature) {
          const decoded = UnboundEvent.decode(e.data, e.topics);
          unbounds.push({
            owner: decoded.owner.toLowerCase(),
            amount: new BigNumber(decoded.amount),
            token: decoded.token == 1 ? Token.MTRG : Token.MTR,
            txHash: tx.hash,
            block: tx.block,
            clauseIndex,
            logIndex,
          });
        }
      }
    } // end of process outputs

    if (transfers.length > 0) {
      console.log(`Extracted ${transfers.length} transfers`);
    }
    for (const t of transfers) {
      printTransfer(t);
    }
    return { transfers, bounds, unbounds };
  }

  async processBlock(blk: Block) {
    this.logger.info(`start to process block ${blk.number}`);
    let transfers = [];
    let bounds: Bound[] = [];
    let unbounds: Unbound[] = [];
    let accts = new AccountDeltaMap();
    let totalFees = new BigNumber(0);
    for (const [txIndex, txHash] of blk.txHashs.entries()) {
      const txModel = await this.txRepo.findByHash(txHash);
      if (!txModel) {
        throw new Error('could not find tx, maybe the block is still being processed');
      }
      const res = this.processTx(txModel, txIndex);
      transfers = transfers.concat(res.transfers);
      bounds = bounds.concat(res.bounds);
      unbounds = unbounds.concat(res.unbounds);

      // substract fee from gas payer
      accts.minus(txModel.gasPayer, Token.MTR, txModel.paid);

      // calculate total fee paid in this block
      if (txModel.origin.toLowerCase() !== ZeroAddress) {
        totalFees = totalFees.plus(txModel.paid);
      }
    }

    // block fee as reward to beneficiary
    accts.plus(blk.beneficiary, Token.MTR, totalFees);

    // only save native transfers that's not generated from system contract events
    // system contract events will be stored by erc20 cmd
    const nativeTransfers = transfers.filter((t) => {
      return t.tokenAddress !== '';
    });
    await this.transferRepo.bulkInsert(...nativeTransfers);

    // save bounds and unbounds
    await this.boundRepo.bulkInsert(...bounds);
    await this.unboundRepo.bulkInsert(...unbounds);

    // collect updates in accounts
    for (const tr of transfers) {
      const from = tr.from;
      const to = tr.to;
      accts.minus(from, tr.token, tr.amount);
      accts.plus(to, tr.token, tr.amount);
    }

    // collect bounds updates to accounts
    for (const b of bounds) {
      accts.bound(b.owner, b.token, b.amount);
    }

    // collect unbound updates to accounts
    for (const ub of unbounds) {
      accts.unbound(ub.owner, ub.token, ub.amount);
    }

    const blockConcise = { number: blk.number, timestamp: blk.timestamp, hash: blk.hash };
    // account balance update
    for (const addr of accts.addresses()) {
      const delta = accts.getDelta(addr);
      let acct = await this.accountRepo.findByAddress(addr);

      this.logger.info({ addr }, 'ready to update address balance');
      if (!acct) {
        this.logger.info({ mtr: '0', mtrg: '0' }, 'account doesnt exist before update');
        acct = await this.accountRepo.create(this.network, addr, blockConcise, blockConcise);
      }
      this.logger.info(
        { mtr: fromWei(acct.mtrBalance), mtrg: fromWei(acct.mtrgBalance) },
        'account balance before update'
      );

      acct.mtrBalance = acct.mtrBalance.plus(delta.mtr);
      acct.mtrgBalance = acct.mtrgBalance.plus(delta.mtrg);
      acct.mtrBounded = acct.mtrBounded.plus(delta.mtrBounded);
      acct.mtrgBounded = acct.mtrgBounded.plus(delta.mtrgBounded);

      this.logger.info(
        {
          mtr: fromWei(delta.mtr),
          mtrg: fromWei(delta.mtrg),
          mtrBounded: fromWei(delta.mtrBounded),
          mtrgBounded: fromWei(delta.mtrgBounded),
        },
        'account delta'
      );
      this.logger.info(
        {
          mtr: fromWei(acct.mtrBalance),
          mtrg: fromWei(acct.mtrgBalance),
          mtrBounded: fromWei(acct.mtrBounded),
          mtrgBounded: fromWei(acct.mtrgBounded),
        },
        'account balance after update'
      );
      await acct.save();
      this.logger.info({ addr: acct.address }, 'account updated');
    }

    // contract creation
    for (const address in this.contracts) {
      let acct = await this.accountRepo.findByAddress(address);
      if (!acct) {
        acct = await this.accountRepo.create(this.network, address, blockConcise, blockConcise);
      }
      const code = await this.pos.getCode(address, blk.hash);
      if (code && code.code !== '0x') {
        acct.code = code.code;
      }
      await acct.save();
    }

    this.logger.info({ hash: blk.hash, transfers: transfers.length }, `processed block ${blk.number}`);
  }

  protected async processGenesis() {
    const genesis = (await this.blockRepo.findByNumber(0))!;
    this.logger.info({ number: genesis.number, hash: genesis.hash }, 'process genesis');

    for (const addr of getPreAllocAccount(this.network)) {
      const chainAcc = await this.pos.getAccount(addr, genesis.hash);

      const blockConcise = { number: genesis.number, hash: genesis.hash, timestamp: genesis.timestamp };
      let acct = await this.accountRepo.create(this.network, addr, blockConcise, blockConcise);
      acct.mtrgBalance = new BigNumber(chainAcc.balance);
      acct.mtrBalance = new BigNumber(chainAcc.energy);

      if (chainAcc.hasCode) {
        const chainCode = await this.pos.getCode(addr, genesis.hash);
        acct.code = chainCode.code;
      }
      this.logger.info(
        { accountName: acct.name, address: addr, MTR: acct.mtrBalance.toFixed(), MTRG: acct.mtrgBalance.toFixed() },
        `saving genesis account`
      );
      await acct.save();
    }
  }
}

import BigNumber from 'bignumber.js';
import * as Logger from 'bunyan';

import {
  BoundEvent,
  Network,
  Token,
  TokenBasic,
  TransferEvent,
  UnboundEvent,
  ZeroAddress,
  decimalsABIFunc,
  getERC20Token,
  getPreAllocAccount,
  nameABIFunc,
  prototype,
  symbolABIFunc,
  totalSupply,
} from '../const';
import { Block } from '../model/block.interface';
import { BlockConcise } from '../model/blockConcise.interface';
import { Bound } from '../model/bound.interface';
import { Transfer } from '../model/transfer.interface';
import { Tx } from '../model/tx.interface';
import { Unbound } from '../model/unbound.interface';
import BoundRepo from '../repo/bound.repo';
import TokenBalanceRepo from '../repo/tokenBalance.repo';
import TokenProfileRepo from '../repo/tokenProfile.repo';
import UnboundRepo from '../repo/unbound.repo';
import { fromWei } from '../utils/utils';
import { TxBlockReviewer } from './blockReviewer';
import { AccountDeltaMap, TokenDeltaMap } from './types';

const printTransfer = (t: Transfer) => {
  console.log(
    `Transfer #${t.clauseIndex}: ${t.from} to ${t.to} with ${fromWei(t.amount)} ${Token[t.token]} (${t.logIndex})`
  );
};

export class AccountCMD extends TxBlockReviewer {
  protected boundRepo = new BoundRepo();
  protected unboundRepo = new UnboundRepo();
  protected tokenProfileRepo = new TokenProfileRepo();
  protected tokenBalanceRepo = new TokenBalanceRepo();

  private mtrSysToken: TokenBasic;
  private mtrgSysToken: TokenBasic;

  constructor(net: Network) {
    super(net);
    this.name = 'account';
    this.logger = Logger.createLogger({ name: this.name });
    this.mtrSysToken = getERC20Token(this.network, Token.MTR);
    this.mtrgSysToken = getERC20Token(this.network, Token.MTRG);
  }

  async processTx(
    tx: Tx,
    txIndex: number,
    blk: Block
  ): Promise<{ transfers: Transfer[]; bounds: Bound[]; unbounds: Unbound[]; contracts: { [key: string]: string } }> {
    this.logger.info(`start to process ${tx.hash}`);
    let transfers: Transfer[] = [];
    let bounds: Bound[] = [];
    let unbounds: Unbound[] = [];
    let contracts: { [key: string]: string } = {};

    if (tx.reverted) {
      this.logger.info(`Tx is reverted`);
      return { transfers: [], bounds: [], unbounds: [], contracts: {} };
    }

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
      } // end of process native transfers

      // process events
      for (const [logIndex, e] of o.events.entries()) {
        // contract creation
        if (e.topics[0] === prototype.$Master.signature) {
          const decoded = prototype.$Master.decode(e.data, e.topics);
          contracts[e.address] = decoded.newMaster;

          try {
            // try to load information for erc20 token
            const outputs = await this.pos.explain(
              {
                clauses: [
                  { to: e.address, value: '0x0', data: nameABIFunc.encode(), token: Token.MTR },
                  { to: e.address, value: '0x0', data: symbolABIFunc.encode(), token: Token.MTR },
                  { to: e.address, value: '0x0', data: decimalsABIFunc.encode(), token: Token.MTR },
                  { to: e.address, value: '0x0', data: totalSupply.encode(), token: Token.MTR },
                ],
              },
              blk.hash
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
          } catch (e) {
            console.log('contract created does not apply with ERC20 interface');
            console.log(e);
          }
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
          if (e.address.toLowerCase() === this.mtrSysToken.address) {
            // MTR: convert system contract event into system transfer
            transfer.token = Token.MTR;
          } else if (e.address.toLowerCase() === this.mtrgSysToken.address) {
            // MTRG: convert system contract event into system transfer
            transfer.token = Token.MTRG;
          } else {
            // ERC20: other erc20 transfer
            transfer.token = Token.ERC20;
            transfer.tokenAddress = e.address.toLowerCase();
          }
          transfers.push(transfer);
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
    return { transfers, bounds, unbounds, contracts };
  }

  async processBlock(blk: Block) {
    this.logger.info(`start to process block ${blk.number}`);
    let transfers = [];
    let bounds: Bound[] = [];
    let unbounds: Unbound[] = [];
    let contracts: { [key: string]: string } = {};
    let accts = new AccountDeltaMap();
    let totalFees = new BigNumber(0);
    for (const [txIndex, txHash] of blk.txHashs.entries()) {
      const txModel = await this.txRepo.findByHash(txHash);
      if (!txModel) {
        throw new Error('could not find tx, maybe the block is still being processed');
      }
      const res = await this.processTx(txModel, txIndex, blk);
      transfers = transfers.concat(res.transfers);
      bounds = bounds.concat(res.bounds);
      unbounds = unbounds.concat(res.unbounds);
      for (const addr of Object.keys(res.contracts)) {
        contracts[addr] = res.contracts[addr];
      }

      // substract fee from gas payer
      accts.minus(txModel.gasPayer, Token.MTR, txModel.paid);

      // calculate total fee paid in this block
      if (txModel.origin.toLowerCase() !== ZeroAddress) {
        totalFees = totalFees.plus(txModel.paid);
      }
    }

    // add block reward beneficiary account
    accts.plus(blk.beneficiary, Token.MTR, totalFees);

    // save transfers
    if (transfers.length > 0) {
      console.log(`saved ${transfers.length} transfers`);
      await this.transferRepo.bulkInsert(...transfers);
    }

    // save bounds and unbounds
    if (bounds.length > 0) {
      console.log(`saved ${bounds.length} bounds`);
      await this.boundRepo.bulkInsert(...bounds);
    }
    if (unbounds.length > 0) {
      console.log(`saved ${unbounds.length} unbounds`);
      await this.unboundRepo.bulkInsert(...unbounds);
    }

    // calculate token balance deltas
    let tokens = new TokenDeltaMap();
    for (const tr of transfers) {
      if (tr.token !== Token.ERC20) {
        continue;
      }
      const from = tr.from;
      const to = tr.to;
      tokens.minus(from, tr.tokenAddress, tr.amount);
      tokens.plus(to, tr.tokenAddress, tr.amount);
      this.logger.info(
        { from, to, amount: tr.amount.toFixed(0), token: Token[tr.token], tokenAddress: tr.tokenAddress },
        'ERC20 transfer'
      );
    }

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

    await this.updateAccountBalances(accts, blockConcise);

    await this.updateContracts(contracts, blockConcise);

    await this.updateTokenBalances(tokens, blockConcise);

    this.logger.info(
      { hash: blk.hash, transfers: transfers.length, contracts: contracts.length },
      `processed block ${blk.number}`
    );
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

  private async updateAccountBalances(accts: AccountDeltaMap, blockConcise: BlockConcise) {
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
        {
          mtr: fromWei(acct.mtrBalance),
          mtrg: fromWei(acct.mtrgBalance),
          mtrBounded: fromWei(acct.mtrBounded),
          mtrgBounded: fromWei(acct.mtrgBounded),
        },
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
      acct.lastUpdate = blockConcise;
      await acct.save();
    }
  }

  private async updateContracts(contracts: { [key: string]: string }, blockConcise: BlockConcise) {
    // contract creation
    for (const address in contracts) {
      let acct = await this.accountRepo.findByAddress(address);
      if (!acct) {
        acct = await this.accountRepo.create(this.network, address, blockConcise, blockConcise);
      }
      const code = await this.pos.getCode(address, blockConcise.hash);
      if (code && code.code !== '0x') {
        acct.code = code.code;
      }
      await acct.save();
    }
  }

  private async updateTokenBalances(tokens: TokenDeltaMap, blockConcise: BlockConcise) {
    // ERC20 token balance update
    for (const key of tokens.keys()) {
      const items = key.split('_');
      const addr = items[0];
      const tokenAddr = items[1];
      const delta = tokens.getDelta(addr);
      let tb = await this.tokenBalanceRepo.findByAddress(addr, tokenAddr);
      if (!tb) {
        tb = await this.tokenBalanceRepo.create(addr, tokenAddr, blockConcise);
      }
      this.logger.info(
        { address: addr, tokenAddress: tokenAddr, balance: fromWei(tb.balance) },
        'token balance before update'
      );
      this.logger.info(
        { address: addr, tokenAddress: tokenAddr, delta: fromWei(delta) },
        'token balance before update'
      );

      tb.balance = tb.balance.plus(delta);
      tb.lastUpdate = blockConcise;
      this.logger.info(
        { address: addr, tokenAddress: tokenAddr, balance: fromWei(tb.balance) },
        'token balance after update'
      );
      await tb.save();
    }
  }
}

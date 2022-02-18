import BigNumber from 'bignumber.js';
import * as Logger from 'bunyan';

import {
  BoundEvent,
  MetricName,
  Network,
  PrototypeAddress,
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
import { blockConciseSchema } from '../model/blockConcise.model';
import { Bound } from '../model/bound.interface';
import { Transfer } from '../model/transfer.interface';
import { Tx } from '../model/tx.interface';
import { Unbound } from '../model/unbound.interface';
import BoundRepo from '../repo/bound.repo';
import MetricRepo from '../repo/metric.repo';
import TokenBalanceRepo from '../repo/tokenBalance.repo';
import TokenProfileRepo from '../repo/tokenProfile.repo';
import UnboundRepo from '../repo/unbound.repo';
import { fromWei } from '../utils/utils';
import { TxBlockReviewer } from './blockReviewer';
import { AccountDeltaMap, ContractInfo, TokenDeltaMap } from './types';

const printTransfer = (t: Transfer) => {
  console.log(
    `Transfer #(ci:${t.clauseIndex},li:${t.logIndex},t:${t.token}): ${t.from} to ${t.to} with ${fromWei(t.amount)} ${
      Token[t.token]
    })`
  );
};

export class AccountCMD extends TxBlockReviewer {
  protected boundRepo = new BoundRepo();
  protected unboundRepo = new UnboundRepo();
  protected tokenProfileRepo = new TokenProfileRepo();
  protected tokenBalanceRepo = new TokenBalanceRepo();
  protected metricRepo = new MetricRepo();

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
    const blockConcise = { number: blk.number, timestamp: blk.timestamp, hash: blk.hash };

    if (tx.reverted) {
      this.logger.info(`Tx is reverted`);
      return { transfers: [], bounds: [], unbounds: [], contracts: {} };
    }

    // process outputs
    for (const [clauseIndex, o] of tx.outputs.entries()) {
      const clause = tx.clauses[clauseIndex];

      // process native transfers
      for (const [logIndex, t] of o.transfers.entries()) {
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
                  { to: PrototypeAddress, value: '0x0', data: prototype.master.encode(e.address), token: Token.MTR },
                  // { to: e.address, value: '0x0', data: totalSupply.encode(), token: Token.MTR },
                ],
              },
              blk.hash
            );
            const nameDecoded = nameABIFunc.decode(outputs[0].data);
            const symbolDecoded = symbolABIFunc.decode(outputs[1].data);
            const decimalsDecoded = decimalsABIFunc.decode(outputs[2].data);
            // const totalSupplyDecoded = totalSupply.decode(outputs[3].data);
            const masterDecoded = prototype.master.decode(outputs[3].data);
            const name = nameDecoded['0'];
            const symbol = symbolDecoded['0'];
            const decimals = decimalsDecoded['0'];
            const master = masterDecoded['0'];
            // const totalSupplyVal = totalSupplyDecoded['0'];
            await this.tokenProfileRepo.create(
              name,
              symbol,
              e.address.toLowerCase(),
              '',
              new BigNumber(0),
              // new BigNumber(totalSupplyVal),
              master,
              tx.hash,
              blockConcise,
              decimals
            );
          } catch (e) {
            console.log('contract created does not apply with ERC20 interface');
            console.log(e);
          }
        }

        // system contract transfers
        if (e.topics[0] === TransferEvent.signature) {
          try {
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
          } catch (e) {
            console.log('Error happened, but ignored:', e);
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
    return { transfers, bounds, unbounds, contracts };
  }

  async processBlock(blk: Block) {
    this.logger.info(`start to process block ${blk.number}`);
    const txFeeBeneficiary = await this.metricRepo.findByKey(MetricName.TX_FEE_BENEFICIARY);
    let sysBeneficiary = '0x';
    if (txFeeBeneficiary) {
      sysBeneficiary = txFeeBeneficiary.value;
    }
    let transfers = [];
    let bounds: Bound[] = [];
    let unbounds: Unbound[] = [];
    let contracts: { [key: string]: ContractInfo } = {};
    let accts = new AccountDeltaMap();
    let totalFees = new BigNumber(0);
    for (const [txIndex, txHash] of blk.txHashs.entries()) {
      const txModel = await this.txRepo.findByHash(txHash);
      if (!txModel) {
        throw new Error('could not find tx, maybe the block is still being processed');
      }
      const res = await this.processTx(txModel, txIndex, blk);
      transfers = transfers.concat(res.transfers.map((tr) => ({ ...tr, txHash })));
      bounds = bounds.concat(res.bounds.map((b) => ({ ...b, txHash })));
      unbounds = unbounds.concat(res.unbounds.map((u) => ({ ...u, txHash })));
      for (const addr of Object.keys(res.contracts)) {
        contracts[addr] = {
          master: res.contracts[addr].toLowerCase(),
          creationTxHash: txHash,
        };
      }

      // substract fee from gas payer
      accts.minus(txModel.gasPayer, Token.MTR, txModel.paid, txHash);

      // calculate total fee paid in this block
      if (txModel.origin.toLowerCase() !== ZeroAddress) {
        totalFees = totalFees.plus(txModel.paid);
      }
    }

    // add block reward beneficiary account
    if (sysBeneficiary === ZeroAddress || sysBeneficiary === '0x') {
      accts.plus(blk.beneficiary, Token.MTR, totalFees, '0x');
    } else {
      accts.plus(sysBeneficiary, Token.MTR, totalFees, '0x');
    }

    // save transfers
    if (transfers.length > 0) {
      await this.transferRepo.bulkInsert(...transfers);
      console.log(`saved ${transfers.length} transfers`);
    }

    // save bounds and unbounds
    if (bounds.length > 0) {
      await this.boundRepo.bulkInsert(...bounds);
      console.log(`saved ${bounds.length} bounds`);
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
      // this.logger.info(
      //   { from, to, amount: tr.amount.toFixed(0), token: Token[tr.token], tokenAddress: tr.tokenAddress },
      //   'ERC20 transfer'
      // );
    }

    // collect updates in accounts
    for (const tr of transfers) {
      const from = tr.from;
      const to = tr.to;
      accts.minus(from, tr.token, tr.amount, tr.txHash);
      accts.plus(to, tr.token, tr.amount, tr.txHash);
    }

    // collect bounds updates to accounts
    for (const b of bounds) {
      accts.bound(b.owner, b.token, b.amount, b.txHash);
    }

    // collect unbound updates to accounts
    for (const ub of unbounds) {
      accts.unbound(ub.owner, ub.token, ub.amount, ub.txHash);
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
      let acct = await this.accountRepo.create(this.network, addr.toLowerCase(), blockConcise, blockConcise, '0x');
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
        acct = await this.accountRepo.create(
          this.network,
          addr.toLowerCase(),
          blockConcise,
          blockConcise,
          delta.creationTxHash
        );
      }

      let balanceDeltas = {};
      if (!delta.mtr.isEqualTo(0)) {
        balanceDeltas['mtr'] = fromWei(acct.mtrBalance);
        balanceDeltas['mtrDelta'] = fromWei(delta.mtr);
      }
      if (!delta.mtrg.isEqualTo(0)) {
        balanceDeltas['mtrg'] = fromWei(acct.mtrgBalance);
        balanceDeltas['mtrgDelta'] = fromWei(delta.mtrg);
      }
      if (!delta.mtrBounded.isEqualTo(0)) {
        balanceDeltas['mtrBounded'] = fromWei(acct.mtrBounded);
        balanceDeltas['mtrBoundedDelta'] = fromWei(delta.mtrBounded);
      }
      if (!delta.mtrgBounded.isEqualTo(0)) {
        balanceDeltas['mtrgBounded'] = fromWei(acct.mtrgBounded);
        balanceDeltas['mtrgBoundedDelta'] = fromWei(delta.mtrgBounded);
      }
      this.logger.info(balanceDeltas, 'account balance before update');

      acct.mtrBalance = acct.mtrBalance.plus(delta.mtr);
      acct.mtrgBalance = acct.mtrgBalance.plus(delta.mtrg);
      acct.mtrBounded = acct.mtrBounded.plus(delta.mtrBounded);
      acct.mtrgBounded = acct.mtrgBounded.plus(delta.mtrgBounded);

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

  private async updateContracts(contracts: { [key: string]: ContractInfo }, blockConcise: BlockConcise) {
    // contract creation
    for (const address in contracts) {
      let acct = await this.accountRepo.findByAddress(address);
      if (!acct) {
        acct = await this.accountRepo.create(
          this.network,
          address.toLowerCase(),
          blockConcise,
          blockConcise,
          contracts[address].creationTxHash,
          contracts[address].master
        );
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
      let profile = await this.tokenProfileRepo.findByAddress(tokenAddr);
      const delta = tokens.getDelta(key);
      if (!profile) {
        console.log(`missing profile for token ${tokenAddr}`);
        continue;
      }
      if (addr === ZeroAddress) {
        // if current address is zero
        // typically it's a mint/burn tx, so it changes token supply (circulation)
        // read the actual total supply from the chain and update database
        const output = await this.pos.explain(
          { clauses: [{ to: tokenAddr, value: '0x0', data: totalSupply.encode(), token: Token.MTR }] },
          'best'
        );
        const decoded = totalSupply.decode(output[0].data);
        profile.totalSupply = new BigNumber(decoded['0']);
        profile.circulation = new BigNumber(decoded['0']);
        // if (delta.isLessThan(0)) {
        //   // mint
        //   profile.circulation = profile.circulation.plus(delta.times(-1));
        //   await profile.save();
        // } else if (delta.isGreaterThan(0)) {
        //   // burn
        //   profile.circulation = profile.circulation.minus(delta.times(-1));
        //   await profile.save();
        // }
        // continue;
      } else {
        let tb = await this.tokenBalanceRepo.findByAddress(addr, tokenAddr);
        if (!tb) {
          let symbol = profile ? profile.symbol : 'ERC20';
          tb = await this.tokenBalanceRepo.create(addr, tokenAddr, symbol, blockConcise);
          profile.holdersCount = profile.holdersCount.plus(1);
          await profile.save();
        }
        this.logger.info(
          {
            address: addr,
            tokenAddress: tokenAddr,
            balance: fromWei(tb.balance),
            delta: fromWei(delta),
            symbol: tb.symbol,
          },
          'token balance before update'
        );

        tb.balance = tb.balance.plus(delta);
        tb.lastUpdate = blockConcise;
        this.logger.info(
          { address: addr, tokenAddress: tokenAddr, balance: fromWei(tb.balance), symbol: tb.symbol },
          'token balance after update'
        );
        await tb.save();
      }
    }
  }
}

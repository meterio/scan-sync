import BigNumber from 'bignumber.js';
import * as Logger from 'bunyan';

import {
  MetricName,
  Network,
  Token,
  ZeroAddress,
  balanceOf,
  getPreAllocAccount,
  prototype,
  totalSupply,
} from '../const';
import { Block } from '../model/block.interface';
import { BlockConcise } from '../model/blockConcise.interface';
import { Movement } from '../model/movement.interface';
import { Tx } from '../model/tx.interface';
import BoundRepo from '../repo/bound.repo';
import MetricRepo from '../repo/metric.repo';
import MovementRepo from '../repo/movement.repo';
import TokenBalanceRepo from '../repo/tokenBalance.repo';
import TokenProfileRepo from '../repo/tokenProfile.repo';
import UnboundRepo from '../repo/unbound.repo';
import { fromWei } from '../utils/utils';
import { TxBlockReviewer } from './blockReviewer';
import { AccountDeltaMap, ContractInfo, TokenDeltaMap } from './types';

const printMovement = (m: Movement) => {
  console.log(
    `Transfer #(ci:${m.clauseIndex},li:${m.logIndex},t:${m.token}): ${m.from} to ${m.to} with ${fromWei(m.amount)} ${
      Token[m.token]
    })`
  );
};

export class AccountCMD extends TxBlockReviewer {
  protected tokenProfileRepo = new TokenProfileRepo();
  protected tokenBalanceRepo = new TokenBalanceRepo();
  protected metricRepo = new MetricRepo();
  protected boundRepo = new BoundRepo();
  protected unboundRepo = new UnboundRepo();
  protected movementRepo = new MovementRepo();

  constructor(net: Network) {
    super(net);
    this.name = 'account';
    this.logger = Logger.createLogger({ name: this.name });
  }

  async processTx(
    tx: Tx,
    txIndex: number,
    blk: Block
  ): Promise<{
    contracts: { [key: string]: ContractInfo };
    rebasings: string[];
  }> {
    this.logger.info(`start to process ${tx.hash}`);
    let contracts: { [key: string]: ContractInfo } = {};
    let rebasings: string[] = [];

    if (tx.reverted) {
      this.logger.info(`Tx is reverted`);
      return { contracts: {}, rebasings: [] };
    }

    // process outputs
    for (const [clauseIndex, o] of tx.outputs.entries()) {
      const clause = tx.clauses[clauseIndex];

      // process events
      for (const [logIndex, e] of o.events.entries()) {
        // rebasing events (by AMPL)
        if (e.topics[0] === '0x72725a3b1e5bd622d6bcd1339bb31279c351abe8f541ac7fd320f24e1b1641f2') {
          rebasings.push(e.address);
        }

        // contracts
        if (e.topics[0] === prototype.$Master.signature) {
          const decoded = prototype.$Master.decode(e.data, e.topics);
          const isToken = await this.tokenProfileRepo.existsByAddress(e.address);
          contracts[e.address] = { master: decoded.newMaster, creationTxHash: tx.hash, isToken };
        }
      }
    } // end of process outputs

    return { contracts, rebasings };
  }

  async processBlock(blk: Block) {
    this.logger.info(`start to process block ${blk.number}`);
    const txFeeBeneficiary = await this.metricRepo.findByKey(MetricName.TX_FEE_BENEFICIARY);
    let sysBeneficiary = '0x';
    if (txFeeBeneficiary) {
      sysBeneficiary = txFeeBeneficiary.value;
    }
    let contracts: { [key: string]: ContractInfo } = {};
    let accts = new AccountDeltaMap();
    let totalFees = new BigNumber(0);
    let rebasings = [];
    for (const [txIndex, txHash] of blk.txHashs.entries()) {
      const txModel = await this.txRepo.findByHash(txHash);
      if (!txModel) {
        throw new Error('could not find tx, maybe the block is still being processed');
      }
      const res = await this.processTx(txModel, txIndex, blk);
      rebasings = rebasings.concat(res.rebasings);
      contracts = res.contracts;

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

    // calculate token balance deltas
    let tokens = new TokenDeltaMap();

    // collect updates in accounts
    const movements = await this.movementRepo.findByBlockNum(blk.number);
    for (const m of movements) {
      printMovement(m);
      const { from, to, amount, txHash, token, tokenAddress } = m;
      if (token === Token.MTR || token === Token.MTRG) {
        accts.minus(from, token, amount, txHash);
        accts.plus(to, token, amount, txHash);
      } else {
        tokens.minus(from, tokenAddress, amount);
        tokens.plus(to, tokenAddress, amount);
      }
    }

    // collect bounds updates to accounts
    const bounds = await this.boundRepo.findByBlockNum(blk.number);
    for (const b of bounds) {
      accts.bound(b.owner, b.token, b.amount, b.txHash);
    }

    // collect unbound updates to accounts
    const unbounds = await this.unboundRepo.findByBlockNum(blk.number);
    for (const ub of unbounds) {
      accts.unbound(ub.owner, ub.token, ub.amount, ub.txHash);
    }

    const blockConcise = { number: blk.number, timestamp: blk.timestamp, hash: blk.hash };

    await this.updateAccountBalances(accts, blockConcise);

    await this.updateContracts(contracts, blockConcise);

    await this.updateTokenBalances(tokens, blockConcise);

    await this.handleRebasing(rebasings);

    this.logger.info({ hash: blk.hash, contracts: contracts.length }, `processed block ${blk.number}`);
  }

  protected async processGenesis() {
    const genesis = (await this.blockRepo.findByNumber(0))!;
    this.logger.info({ number: genesis.number, hash: genesis.hash }, 'process genesis');

    for (const addr of getPreAllocAccount(this.network)) {
      const chainAcc = await this.pos.getAccount(addr, genesis.hash);

      const blockConcise = { number: genesis.number, hash: genesis.hash, timestamp: genesis.timestamp };
      let acct = await this.accountRepo.create(
        this.network,
        addr.toLowerCase(),
        blockConcise,
        blockConcise,
        '0x',
        'user'
      );
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
          delta.creationTxHash,
          'user'
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
          contracts[address].isToken ? 'token' : 'contract',
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

  private async handleRebasing(rebasings: string[]) {
    for (const tokenAddr of rebasings) {
      console.log(`Handling rebasing events on ${tokenAddr}`);
      const bals = await this.tokenBalanceRepo.findByTokenAddress(tokenAddr);
      for (const bal of bals) {
        const res = await this.pos.explain(
          {
            clauses: [{ to: tokenAddr, value: '0x0', token: Token.MTR, data: balanceOf.encode(bal.address) }],
          },
          'best'
        );
        const decoded = balanceOf.decode(res[0].data);
        const chainBal = decoded['0'];
        if (!bal.balance.isEqualTo(chainBal)) {
          console.log(
            `Update ${bal.symbol} ${bal.tokenAddress} with balance ${chainBal}, originally was ${bal.balance.toFixed(
              0
            )}`
          );
          bal.balance = new BigNumber(chainBal);
          await bal.save();
        }
      }
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
        // profile.circulation = new BigNumber(decoded['0']);
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

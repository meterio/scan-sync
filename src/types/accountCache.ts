import { BigNumber, Token, AccountRepo, Account, BlockConcise, Network } from '@meterio/scan-db/dist';
import { getAccountName, ZeroAddress } from '../const';

export class AccountCache {
  private accts: { [key: string]: Account & { save() } } = {};
  private repo = new AccountRepo();
  private network: Network;

  constructor(network: Network) {
    this.network = network;
  }
  public list() {
    return Object.values(this.accts);
  }

  public async minus(addrStr: string, token: Token, amount: string | BigNumber, blockConcise: BlockConcise) {
    if (addrStr === ZeroAddress || new BigNumber(amount).isLessThanOrEqualTo(0)) {
      return;
    }

    await this.setDefault(addrStr, blockConcise);
    const addr = addrStr.toLowerCase();
    const formattedAmount = new BigNumber(amount);
    if (token === Token.MTR) {
      console.log(`Account ${addr} minus MTR: ${this.accts[addr].mtrBalance} - ${formattedAmount} `);
      this.accts[addr].mtrBalance = this.accts[addr].mtrBalance.minus(formattedAmount);
      if (this.accts[addr].mtrBalance.isLessThan(0)) {
        throw new Error(`Got negative balance: ${this.accts[addr].mtrBalance}`);
      }
      console.log(`Got => ${this.accts[addr].mtrBalance}`);
    }
    if (token === Token.MTRG) {
      console.log(`Account ${addr} minus MTRG: ${this.accts[addr].mtrgBalance} - ${formattedAmount} `);
      this.accts[addr].mtrgBalance = this.accts[addr].mtrgBalance.minus(formattedAmount);
      if (this.accts[addr].mtrgBalance.isLessThan(0)) {
        throw new Error(`Got negative balance: ${this.accts[addr].mtrgBalance}`);
      }
      console.log(`Got => ${this.accts[addr].mtrgBalance}`);
    }
  }

  private async setDefault(addrStr: string, blockConcise: BlockConcise) {
    const address = addrStr.toLowerCase();
    if (this.accts[address]) {
      return;
    }
    const acctInDB = await this.repo.findByAddress(address);
    if (!acctInDB) {
      const name = getAccountName(this.network, address);
      const newAcct = await this.repo.create(name, address, blockConcise);
      this.accts[address] = newAcct;
    } else {
      this.accts[address] = acctInDB;
    }
  }

  public async plus(addrStr: string, token: Token, amount: string | BigNumber, blockConcise: BlockConcise) {
    if (new BigNumber(amount).isLessThanOrEqualTo(0)) {
      return;
    }
    await this.setDefault(addrStr, blockConcise);
    const formattedAmount = new BigNumber(amount);
    const addr = addrStr.toLowerCase();
    if (token === Token.MTR) {
      console.log(`Account ${addr} plus MTR: ${this.accts[addr].mtrBalance} + ${formattedAmount} `);
      this.accts[addr].mtrBalance = this.accts[addr].mtrBalance.plus(formattedAmount);
      if (this.accts[addr].mtrBalance.isLessThan(0)) {
        throw new Error(`Got negative balance: ${this.accts[addr].mtrBalance}`);
      }
      console.log(`Got => ${this.accts[addr].mtrBalance}`);
    }
    if (token === Token.MTRG) {
      console.log(`Account ${addr} plus MTRG: ${this.accts[addr].mtrgBalance} + ${formattedAmount} `);
      this.accts[addr].mtrgBalance = this.accts[addr].mtrgBalance.plus(formattedAmount);
      if (this.accts[addr].mtrgBalance.isLessThan(0)) {
        throw new Error(`Got negative balance: ${this.accts[addr].mtrgBalance}`);
      }
      console.log(`Got => ${this.accts[addr].mtrgBalance}`);
    }
  }

  public async bound(addrStr: string, token: Token, amount: string | BigNumber, blockConcise: BlockConcise) {
    await this.setDefault(addrStr, blockConcise);
    const addr = addrStr.toLowerCase();
    const formattedAmount = new BigNumber(amount);
    if (token === Token.MTR) {
      this.accts[addr].mtrBalance = this.accts[addr].mtrBalance.minus(formattedAmount);
      this.accts[addr].mtrBounded = this.accts[addr].mtrBounded.plus(formattedAmount);
    }
    if (token === Token.MTRG) {
      console.log(`Account ${addr} bound MTRG: ${this.accts[addr].mtrgBalance} - ${formattedAmount} `);
      this.accts[addr].mtrgBalance = this.accts[addr].mtrgBalance.minus(formattedAmount);
      this.accts[addr].mtrgBounded = this.accts[addr].mtrgBounded.plus(formattedAmount);
      if (this.accts[addr].mtrgBalance.isLessThan(0)) {
        console.log(`Got negative balance: ${this.accts[addr].mtrgBalance}`);
      }
      console.log(`Got => Balance: ${this.accts[addr].mtrgBalance}, Bounded: ${this.accts[addr].mtrgBounded}`);
    }
  }

  public async unbound(addrStr: string, token: Token, amount: string | BigNumber, blockConcise: BlockConcise) {
    await this.setDefault(addrStr, blockConcise);
    const addr = addrStr.toLowerCase();
    const formattedAmount = new BigNumber(amount);
    if (token === Token.MTR) {
      this.accts[addr].mtrBalance = this.accts[addr].mtrBalance.plus(formattedAmount);
      this.accts[addr].mtrBounded = this.accts[addr].mtrBounded.minus(formattedAmount);
    }
    if (token === Token.MTRG) {
      console.log(`Account ${addr} unbound MTRG: ${this.accts[addr].mtrgBalance} + ${formattedAmount} `);
      this.accts[addr].mtrgBalance = this.accts[addr].mtrgBalance.plus(formattedAmount);
      this.accts[addr].mtrgBounded = this.accts[addr].mtrgBounded.minus(formattedAmount);
      console.log(`Got => Balance: ${this.accts[addr].mtrgBalance}, Bounded: ${this.accts[addr].mtrgBounded}`);
    }
  }

  public async saveToDB() {
    await Promise.all(Object.values(this.accts).map((a) => a.save()));
  }

  public clean() {
    this.accts = {};
  }
}

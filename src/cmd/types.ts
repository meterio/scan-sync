import {
  BigNumber,
  Token,
  NFTBalance,
  AccountRepo,
  Account,
  BlockConcise,
  Network,
  TokenBalance,
  TokenBalanceRepo,
} from '@meterio/scan-db/dist';
import { format } from 'path';
import { getAccountName, ZeroAddress } from '../const';
export interface AccountDelta {
  mtr: BigNumber;
  mtrg: BigNumber;

  mtrBounded: BigNumber;
  mtrgBounded: BigNumber;
  creationTxHash: string;
}

export interface ContractInfo {
  creationTxHash: string;
  master: string;
  isToken: boolean;
}

export const mergeNFTBalances = (origin: NFTBalance[], delta: NFTBalance[], plus = true) => {
  let resultMap: { [key: number]: number } = {};
  for (const i in origin) {
    const { tokenId, value } = origin[i];
    resultMap[tokenId] = value;
  }
  for (const i in delta) {
    const { tokenId, value } = delta[i];
    if (resultMap.hasOwnProperty(tokenId)) {
      if (plus) {
        resultMap[tokenId] += value;
      } else {
        resultMap[tokenId] -= value;
      }
    } else {
      if (plus) {
        resultMap[tokenId] = value;
      } else {
        // FIXME: error!
      }
    }
  }
  let bals: NFTBalance[] = [];
  for (const tokenId in resultMap) {
    bals.push({ tokenId: Number(tokenId), value: resultMap[tokenId] });
  }
  return bals;
};

export class AccountDeltaMap {
  private accts: { [key: string]: AccountDelta } = {};

  public minus(addrStr: string, token: Token, amount: string | BigNumber, creationTxHash: string) {
    const addr = addrStr.toLowerCase();
    this.setDefault(addrStr, creationTxHash);
    if (token === Token.MTR) {
      this.accts[addr].mtr = this.accts[addr].mtr.minus(amount);
    }
    if (token === Token.MTRG) {
      this.accts[addr].mtrg = this.accts[addr].mtrg.minus(amount);
    }
  }

  private setDefault(addrStr: string, creationTxHash: string) {
    const addr = addrStr.toLowerCase();
    if (!(addr in this.accts)) {
      this.accts[addr] = {
        mtr: new BigNumber(0),
        mtrg: new BigNumber(0),
        mtrBounded: new BigNumber(0),
        mtrgBounded: new BigNumber(0),
        creationTxHash,
      };
    }
  }

  public plus(addrStr: string, token: Token, amount: string | BigNumber, creationTxHash: string) {
    const addr = addrStr.toLowerCase();
    this.setDefault(addrStr, creationTxHash);
    if (token === Token.MTR) {
      this.accts[addr].mtr = this.accts[addr].mtr.plus(amount);
    }
    if (token === Token.MTRG) {
      this.accts[addr].mtrg = this.accts[addr].mtrg.plus(amount);
    }
  }

  public bound(addrStr: string, token: Token, amount: string | BigNumber, creationTxHash: string) {
    const addr = addrStr.toLowerCase();
    this.setDefault(addrStr, creationTxHash);
    if (token === Token.MTR) {
      this.accts[addr].mtr = this.accts[addr].mtr.minus(amount);
      this.accts[addr].mtrBounded = this.accts[addr].mtrBounded.plus(amount);
    }
    if (token === Token.MTRG) {
      this.accts[addr].mtrg = this.accts[addr].mtrg.minus(amount);
      this.accts[addr].mtrgBounded = this.accts[addr].mtrgBounded.plus(amount);
    }
  }

  public unbound(addrStr: string, token: Token, amount: string | BigNumber, creationTxHash: string) {
    const addr = addrStr.toLowerCase();
    this.setDefault(addrStr, creationTxHash);
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
    this.setDefault(addrStr, '0x');
    const addr = addrStr.toLowerCase();
    if (addr in this.accts) {
      return this.accts[addr];
    }
  }
}

export class TokenDeltaMap {
  private accts: { [key: string]: BigNumber } = {};
  constructor() {}

  public minus(addr: string, tokenAddr: string, amount: string | BigNumber) {
    const key = `${addr}_${tokenAddr}`.toLowerCase();
    if (!(key in this.accts)) {
      this.accts[key] = new BigNumber(0);
    }
    this.accts[key] = this.accts[key].minus(amount);
  }

  public plus(addr: string, tokenAddr: string, amount: string | BigNumber) {
    const key = `${addr}_${tokenAddr}`.toLowerCase();
    if (!(key in this.accts)) {
      this.accts[key] = new BigNumber(0);
    }
    this.accts[key] = this.accts[key].plus(amount);
  }

  public keys(): string[] {
    return Object.keys(this.accts);
  }

  public getDelta(keyStr: string): BigNumber {
    const key = keyStr.toLowerCase();

    if (key in this.accts) {
      return this.accts[key];
    }
    return new BigNumber(0);
  }
}

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
      console.log(
        `Account ${addr} minus MTR: ${this.accts[addr].mtrBalance.toFixed()} - ${formattedAmount.toFixed()} `
      );
      this.accts[addr].mtrBalance = this.accts[addr].mtrBalance.minus(formattedAmount);
      console.log(`Got => ${this.accts[addr].mtrBalance.toFixed()}`);
    }
    if (token === Token.MTRG) {
      console.log(
        `Account ${addr} minus MTRG: ${this.accts[addr].mtrgBalance.toFixed()} - ${formattedAmount.toFixed()} `
      );
      this.accts[addr].mtrgBalance = this.accts[addr].mtrgBalance.minus(formattedAmount);
      console.log(`Got => ${this.accts[addr].mtrgBalance.toFixed()}`);
    }
  }

  private async setDefault(addrStr: string, blockConcise: BlockConcise) {
    const address = addrStr.toLowerCase();
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
      console.log(`Got => ${this.accts[addr].mtrBalance}`);
    }
    if (token === Token.MTRG) {
      console.log(`Account ${addr} plus MTRG: ${this.accts[addr].mtrgBalance} + ${formattedAmount} `);
      this.accts[addr].mtrgBalance = this.accts[addr].mtrgBalance.plus(formattedAmount);
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

export class TokenBalanceCache {
  private bals: { [key: string]: TokenBalance & { save() } } = {};
  private tokenBalanceRepo = new TokenBalanceRepo();
  public list() {
    return Object.values(this.bals);
  }

  private async setDefault(addrStr: string, tokenAddr: string, blockConcise: BlockConcise) {
    const balInDB = await this.tokenBalanceRepo.findByAddress(addrStr, tokenAddr);
    if (!balInDB) {
      const newBal = await this.tokenBalanceRepo.create(addrStr, tokenAddr, blockConcise);
      this.bals[addrStr.toLowerCase()] = newBal;
    } else {
      this.bals[addrStr.toLowerCase()] = balInDB;
    }
  }

  public async minus(addrStr: string, tokenAddr: string, amount: string | BigNumber, blockConcise: BlockConcise) {
    if (addrStr === ZeroAddress || new BigNumber(amount).isLessThanOrEqualTo(0)) {
      return;
    }
    await this.setDefault(addrStr, tokenAddr, blockConcise);
    const formattedAmount = new BigNumber(amount);
    const key = `${addrStr}_${tokenAddr}`.toLowerCase();
    console.log(`Token ${tokenAddr} on ${addrStr} minus: ${this.bals[key].balance} - ${formattedAmount} `);
    this.bals[key].balance = this.bals[key].balance.minus(formattedAmount);
    console.log(`Got => ${this.bals[key].balance}`);
  }

  public async plus(addrStr: string, tokenAddr: string, amount: string | BigNumber, blockConcise: BlockConcise) {
    if (new BigNumber(amount).isLessThanOrEqualTo(0)) {
      return;
    }
    await this.setDefault(addrStr, tokenAddr, blockConcise);
    const formattedAmount = new BigNumber(amount);
    const key = `${addrStr}_${tokenAddr}`.toLowerCase();
    console.log(`Token ${tokenAddr} on ${addrStr} plus: ${this.bals[key].balance} + ${formattedAmount} `);
    this.bals[key].balance = this.bals[key].balance.plus(formattedAmount);
    console.log(`Got => ${this.bals[key].balance}`);
  }

  public async plusNFT(addrStr: string, tokenAddr: string, nftDeltas: NFTBalance[], blockConcise: BlockConcise) {
    if (addrStr === ZeroAddress) {
      return;
    }
    await this.setDefault(addrStr, tokenAddr, blockConcise);
    const key = `${addrStr}_${tokenAddr}`.toLowerCase();
    console.log(`NFT ${tokenAddr} on ${addrStr} plus: ${this.bals[key].nftBalances} + ${nftDeltas} `);
    const newNFTBalances = mergeNFTBalances(this.bals[key].nftBalances, nftDeltas);
    this.bals[key].nftBalances = newNFTBalances;
    console.log(`Got => ${this.bals[key].nftBalances}`);
  }

  public async minusNFT(addrStr: string, tokenAddr: string, nftDeltas: NFTBalance[], blockConcise: BlockConcise) {
    await this.setDefault(addrStr, tokenAddr, blockConcise);
    const key = `${addrStr}_${tokenAddr}`.toLowerCase();
    console.log(`NFT ${tokenAddr} on ${addrStr} minus: ${this.bals[key].nftBalances} - ${nftDeltas} `);
    const newNFTBalances = mergeNFTBalances(this.bals[key].nftBalances, nftDeltas, false);
    this.bals[key].nftBalances = newNFTBalances;
    console.log(`Got => ${this.bals[key].nftBalances}`);
  }

  public async saveToDB() {
    await Promise.all(Object.values(this.bals).map((b) => b.save()));
  }

  public clean() {
    this.bals = {};
  }
}

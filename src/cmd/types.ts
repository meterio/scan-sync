import BigNumber from 'bignumber.js';

import { Token } from '../const';

export interface AccountDelta {
  mtr: BigNumber;
  mtrg: BigNumber;

  mtrBounded: BigNumber;
  mtrgBounded: BigNumber;
}

export class AccountDeltaMap {
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

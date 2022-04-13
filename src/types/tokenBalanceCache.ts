import { BigNumber, Network, NFTBalance, BlockConcise, TokenBalance, TokenBalanceRepo } from '@meterio/scan-db/dist';
import { ZeroAddress } from '../const';
import { Pos } from '../utils';

const printNFT = (bals: NFTBalance[], deltas: NFTBalance[]) => {
  if (bals.length <= 0) {
    return '[]';
  }
  let m = {};
  let matches = [];
  for (const bal of bals) {
    m[bal.tokenId] = bal.value;
  }
  for (const d of deltas) {
    if (d.tokenId in m) {
      matches.push(`${d.tokenId}=>${m[d.tokenId]}`);
    }
  }
  return `[${matches.join(', ')} ${matches.length === bals.length ? '' : '...'}]`;
};

const printDelta = (deltas: NFTBalance[]) => {
  let tokens = [];
  for (const d of deltas) {
    tokens.push(`${d.tokenId}=>${d.value}`);
  }
  return `[${tokens.join(', ')}]`;
};

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
    const value = resultMap[tokenId];
    if (value > 0) {
      bals.push({ tokenId, value });
    }
  }
  return bals;
};

export class TokenBalanceCache {
  private bals: { [key: string]: TokenBalance & { save() } } = {};
  private tokenBalanceRepo = new TokenBalanceRepo();
  private pos: Pos;

  constructor(net: Network) {
    this.pos = new Pos(net);
  }

  public list() {
    return Object.values(this.bals);
  }

  private async fixTokenBalance(addrStr: string, tokenAddr: string, blockConcise: BlockConcise) {
    const key = `${addrStr}_${tokenAddr}`.toLowerCase();
    let bal = this.bals[key];

    const chainBal = await this.pos.getERC20BalanceOf(addrStr, tokenAddr, blockConcise.number.toString());

    const preBal = bal.balance;
    if (!preBal.isEqualTo(chainBal)) {
      bal.balance = new BigNumber(chainBal);
      console.log(`Fixed balance on ${bal.address} for token ${bal.tokenAddress}:`);
      console.log(`  Balance: ${preBal.toFixed()} -> ${bal.balance.toFixed()}`);
      bal.lastUpdate = blockConcise;
      this.bals[key] = bal;
    }
  }

  private async setDefault(addrStr: string, tokenAddr: string, blockConcise: BlockConcise) {
    const key = `${addrStr}_${tokenAddr}`.toLowerCase();
    if (this.bals[key]) {
      return;
    }
    const balInDB = await this.tokenBalanceRepo.findByAddress(addrStr, tokenAddr);
    if (!balInDB) {
      const newBal = await this.tokenBalanceRepo.create(addrStr, tokenAddr, blockConcise);
      this.bals[key] = newBal;
    } else {
      this.bals[key] = balInDB;
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
    if (this.bals[key].balance.isLessThan(0)) {
      console.log(`Got negative balance: ${this.bals[key].balance}`);
      await this.fixTokenBalance(addrStr, tokenAddr, blockConcise);
    }
    console.log(`Got => ${this.bals[key].balance}`);
    this.bals[key].lastUpdate = blockConcise;
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
    if (this.bals[key].balance.isLessThan(0)) {
      console.log(`Got negative balance: ${this.bals[key].balance}`);
      await this.fixTokenBalance(addrStr, tokenAddr, blockConcise);
    }
    console.log(`Got => ${this.bals[key].balance}`);
    this.bals[key].lastUpdate = blockConcise;
  }

  public async plusNFT(addrStr: string, tokenAddr: string, nftDeltas: NFTBalance[], blockConcise: BlockConcise) {
    await this.setDefault(addrStr, tokenAddr, blockConcise);
    const key = `${addrStr}_${tokenAddr}`.toLowerCase();
    console.log(
      `NFT ${tokenAddr} on ${addrStr} plus: ${printNFT(this.bals[key].nftBalances, nftDeltas)} + ${printDelta(
        nftDeltas
      )} `
    );
    const newNFTBalances = mergeNFTBalances(this.bals[key].nftBalances, nftDeltas);
    console.log(`Got => ${printNFT(newNFTBalances, nftDeltas)}`);
    this.bals[key].nftBalances = newNFTBalances;
    this.bals[key].lastUpdate = blockConcise;
  }

  public async minusNFT(addrStr: string, tokenAddr: string, nftDeltas: NFTBalance[], blockConcise: BlockConcise) {
    if (addrStr === ZeroAddress) {
      return;
    }
    await this.setDefault(addrStr, tokenAddr, blockConcise);
    const key = `${addrStr}_${tokenAddr}`.toLowerCase();
    console.log(
      `NFT ${tokenAddr} on ${addrStr} minus: ${printNFT(this.bals[key].nftBalances, nftDeltas)} - ${printDelta(
        nftDeltas
      )} `
    );
    const newNFTBalances = mergeNFTBalances(this.bals[key].nftBalances, nftDeltas, false);
    console.log(`Got => ${printNFT(newNFTBalances, nftDeltas)}`);
    this.bals[key].nftBalances = newNFTBalances;
    this.bals[key].lastUpdate = blockConcise;
  }

  public async saveToDB() {
    console.log(`saving NFTBalances to DB`);
    await Promise.all(
      Object.values(this.bals).map((b) => {
        console.log(`addr: ${b.address} tokenAddr: ${b.tokenAddress} : ${printDelta(b.nftBalances)}`);
        b.nftBalances = b.nftBalances.map((b) => ({ tokenId: b.tokenId, value: b.value }));
        return b.save();
      })
    );
  }

  public clean() {
    this.bals = {};
  }
}

export class NFTBalanceAuditor {
  private bals: { [key: string]: NFTBalance[] } = {};
  private lastUpdates: { [key: string]: BlockConcise } = {};
  private tbRepo = new TokenBalanceRepo();

  private setDefault(addrStr: string, tokenAddr: string, blockConcise: BlockConcise) {
    const key = `${addrStr}_${tokenAddr}`.toLowerCase();
    if (this.bals[key]) {
      return;
    }
    this.bals[key] = [];
    this.lastUpdates[key] = blockConcise;
  }

  public plusNFT(addrStr: string, tokenAddr: string, nftDeltas: NFTBalance[], blockConcise: BlockConcise) {
    this.setDefault(addrStr, tokenAddr, blockConcise);
    const key = `${addrStr}_${tokenAddr}`.toLowerCase();
    console.log(
      `NFT ${tokenAddr} on ${addrStr} plus: ${printNFT(this.bals[key], nftDeltas)} + ${printDelta(nftDeltas)} `
    );
    const newNFTBalances = mergeNFTBalances(this.bals[key], nftDeltas);
    for (const { tokenId, value } of this.bals[key]) {
      if (value < 0) {
        throw new Error(`got negative balance for NFT ${tokenAddr} tokenId:${tokenId}, value:${value} `);
      }
    }
    console.log(`Got => ${printNFT(newNFTBalances, nftDeltas)}`);
    this.bals[key] = newNFTBalances;
    this.lastUpdates[key] = blockConcise;
  }

  public minusNFT(addrStr: string, tokenAddr: string, nftDeltas: NFTBalance[], blockConcise: BlockConcise) {
    if (addrStr === ZeroAddress) {
      return;
    }
    this.setDefault(addrStr, tokenAddr, blockConcise);
    const key = `${addrStr}_${tokenAddr}`.toLowerCase();
    console.log(
      `NFT ${tokenAddr} on ${addrStr} minus: ${printNFT(this.bals[key], nftDeltas)} - ${printDelta(nftDeltas)} `
    );
    const newNFTBalances = mergeNFTBalances(this.bals[key], nftDeltas, false);
    for (const { tokenId, value } of this.bals[key]) {
      if (value < 0) {
        throw new Error(`got negative balance for NFT ${tokenAddr} tokenId:${tokenId}, value:${value} `);
      }
    }
    console.log(`Got => ${printNFT(newNFTBalances, nftDeltas)}`);
    this.bals[key] = newNFTBalances;
    this.lastUpdates[key] = blockConcise;
  }

  public async updateDB() {
    if (Object.keys(this.bals).length > 0) {
      for (const key in this.bals) {
        const items = key.split('_');
        const addr = items[0];
        const tokenAddr = items[1];
        let tb = await this.tbRepo.findByID(addr, tokenAddr);
        console.log(`updating balances of NFT ${tokenAddr} on ${addr}`);
        if (!tb) {
          tb = await this.tbRepo.create(addr, tokenAddr, this.lastUpdates[key]);
        }
        tb.nftBalances = this.bals[key];
        if (tb.lastUpdate.number < this.lastUpdates[key].number) {
          tb.lastUpdate = this.lastUpdates[key];
        }
        await tb.save();
        console.log('done');
      }
    }
  }

  get(key) {
    return this.bals[key];
  }
}

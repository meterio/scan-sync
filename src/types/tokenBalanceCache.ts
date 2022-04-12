import { BigNumber, Network, NFTBalance, BlockConcise, TokenBalance, TokenBalanceRepo } from '@meterio/scan-db/dist';
import { ZeroAddress } from '../const';
import { Pos } from '../utils';

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
    console.log(`NFT ${tokenAddr} on ${addrStr} plus: ${this.bals[key].nftBalances} + ${nftDeltas} `);
    const newNFTBalances = mergeNFTBalances(this.bals[key].nftBalances, nftDeltas);
    this.bals[key].nftBalances = newNFTBalances;
    console.log(`Got => ${this.bals[key].nftBalances}`);
    this.bals[key].lastUpdate = blockConcise;
  }

  public async minusNFT(addrStr: string, tokenAddr: string, nftDeltas: NFTBalance[], blockConcise: BlockConcise) {
    if (addrStr === ZeroAddress) {
      return;
    }
    await this.setDefault(addrStr, tokenAddr, blockConcise);
    const key = `${addrStr}_${tokenAddr}`.toLowerCase();
    console.log(`NFT ${tokenAddr} on ${addrStr} minus: ${this.bals[key].nftBalances} - ${nftDeltas} `);
    const newNFTBalances = mergeNFTBalances(this.bals[key].nftBalances, nftDeltas, false);
    this.bals[key].nftBalances = newNFTBalances;
    console.log(`Got => ${this.bals[key].nftBalances}`);
    this.bals[key].lastUpdate = blockConcise;
  }

  public async saveToDB() {
    await Promise.all(Object.values(this.bals).map((b) => b.save()));
  }

  public nftBalances() {
    return Object.values(this.bals).map((b) => ({
      address: b.address,
      tokenAddress: b.tokenAddress,
      nftBalances: b.nftBalances,
      lastUpdate: b.lastUpdate,
    }));
  }

  public clean() {
    this.bals = {};
  }
}

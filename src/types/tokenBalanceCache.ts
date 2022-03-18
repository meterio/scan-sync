import { BigNumber, NFTBalance, BlockConcise, TokenBalance, TokenBalanceRepo } from '@meterio/scan-db/dist';
import { ZeroAddress } from '../const';

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

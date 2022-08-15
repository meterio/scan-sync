import { BigNumber, Token, AccountRepo, Account, BlockConcise, Network, NFT, NFTRepo } from '@meterio/scan-db/dist';
import axios from 'axios';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import PromisePool from '@supercharge/promise-pool/dist';

// Set the AWS Region
const REGION = 'ap-southeast-1';
const ALBUM_BUCKET_NAME = 'nft-image.meter';
const S3_WEBSITE_BASE = 'nft-image.meter.io';
// const INFURA_IPFS_PREFIX = 'https://metersync.infura-ipfs.io/ipfs/';
const INFURA_IPFS_PREFIX = 'https://metersync.mypinata.cloud/ipfs/';
const convertables = ['ipfs://', 'https://gateway.pinata.cloud/ipfs/', 'https://ipfs.io/ipfs/'];

const BASE64_ENCODED_JSON = 'base64 encoded json';

const s3 = new S3Client({
  region: REGION,
});

class NotEnoughBalance extends Error {}
export class NFTCache {
  private minted: { [key: string]: NFT } = {};
  private updated: { [key: string]: NFT & { save() } } = {};
  private repo = new NFTRepo();
  private network: Network;

  constructor(network: Network) {
    this.network = network;
  }

  private key721(tokenAddress, tokenId: string): string {
    return `${tokenId}@${tokenAddress}`;
  }

  private key1155(tokenAddress, tokenId, owner: string): string {
    return `${tokenId}@${tokenAddress}_${owner}`;
  }
  public async mint721(nft: NFT) {
    if (nft.type !== 'ERC721') {
      return;
    }

    const key = this.key721(nft.address, nft.tokenId);
    if (key in this.minted) {
      console.log(`[SKIP] mint cache-existed ERC721 ${key}`);
      return;
    } else {
      const existed = await this.repo.findByTokenId(nft.address, nft.tokenId);
      if (existed && existed.length > 0) {
        console.log(`[SKIP] mint db-existed ERC721 ${key} at ${nft.creationTxHash}`);
        return;
      }
    }

    this.minted[key] = nft;
  }

  public async mint1155(nft: NFT) {
    if (nft.type !== 'ERC1155') {
      return;
    }

    const key = this.key1155(nft.address, nft.tokenId, nft.owner);
    if (key in this.minted) {
      const existed = this.minted[key];
      existed.value += nft.value;
      return;
    } else {
      const existed = await this.repo.findByIDWithOwner(nft.address, nft.tokenId, nft.owner);
      if (existed) {
        existed.value += nft.value;
        this.updated[key] = existed;
        return;
      }
    }

    this.minted[key] = nft;
  }

  public async transfer721(tokenAddress: string, tokenId: string, from: string, to: string) {
    const key = this.key721(tokenAddress, tokenId);

    if (key in this.updated) {
      const nft = this.updated[key];
      if (nft.type !== 'ERC721') {
        console.log(`[SKIP] transfer 721 with non-721 token ${key}`);
        return;
      }
      if (nft.value < 1) {
        throw new NotEnoughBalance(`${key} in updated, actual:${nft.value}`);
      }
      nft.owner = to;
      return;
    }

    if (key in this.minted) {
      const nft = this.minted[key];
      if (nft.type !== 'ERC721') {
        console.log(`[SKIP] transfer 721 with non-721 token ${key}`);
        return;
      }
      if (nft.value < 1) {
        throw new NotEnoughBalance(`${key} in updated, actual:${nft.value}`);
      }
      nft.owner = to;
      return;
    }

    const nft = await this.repo.findByIDWithOwner(tokenAddress, tokenId, from);
    if (nft) {
      if (nft.type !== 'ERC721') {
        console.log(`[SKIP] transfer 721 with non-721 token ${key}`);
        return;
      }
      if (nft.value < 1) {
        throw new NotEnoughBalance(`${key} in updated, actual:${nft.value}`);
      }
      nft.owner = to;
      this.updated[key] = nft;
    }
  }

  public async transfer1155(tokenAddress: string, tokenId: string, from: string, to: string, value: number) {
    const key = `${tokenId}@${tokenAddress}_${from}`;

    if (key in this.updated) {
      const nft = this.updated[key];
      if (nft.type !== 'ERC1155') {
        console.log(`[SKIP] transfer 1155 with non-1155 token ${key}`);
        return;
      }
      if (nft.value < value) {
        throw new NotEnoughBalance(`${key} in updated, expected:${value}, actual:${nft.value}`);
      } else if (nft.value === value) {
        nft.owner = to;
      } else {
        const mintedKey = this.key1155(tokenAddress, tokenId, to);
        this.minted[mintedKey] = { ...(nft as NFT), owner: to, value };
        nft.value -= value;
      }
      return;
    }

    if (key in this.minted) {
      const nft = this.minted[key];
      if (nft.type !== 'ERC1155') {
        console.log(`[SKIP] transfer 1155 with non-1155 token ${key}`);
        return;
      }
      if (nft.value < value) {
        throw new NotEnoughBalance(`${key} in minted, expected:${value}, actual:${nft.value}`);
      } else if (nft.value === value) {
        nft.owner = to;
      } else {
        const mintedKey = this.key1155(tokenAddress, tokenId, to);
        this.minted[mintedKey] = { ...(nft as NFT), owner: to, value };
        nft.value -= value;
      }
      return;
    }

    const nft = await this.repo.findByIDWithOwner(tokenAddress, tokenId, from);
    if (nft) {
      if (nft.type !== 'ERC1155') {
        console.log(`[SKIP] transfer 1155 with non-1155 token ${key}`);
        return;
      }
      if (nft.value < value) {
        throw new NotEnoughBalance(`${key} in db, expected:${value}, actual:${nft.value}`);
      } else if (nft.value === value) {
        nft.owner = to;
        this.updated[key] = nft;
      } else {
        const mintedKey = this.key1155(tokenAddress, tokenId, to);
        this.minted[mintedKey] = { ...(nft as NFT), owner: to, value };
        nft.value -= value;
        this.updated[key] = nft;
      }
      return;
    }
  }

  public async saveToDB() {
    const mintedCount = Object.keys(this.minted).length;
    if (mintedCount > 0) {
      console.log(`Start to update info for ${mintedCount} nfts`);
      await PromisePool.withConcurrency(4)
        .for(Object.keys(this.minted))
        .process(async (key, index, pool) => {
          const nft = this.minted[key];
          try {
            await this.updateNFTInfo(nft);
          } catch (e) {
            console.log(`${index + 1}/${mintedCount}| Error: ${e.message} for [${nft.tokenId}] of ${nft.address} `);
          }
        });
      await this.repo.bulkInsert(...Object.values(this.minted));
      console.log(`saved ${mintedCount} minted NFTs to DB`);
    }

    const updatedCount = Object.keys(this.updated).length;
    if (updatedCount > 0) {
      await PromisePool.withConcurrency(4)
        .for(Object.keys(this.updated))
        .process(async (key, index) => {
          const u = this.updated[key];
          await u.save();
        });
      console.log(`saved ${updatedCount} updated NFTs to DB`);
    }
  }

  convertUrl(uri: string): string {
    let url = uri;
    for (const conv of convertables) {
      if (url.startsWith(conv)) {
        return url.replace(conv, INFURA_IPFS_PREFIX);
      }
    }
    return url;
  }

  async isCached(tokenAddress: string, tokenId: string): Promise<Boolean> {
    try {
      const res = await s3.send(
        new HeadObjectCommand({ Bucket: ALBUM_BUCKET_NAME, Key: `${tokenAddress}/${tokenId}` })
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  // upload token image to album
  async uploadToAlbum(albumName, photoName, imageArraybuffer) {
    const key = albumName + '/' + photoName;
    const uploadParams = {
      Bucket: ALBUM_BUCKET_NAME,
      Key: key,
      Body: imageArraybuffer,
      ACL: 'public-read',
    };
    try {
      const data = await s3.send(new PutObjectCommand(uploadParams));
      console.log(`uploaded file to ${key}`);
    } catch (err) {
      throw new Error('error uploading your photo: ' + err.message);
    }
  }

  async updateNFTInfo(nft: NFT) {
    console.log(`update info for ${nft.type}:${nft.address}[${nft.tokenId}] with tokenURI: ${nft.tokenURI}`);
    if (!nft.tokenURI || nft.tokenURI == '') {
      console.log('SKIPPED due to empty tokenURI');
      nft.status = 'invalid';
      return;
    }
    let { tokenURI, tokenJSON } = nft;

    if (tokenURI !== BASE64_ENCODED_JSON) {
      const url = this.convertUrl(nft.tokenURI);
      console.log(`download token json from ${url}`);
      const tokenJSONRes = await axios.get(url);
      if (tokenJSONRes && tokenJSONRes.data) {
        try {
          tokenJSON = JSON.stringify(tokenJSONRes.data);
        } catch (e) {
          nft.status = 'invalid';
          return;
        }
      } else {
        nft.status = 'invalid';
        return;
      }
    }
    let mediaURI = '';
    try {
      const decoded = JSON.parse(tokenJSON);
      mediaURI = String(decoded.image);
    } catch (e) {
      console.log('could not decode tokenJSON');
      nft.status = 'invalid';
      return;
    }
    let mediaType: string;
    let reader: any;
    if (mediaURI.includes(';base64')) {
      reader = Buffer.from(mediaURI.split(';base64').pop(), 'base64');
      mediaType = 'base64';
    } else {
      const downURI = this.convertUrl(mediaURI);
      console.log(`download media from ${downURI}`);
      const res = await axios.get(downURI, { responseType: 'arraybuffer' });
      if (res.status !== 200) {
        nft.status = 'uncached';
        return;
      }
      reader = res.data;
      mediaType = res.headers['content-type'];
    }

    const uploaded = await this.isCached(nft.address, nft.tokenId);
    const cachedMediaURI = `https://${S3_WEBSITE_BASE}/${nft.address}/${nft.tokenId}`;
    if (!uploaded) {
      await this.uploadToAlbum(nft.address, nft.tokenId, reader);
      console.log(`uploaded ${mediaURI} to ${cachedMediaURI}`);
    }
    nft.tokenJSON = tokenJSON;
    nft.mediaType = mediaType;
    nft.mediaURI = cachedMediaURI;
    nft.status = 'cached';
  }

  public clean() {
    this.minted = {};
    this.updated = {};
  }
}

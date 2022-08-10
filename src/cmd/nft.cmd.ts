import { Head, HeadRepo, Network, NFTRepo, NFT, LogEventRepo, BlockRepo } from '@meterio/scan-db/dist';
import pino from 'pino';

import { GetNetworkConfig, ZeroAddress } from '../const';
import { InterruptedError, sleep } from '../utils/utils';
import { CMD } from './cmd';
import { ERC1155ABI, ERC721ABI, ERC1155, ERC721, abi } from '@meterio/devkit';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import axios from 'axios';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import PromisePool from '@supercharge/promise-pool/dist';

const FASTFORWARD_INTERVAL = 300; // 0.3 second gap between each loop
const NORMAL_INTERVAL = 2000; // 2 seconds gap between each loop
const LOOP_WINDOW = 10000;
const RECOVERY_INTERVAL = 5 * 60 * 1000; // 5 min for recovery
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

export class NFTCMD extends CMD {
  private shutdown = false;
  private name = 'nft';
  private network: Network;

  private headRepo = new HeadRepo();
  private nftRepo = new NFTRepo();
  private evtRepo = new LogEventRepo();
  private blockRepo = new BlockRepo();

  private nftsCache: NFT[] = [];

  constructor(net: Network) {
    super();
    const dest = pino.destination({ sync: true });
    this.log = pino({
      transport: {
        target: 'pino-pretty',
      },
    });

    this.network = net;

    this.cleanCache();
  }

  public async start() {
    this.log.info(`${this.name}: start`);
    // const cached = await this.isCached('0xc345e76a77c6287df132b3554e8cbbb4d9e91fa4', '1804');
    // console.log('cached: ', cached);
    this.loop();
    return;
  }

  public stop() {
    this.shutdown = true;
  }

  private cleanCache() {
    this.nftsCache = [];
  }

  public async cleanUpIncompleteData(head: Head) {
    const nft = await this.nftRepo.deleteAfter(head.num);
    this.log.info({ nft }, `deleted dirty data higher than head ${head.num}`);
  }

  public async loop() {
    let fastforward = true;

    let head = await this.headRepo.findByKey(this.name);
    if (head) {
      await this.cleanUpIncompleteData(head);
    }

    for (;;) {
      try {
        if (this.shutdown) {
          throw new InterruptedError();
        }

        let head = await this.headRepo.findByKey(this.name);
        let headNum = !!head ? head.num : -1;

        const posHead = await this.headRepo.findByKey('pos');
        const bestNum = posHead.num;
        let endNum = headNum + LOOP_WINDOW > bestNum ? bestNum : headNum + LOOP_WINDOW;
        fastforward = endNum < bestNum;

        if (endNum <= headNum) {
          continue;
        }
        const endBlock = await this.blockRepo.findByNumber(endNum);

        this.log.info(
          { best: bestNum, head: headNum, mode: fastforward ? 'fast-forward' : 'normal' },
          `start import NFTs from number ${headNum} to ${endNum}`
        );
        // begin import round from headNum+1 to tgtNum

        const minted721 = await this.findMintedERC721InRange(this.network, headNum, endNum);
        const minted1155 = await this.findMintedERC1155InRange(this.network, headNum, endNum);
        if (minted721.length > 0) {
          console.log(`save minted ${minted721.length} ERC721 tokens`);
          this.nftsCache.push(...minted721);
        }

        if (minted1155.length > 0) {
          console.log(`save minted ${minted1155.length} ERC1155 tokens`);
          this.nftsCache.push(...minted1155);
        }
        const minted = minted721.concat(minted1155);
        // remove duplicates from minted tokens by (address, tokenId)

        if (minted.length > 0) {
          console.log(`Start to update info for ${minted.length} nfts`);
          await PromisePool.withConcurrency(4)
            .for(minted)
            .process(async (nft, index, pool) => {
              try {
                await this.updateNFTInfo(nft);
              } catch (e) {
                console.log(
                  `${index + 1}/${minted.length}| Error: ${e.message} for [${nft.tokenId}] of ${nft.address} `
                );
              }
            });
        }

        await this.saveCacheToDB();
        await this.updateHead(endBlock.number, endBlock.hash);
        this.cleanCache();

        if (fastforward) {
          // fastforward mode, save blocks/txs with bulk insert
          await sleep(FASTFORWARD_INTERVAL);
        } else {
          await sleep(NORMAL_INTERVAL);
        }
      } catch (e) {
        if (e instanceof InterruptedError) {
          this.log.info('quit loop');
          break;
        } else {
          this.log.error({ err: e }, 'Error happened in loop: ', e);
          this.log.error(`sleep for ${RECOVERY_INTERVAL / 1000 / 60} minutes, hope it will resolve`);
          await sleep(RECOVERY_INTERVAL);
        }
      }
    }
  }

  async saveCacheToDB() {
    if (this.nftsCache.length > 0) {
      await this.nftRepo.bulkInsert(...this.nftsCache);
      this.log.info(`saved ${this.nftsCache.length} nfts`);
    }
  }

  async updateHead(num, hash): Promise<Head> {
    const exist = await this.headRepo.exists(this.name);
    if (!exist) {
      return await this.headRepo.create(this.name, num, hash);
    } else {
      let head = await this.headRepo.findByKey(this.name);
      this.log.info({ num: num }, 'update head');
      // head = await this.headRepo.update(this.name, res.block.number, res.block.hash);
      head.num = num;
      head.hash = hash;
      return await head.save();
    }
  }

  async findMintedERC1155InRange(network: Network, start, end: number): Promise<NFT[]> {
    const config = GetNetworkConfig(network);
    const singles = await this.evtRepo.findByTopic0InBlockRangeSortAsc(ERC1155.TransferSingle.signature, start, end);
    console.log(`searching for ERC1155 singles in blocks [${start}, ${end}]`);
    let minted: NFT[] = [];
    let visited = {};
    for (const evt of singles) {
      let decoded: abi.Decoded;
      try {
        decoded = ERC1155.TransferSingle.decode(evt.data, evt.topics);
      } catch (e) {
        console.log('error decoding transfer event');
        continue;
      }
      const from = decoded.from.toLowerCase();
      const to = decoded.to.toLowerCase();
      const tokenId = decoded.id;
      const tokenAddress = evt.address.toLowerCase();
      const key = `${tokenAddress}_${tokenId}`;

      if (from !== ZeroAddress) {
        continue;
      }
      if (key in visited) {
        console.log(`skip: mint ERC1155 token [${tokenId}] on ${tokenAddress} at ${evt.txHash} due to duplication`);
        continue;
      }
      visited[key] = true;

      console.log(`mint ERC1155 token [${tokenId}] on ${tokenAddress} at ${evt.txHash}`);
      const exist = await this.nftRepo.exist(tokenAddress, tokenId);
      if (exist) {
        continue;
      }
      const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
      const contract = new ethers.Contract(tokenAddress, [ERC1155ABI.URI], provider);
      let tokenURI = '';
      try {
        tokenURI = await contract.uri(tokenId);
      } catch (e) {
        console.log(`error getting tokenURI on ERC1155 [${tokenId}] on ${tokenAddress}`);
      }
      let tokenJSON = {};
      if (tokenURI.startsWith('data:application/json;base64,')) {
        const content = Buffer.from(tokenURI.substring(29), 'base64').toString();
        tokenJSON = JSON.parse(content);
        tokenURI = BASE64_ENCODED_JSON;
      }
      minted.push({
        address: tokenAddress,
        tokenId,
        tokenURI,
        tokenJSON: JSON.stringify(tokenJSON),
        type: 'ERC1155',
        minter: to,
        block: evt.block,
        creationTxHash: evt.txHash,
        status: 'new',
      });
    }

    console.log(`searching for ERC1155 batches in blocks [${start}, ${end}]`);
    const batchs = await this.evtRepo.findByTopic0InBlockRangeSortAsc(ERC1155.TransferBatch.signature, start, end);
    for (const evt of batchs) {
      let decoded: abi.Decoded;
      try {
        decoded = ERC1155.TransferBatch.decode(evt.data, evt.topics);
      } catch (e) {
        console.log('error decoding transfer event');
        return;
      }
      const from = decoded.from.toLowerCase();
      const to = decoded.to.toLowerCase();
      const tokenAddress = evt.address.toLowerCase();
      for (const [i, id] of decoded.ids.entries()) {
        const key = `${tokenAddress}_${id}`;
        if (from !== ZeroAddress) {
          continue;
        }
        if (key in visited) {
          console.log(`skip: mint ERC1155 token [${id}] on ${tokenAddress} at ${evt.txHash} due to duplication`);
          continue;
        }
        visited[key] = true;

        console.log(`mint ERC1155 token [${id}] on ${tokenAddress} at ${evt.txHash}`);
        const exist = await this.nftRepo.exist(tokenAddress, id);
        if (exist) {
          continue;
        }
        const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
        const contract = new ethers.Contract(tokenAddress, [ERC1155ABI.URI], provider);
        let tokenURI = '';
        try {
          tokenURI = await contract.uri(id);
        } catch (e) {
          console.log(`error getting tokenURI on ERC1155 [${id}] on ${tokenAddress}`);
        }
        let tokenJSON = {};
        if (tokenURI.startsWith('data:application/json;base64,')) {
          const content = Buffer.from(tokenURI.substring(29), 'base64').toString();
          tokenJSON = JSON.parse(content);
          tokenURI = BASE64_ENCODED_JSON;
        }
        minted.push({
          address: tokenAddress,
          tokenId: id,
          tokenURI,
          tokenJSON: JSON.stringify(tokenJSON),
          type: 'ERC1155',
          minter: to,
          block: evt.block,
          creationTxHash: evt.txHash,
          status: 'new',
        });
      }
    }
    return minted;
  }

  async findMintedERC721InRange(network: Network, start, end: number): Promise<NFT[]> {
    const config = GetNetworkConfig(network);

    const transferEvts = await this.evtRepo.findByTopic0InBlockRangeSortAsc(ERC721.Transfer.signature, start, end);
    console.log(`searching for ERC721 transfers in blocks [${start}, ${end}]`);
    let minted: NFT[] = [];
    let visited = {};
    for (const evt of transferEvts) {
      let decoded: abi.Decoded;
      try {
        decoded = ERC721.Transfer.decode(evt.data, evt.topics);
      } catch (e) {
        continue;
      }

      const from = decoded.from.toLowerCase();
      const to = decoded.to.toLowerCase();
      const tokenAddress = evt.address.toLowerCase();
      const tokenId = new BigNumber(decoded.tokenId).toFixed();
      const key = `${tokenAddress}_${tokenId}`;

      if (from !== ZeroAddress) {
        continue;
      }
      if (key in visited) {
        console.log(`skip: mint ERC721 token [${tokenId}] on ${tokenAddress} at ${evt.txHash} due to duplication`);
      }
      visited[key] = true;

      console.log(`mint ERC721 token [${tokenId}] on ${tokenAddress} at ${evt.txHash}`);
      const exist = await this.nftRepo.exist(tokenAddress, tokenId);
      if (exist) {
        continue;
      }
      const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
      const contract = new ethers.Contract(tokenAddress, [ERC721ABI.tokenURI], provider);
      let tokenURI = '';
      try {
        tokenURI = await contract.tokenURI(tokenId);
      } catch (e) {
        console.log(`error getting tokenURI on ERC721 [${tokenId}] on ${tokenAddress}`);
      }
      let tokenJSON = {};
      if (tokenURI.startsWith('data:application/json;base64,')) {
        const content = Buffer.from(tokenURI.substring(29), 'base64').toString();
        tokenJSON = JSON.parse(content);
        tokenURI = BASE64_ENCODED_JSON;
      }

      minted.push({
        address: tokenAddress,
        tokenId,
        tokenURI,
        tokenJSON: JSON.stringify(tokenJSON),
        type: 'ERC721',
        minter: to,
        block: evt.block,
        creationTxHash: evt.txHash,
        status: 'new',
      });
    }
    return minted;
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
}

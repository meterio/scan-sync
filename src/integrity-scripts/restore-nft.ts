#!/usr/bin/env node
require('../utils/validateEnv');

import { ERC721, ERC1155, abi } from '@meterio/devkit';
import {
  HeadRepo,
  connectDB,
  disconnectDB,
  LogEventRepo,
  BigNumber,
  NFT,
  Network,
  NFTRepo,
} from '@meterio/scan-db/dist';
import axios from 'axios';
import { ethers } from 'ethers';
import { PromisePool } from '@supercharge/promise-pool';

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

import { checkNetworkWithDB, getNetworkFromCli } from '../utils';
import { GetNetworkConfig, ZeroAddress } from '../const';
import { Document } from 'mongoose';

// Set the AWS Region
const REGION = 'ap-southeast-1';
const ALBUM_BUCKET_NAME = 'nft-image.meter';
const S3_WEBSITE_BASE = 'nft-image.meter.io';
const INFURA_IPFS_PREFIX = 'https://metersync.infura-ipfs.io/ipfs/';

const TOKEN_URI_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
];
const URI_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'uri',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
];

const s3 = new S3Client({
  region: REGION,
});

const convertables = ['ipfs://', 'https://gateway.pinata.cloud/ipfs/'];
const convertUrl = (uri) => {
  const proxyUrl = String(uri).replace('ipfs://', INFURA_IPFS_PREFIX);
  for (const conv of convertables) {
    if (proxyUrl.startsWith(conv)) {
      return proxyUrl.replace(conv, INFURA_IPFS_PREFIX);
    }
  }
};

const findMintedERC1155InRange = async (
  network: Network,
  start,
  end: number,
  evtRepo: LogEventRepo,
  nftRepo: NFTRepo
): Promise<NFT[]> => {
  const config = GetNetworkConfig(network);
  const singles = await evtRepo.findByTopic0InBlockRangeSortAsc(ERC1155.TransferSingle.signature, start, end);
  console.log(`searching for ERC1155 singles in blocks [${start}, ${end}]`);
  let minted: NFT[] = [];
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

    if (from !== ZeroAddress) {
      continue;
    }
    console.log(`mint ERC1155 token [${tokenId}] on ${tokenAddress} `);
    const exist = await nftRepo.exist(tokenAddress, tokenId);
    if (exist) {
      continue;
    }
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(tokenAddress, URI_ABI, provider);
    const tokenURI = '';
    try {
      await contract.uri(tokenId);
    } catch (e) {
      console.log(`error getting tokenURI on ERC1155 [${tokenId}] on ${tokenAddress}`);
    }
    minted.push({
      address: tokenAddress,
      tokenId,
      tokenURI,
      type: 'ERC1155',
      minter: to,
      block: evt.block,
      creationTxHash: evt.txHash,
    });
  }

  console.log(`searching for ERC1155 batches in blocks [${start}, ${end}]`);
  const batchs = await evtRepo.findByTopic0InBlockRangeSortAsc(ERC1155.TransferBatch.signature, start, end);
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
      if (from !== ZeroAddress) {
        continue;
      }
      console.log(`mint ERC1155 token [${id}] on ${tokenAddress} `);
      const exist = await nftRepo.exist(tokenAddress, id);
      if (exist) {
        continue;
      }
      const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
      const contract = new ethers.Contract(tokenAddress, URI_ABI, provider);
      const tokenURI = '';
      try {
        await contract.uri(id);
      } catch (e) {
        console.log(`error getting tokenURI on ERC1155 [${id}] on ${tokenAddress}`);
      }
      minted.push({
        address: tokenAddress,
        tokenId: id,
        tokenURI,
        type: 'ERC1155',
        minter: to,
        block: evt.block,
        creationTxHash: evt.txHash,
      });
    }
  }
  return minted;
};

const findMintedERC721InRange = async (
  network: Network,
  start,
  end: number,
  evtRepo: LogEventRepo,
  nftRepo: NFTRepo
): Promise<NFT[]> => {
  const config = GetNetworkConfig(network);

  const transferEvts = await evtRepo.findByTopic0InBlockRangeSortAsc(ERC721.Transfer.signature, start, end);
  console.log(`searching for ERC721 transfers in blocks [${start}, ${end}]`);
  let minted: NFT[] = [];
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

    if (from !== ZeroAddress) {
      continue;
    }

    console.log(`mint ERC721 token [${tokenId}] on ${tokenAddress} `);
    const exist = await nftRepo.exist(tokenAddress, tokenId);
    if (exist) {
      continue;
    }
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(tokenAddress, TOKEN_URI_ABI, provider);
    const tokenURI = '';
    try {
      await contract.tokenURI(tokenId);
    } catch (e) {
      console.log(`error getting tokenURI on ERC721 [${tokenId}] on ${tokenAddress}`);
    }

    minted.push({
      address: tokenAddress,
      tokenId,
      tokenURI,
      type: 'ERC721',
      minter: to,
      block: evt.block,
      creationTxHash: evt.txHash,
    });
  }
  return minted;
};

const run = async () => {
  const { network, standby } = getNetworkFromCli();

  await connectDB(network, standby);
  const headRepo = new HeadRepo();
  const evtRepo = new LogEventRepo();
  const nftRepo = new NFTRepo();

  await checkNetworkWithDB(network);

  const pos = await headRepo.findByKey('pos');
  const best = pos.num;
  const step = 100000;

  for (let i = 0; i < best; i += step) {
    const start = i;
    const end = i + step - 1 > best ? best : i + step - 1;
    const minted721 = await findMintedERC721InRange(network, start, end, evtRepo, nftRepo);
    const minted1155 = await findMintedERC1155InRange(network, start, end, evtRepo, nftRepo);
    if (minted721.length > 0) {
      console.log(`save minted ${minted1155.length} ERC721 tokens`);
      nftRepo.bulkInsert(...minted721);
    }

    if (minted1155.length > 0) {
      console.log(`save minted ${minted1155.length} ERC1155 tokens`);
      nftRepo.bulkInsert(...minted1155);
    }
    const minted = minted721.concat(minted1155);

    console.log(`------------------------------------------------------`);
    console.log(`Start to update info/cache media for ${minted.length} nfts`);
    console.log(`------------------------------------------------------`);
    await PromisePool.withConcurrency(20)
      .for(minted)
      .process(async (nft, index, pool) => {
        try {
          await updateNFTInfo(nft, nftRepo);
        } catch (e) {
          console.log(`${index + 1}/${minted.length}| Error: ${e.message} for [${nft.tokenId}] of ${nft.address} `);
        }
      });
  }
};

const exist = async (tokenAddress: string, tokenId: string): Promise<Boolean> => {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: ALBUM_BUCKET_NAME, Key: `${tokenAddress}/${tokenId}` }));
    return true;
  } catch (e) {
    return false;
  }
};

// upload token image to album
const uploadToAlbum = async (albumName, photoName, imageArraybuffer) => {
  const key = albumName + '/' + photoName;
  const uploadParams = {
    Bucket: ALBUM_BUCKET_NAME,
    Key: key,
    Body: imageArraybuffer,
    ACL: 'public-read',
  };
  try {
    const data = await s3.send(new PutObjectCommand(uploadParams));
  } catch (err) {
    throw new Error('error uploading your photo: ' + err.message);
  }
};

const updateNFTInfo = async (nft: NFT, nftRepo: NFTRepo) => {
  const url = convertUrl(nft.tokenURI);
  try {
    const tokenJSONRes = await axios.get(url);
    if (tokenJSONRes && tokenJSONRes.data) {
      const tokenJSON = JSON.stringify(tokenJSONRes.data);
      const mediaURI = String(tokenJSONRes.data.image);
      if (mediaURI.includes(';base64')) {
        return Buffer.from(mediaURI.split(';base64').pop(), 'base64');
      }
      const downURI = convertUrl(mediaURI);
      const res = await axios.get(downURI, { responseType: 'arraybuffer' });
      const mediaType = res.headers['content-type'];

      const uploaded = exist(nft.address, nft.tokenId);
      if (!uploaded) {
        await uploadToAlbum(nft.address, nft.tokenId, res.data);
      }
      const cachedMediaURI = `https://${S3_WEBSITE_BASE}/${nft.address}/${nft.tokenId}`;
      await nftRepo.updateInfo(nft.address, nft.tokenId, tokenJSON, mediaType, cachedMediaURI);
    }
  } catch (e) {
    console.log(`error updating info for [${nft.tokenId}] on ${nft.address}: ${e}`);
  }
};

(async () => {
  try {
    await run();
    await disconnectDB();
  } catch (e) {
    console.log(`error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

#!/usr/bin/env node
require('../utils/validateEnv');

import { ERC721, ERC1155, abi } from '@meterio/devkit';
import {
  HeadRepo,
  connectDB,
  disconnectDB,
  LogEventRepo,
  BigNumber
} from '@meterio/scan-db/dist';
import axios from 'axios';
import { ethers } from 'ethers';

import { S3Client, PutObjectCommand, ListObjectsCommand } from '@aws-sdk/client-s3';

import { checkNetworkWithDB, getNetworkFromCli } from '../utils';

// Set the AWS Region
const REGION = "ap-northeast-1";
const ALBUM_BUCKET_NAME = 'meter-nft-image';
const INFURA_IPFS_PREFIX = 'https://ipfs.infura.io/ipfs/';
const MAINNET_JSON_RPC = 'https://rpc.meter.io';
const TOKEN_URI_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  }
];
const URI_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'uri',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  }
]

const SIGNER = new ethers.providers.JsonRpcProvider(MAINNET_JSON_RPC).getSigner();

const s3 = new S3Client({
  region: REGION,
});

const run = async () => {
  const { network, standby } = getNetworkFromCli();

  await connectDB(network, standby);
  const headRepo = new HeadRepo();
  const evtRepo = new LogEventRepo();

  await checkNetworkWithDB(network);

  const pos = await headRepo.findByKey('pos');
  const best = pos.num;
  const step = 100000;

  for (let i = 0; i < best; i += step) {
    const start = i;
    const end = i + step - 1 > best ? best : i + step - 1;

    // const transferEvts = await evtRepo.findByTopic0InBlockRangeSortAsc(ERC721.Transfer.signature, start, end);
    // console.log(`searching for ERC721 transfers in blocks [${start}, ${end}]`);
    // for (const evt of transferEvts) {
    //   if (evt.topics && evt.topics[0] === ERC721.Transfer.signature) {
    //     let decoded: abi.Decoded;
    //     try {
    //       decoded = ERC721.Transfer.decode(evt.data, evt.topics);
    //     } catch (e) {
    //       continue;
    //     }
    //     console.log(`tx: ${evt.txHash}`);

    //     const from = decoded.from.toLowerCase();
    //     // const to = decoded.to.toLowerCase();
    //     const tokenAddress = evt.address.toLowerCase();
    //     const tokenId = new BigNumber(decoded.tokenId).toFixed();

    //     if (from === '0x0000000000000000000000000000000000000000') {
    //       try {
    //         await actionUpload(tokenAddress, tokenId, true);
    //       } catch (err) {
    //         console.log(err.message + '\n')
    //         continue;
    //       }
    //     }
    //   }
    // }

    const singles = await evtRepo.findByTopic0InBlockRangeSortAsc(ERC1155.TransferSingle.signature, start, end);
    console.log(`searching for ERC1155 singles in blocks [${start}, ${end}]`);
    for (const evt of singles) {
      if (evt.topics && evt.topics[0] === ERC1155.TransferSingle.signature) {
        let decoded: abi.Decoded;
        try {
          decoded = ERC1155.TransferSingle.decode(evt.data, evt.topics);
        } catch (e) {
          console.log('error decoding transfer event');
          continue;
        }
        const from = decoded.from.toLowerCase();
        // const to = decoded.to.toLowerCase();
        const tokenId = decoded.id;
        const tokenAddress = evt.address.toLowerCase();

        if (from === '0x0000000000000000000000000000000000000000') {
          try {
            await actionUpload(tokenAddress, tokenId, false);
          } catch (err) {
            console.log(err.message + '\n')
            continue;
          }
        }
      }
    }

    console.log(`searching for ERC1155 batches in blocks [${start}, ${end}]`);
    const batchs = await evtRepo.findByTopic0InBlockRangeSortAsc(ERC1155.TransferBatch.signature, start, end);
    for (const evt of batchs) {
      if (evt.topics && evt.topics[0] === ERC1155.TransferBatch.signature) {
        let decoded: abi.Decoded;
        try {
          decoded = ERC1155.TransferBatch.decode(evt.data, evt.topics);
        } catch (e) {
          console.log('error decoding transfer event');
          return;
        }
        const from = decoded.from.toLowerCase();
        // const to = decoded.to.toLowerCase();
        const tokenAddress = evt.address.toLowerCase();
        for (const [i, id] of decoded.ids.entries()) {
          if (from === '0x0000000000000000000000000000000000000000') {
            try {
              await actionUpload(tokenAddress, id, false);
            } catch (err) {
              console.log(err.message + '\n')
              continue;
            }
          }
        }
      }
    }
  }
};

const actionUpload = async (tokenAddress, tokenId, isERC721) => {
  // const tokenAddress = '0x608203020799f9bda8bfcc3ac60fc7d9b0ba3d78';
  // const tokenId = '2204';

  const uploadStatus = await checkIsUploaded(tokenAddress, tokenId);
  if (!uploadStatus) {
    const imageArraybuffer = await getImageArraybuffer(tokenAddress, tokenId, isERC721);

    await uploadToAlbum(tokenAddress, tokenId, imageArraybuffer)
  }
}

// get token image arraybuffer
const getImageArraybuffer = async (tokenAddress, tokenId, isERC721) => {
  let contract
  let metaURI

  if (isERC721) {
    contract = new ethers.Contract(tokenAddress, TOKEN_URI_ABI, SIGNER);
    metaURI = await contract.tokenURI(tokenId);
  } else {
    contract = new ethers.Contract(tokenAddress, URI_ABI, SIGNER);
    metaURI = await contract.uri(tokenId);
  }
  if (!metaURI) {
    throw new Error('Can not get metaURI.\n')
  }
  const httpMetaURI = String(metaURI).replace('ipfs://', INFURA_IPFS_PREFIX)
  console.log(`Get ERC721 ${tokenAddress} #${tokenId} metaURI:\n${httpMetaURI}`);

  const meta = await axios.get(httpMetaURI);
  const imgURI = String(meta.data.image).replace('ipfs://', INFURA_IPFS_PREFIX);
  console.log(`meta:\nname: ${meta.data.name}\nimageURI:${meta.data.image}`)

  const res = await axios.get(imgURI, { responseType: 'arraybuffer' });
  return res.data;
}

// check image is uploaded
const checkIsUploaded = async (tokenAddress, tokenId): Promise<Boolean> => {
  const album = await getAlbum(tokenAddress);
  if (!album) {
    // album is not exit, need create
    await createAlbum(tokenAddress);

    return false;
  } else {
    // album exit
    // check image ${tokenId} is already uploaded
    const imgPath = tokenAddress + '/' + tokenId;
    const isUploaded = album.some(a => a.Key === imgPath);

    return isUploaded;
  }
}

// Create an album in the bucket
const createAlbum = async (albumName) => {
  try {
    const key = albumName + "/";
    const params = { Bucket: ALBUM_BUCKET_NAME, Key: key };
    const data = await s3.send(new PutObjectCommand(params));
    console.log("Successfully created album.", albumName);
    return data;
  } catch (err) {
    throw new Error("There was an error creating your album: " + err.message);
  }
};

// Get an Album
const getAlbum = async (albumName) => {
  try {
    const data = await s3.send(
      new ListObjectsCommand({
        Prefix: albumName,
        Bucket: ALBUM_BUCKET_NAME
      })
    );

    return data.Contents;
  } catch (err) {
    throw new Error("There was an error check album exists: " + err.message)
  }
}

// upload token image to album
const uploadToAlbum = async (albumName, photoName, imageArraybuffer) => {
  const photoKey = albumName + '/' + photoName;
  const uploadParams = {
    Bucket: ALBUM_BUCKET_NAME,
    Key: photoKey,
    Body: imageArraybuffer,
    ACL: 'public-read'
  };
  try {
    const data = await s3.send(new PutObjectCommand(uploadParams));
    console.log(`Successfully uploaded photo: ${albumName} ${photoName}\n`);
  } catch (err) {
    throw new Error("There was an error uploading your photo: " + err.message);
  }
}

(async () => {
  try {
    await run();
    await disconnectDB();
  } catch (e) {
    console.log(`error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

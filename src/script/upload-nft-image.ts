#!/usr/bin/env node
require('../utils/validateEnv');

import { ERC721, abi } from '@meterio/devkit';
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
const INFURA_IPFS_PREFIX = 'https://ipfs.infura.io/';
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

    const transferEvts = await evtRepo.findByTopic0InBlockRangeSortAsc(ERC721.Transfer.signature, start, end);
    console.log(`searching for ERC721 transfers in blocks [${start}, ${end}]`);
    for (const evt of transferEvts) {
      if (evt.topics && evt.topics[0] === ERC721.Transfer.signature) {
        let decoded: abi.Decoded;
        try {
          decoded = ERC721.Transfer.decode(evt.data, evt.topics);
        } catch (e) {
          continue;
        }
        console.log(`tx: ${evt.txHash}`);

        const from = decoded.from.toLowerCase();
        const to = decoded.to.toLowerCase();
        const tokenId = new BigNumber(decoded.tokenId).toFixed();
        const tokenAddress = evt.address.toLowerCase();

        if (from === '0x0000000000000000000000000000000000000000') {

        }
      }
    }
  }
};

const actionUpload = async () => {
  const tokenAddress = '0x608203020799f9bda8bfcc3ac60fc7d9b0ba3d78';
  const tokenId = '2204';

  const uploadStatus = await checkIsUploaded(tokenAddress, tokenId);
  if (!uploadStatus) {
    const imageArraybuffer = getImageArraybuffer(tokenAddress, tokenId);

    await uploadToAlbum(tokenAddress, tokenId, imageArraybuffer)
  }
}

// get token image arraybuffer
const getImageArraybuffer = async (tokenAddress, tokenId) => {
  const contract = new ethers.Contract(tokenAddress, TOKEN_URI_ABI, SIGNER);
  const ipfsMetaURI = await contract.tokenURI(tokenId);
  const httpMetaURI = String(ipfsMetaURI).replace('ipfs://', INFURA_IPFS_PREFIX)
  console.log(`Get ERC721 ${tokenAddress} #${tokenId} metaURI:\n${ipfsMetaURI}\n${httpMetaURI}`);

  const meta = await axios.get(httpMetaURI);
  console.log(`meta:\n${meta}`)

  const imgURI = String(meta.data.image).replace('ipfs://', INFURA_IPFS_PREFIX);
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
    console.log("Successfully created album.");
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
    console.log("Successfully uploaded photo.", albumName, photoName);
  } catch (err) {
    throw new Error("There was an error uploading your photo: " + err.message);
  }
}

// Add a photo to an album
// const addPhoto = async (albumName, photoName, imgBuffer) => {
//   const albumPhotosKey = albumName + "/";
//   const data = await s3.send(
//     new ListObjectsCommand({
//       // Prefix: albumPhotosKey,
//       Bucket: ALBUM_BUCKET_NAME
//     })
//   );
//   const isAlbumExist = data.Contents.find(album => album.Key.includes(albumName));
//   if (!isAlbumExist) {
//     console.log(`${albumName} not exists will creating.`)
//     await createAlbum(albumName);
//   }
//   // console.log('ListObjectsCommand res', data);
//   const photoKey = albumPhotosKey + photoName;
//   const uploadParams = {
//     Bucket: ALBUM_BUCKET_NAME,
//     Key: photoKey,
//     Body: imgBuffer,
//     ACL: 'public-read'
//   };
//   try {
//     const data = await s3.send(new PutObjectCommand(uploadParams));
//     console.log("Successfully uploaded photo.", albumName, photoName);
//   } catch (err) {
//     console.log("There was an error uploading your photo: ", err.message);
//   }
// };

// const testUpload = async () => {
//   const tokenAddress = '0x608203020799f9bda8bfcc3ac60fc7d9b0ba3d78';
//   const tokenId = '2204';

//   const imgURI = 'https://ipfs.infura.io/ipfs/QmYMCycWQd3iJnnECCGPCASBPiTDhUvsURkhKeC1UpNgL4/2204.png';
//   const image = await axios.get(imgURI, { responseType: 'arraybuffer' });

//   // upload to s3
//   await addPhoto(tokenAddress, tokenId, image.data);
// }

(async () => {
  try {
    // await run();
    // await disconnectDB();

    await actionUpload();
  } catch (e) {
    console.log(`error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

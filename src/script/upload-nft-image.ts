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

import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';
import { S3Client, PutObjectCommand, ListObjectsCommand } from '@aws-sdk/client-s3';

import { checkNetworkWithDB, getNetworkFromCli } from '../utils';

// Set the AWS Region
const REGION = "ap-northeast-1";

const albumBucketName = 'meter-nft-image';

const tokenURIABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  }
];

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

  const signer = new ethers.providers.JsonRpcProvider('https://rpc.meter.io').getSigner();

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
        const tokenAddress = evt.address;

        if (from === '0x0000000000000000000000000000000000000000') {
          // get meta and image
          const contract = new ethers.Contract(tokenAddress, tokenURIABI, signer);
          const ipfsMetaURI = await contract.tokenURI(tokenId);
          const httpMetaURI = String(ipfsMetaURI).replace('ipfs://', 'https://ipfs.io/ipfs/')
          console.log(`Get ERC721 ${tokenAddress} #${tokenId} metaURI:\n${ipfsMetaURI}\n${httpMetaURI}`);

          const meta = await axios.get(httpMetaURI);
          console.log(`meta:\n${meta}`)

          const imgURI = String(meta.data.image).replace('ipfs://', 'https://ipfs.io/ipfs/');
          const image = await axios.get(imgURI, { responseType: 'arraybuffer' });

          // upload to s3
          await createAlbum(tokenAddress);
          await addPhoto(tokenAddress, tokenId, image.data);
        }
      }
    }
  }
};


// Create an album in the bucket
const createAlbum = async (albumName) => {
  albumName = albumName.trim();

  try {
    const key = albumName + "/";
    const params = { Bucket: albumBucketName, Key: key };
    const data = await s3.send(new PutObjectCommand(params));
    console.log("Successfully created album.");
  } catch (err) {
    console.log("There was an error creating your album: " + err.message);
  }
};


// Add a photo to an album
const addPhoto = async (albumName, photoName, imgBuffer) => {
  const albumPhotosKey = albumName + "/";
  const data = await s3.send(
    new ListObjectsCommand({
      Prefix: albumPhotosKey,
      Bucket: albumBucketName
    })
  );
  console.log('ListObjectsCommand res', data);
  const photoKey = albumPhotosKey + photoName;
  const uploadParams = {
    Bucket: albumBucketName,
    Key: photoKey,
    Body: imgBuffer
  };
  try {
    const data = await s3.send(new PutObjectCommand(uploadParams));
    console.log('PutObjectCommand res', data);
    console.log("Successfully uploaded photo.", albumName, photoName);
  } catch (err) {
    console.log("There was an error uploading your photo: ", err.message);
  }
};

const testUpload = async () => {
  const tokenAddress = '0x608203020799f9bda8bfcc3ac60fc7d9b0ba3d78';
  const tokenId = '2204';

  const imgURI = 'https://ipfs.io/ipfs/QmYMCycWQd3iJnnECCGPCASBPiTDhUvsURkhKeC1UpNgL4/2204.png';
  const image = await axios.get(imgURI, { responseType: 'arraybuffer' });

  // upload to s3
  await createAlbum(tokenAddress);
  await addPhoto(tokenAddress, tokenId, image.data);
}

(async () => {
  try {
    // await run();
    // await disconnectDB();

    await testUpload();
  } catch (e) {
    console.log(`error: ${e.name} ${e.message} - ${e.stack}`);
    process.exit(-1);
  }
})();

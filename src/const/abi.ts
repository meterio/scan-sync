// tslint:disable:max-line-length
import { abi } from '@meterio/devkit';

const $MasterABI: abi.Event.Definition = {
  anonymous: false,
  inputs: [{ indexed: false, name: 'newMaster', type: 'address' }],
  name: '$Master',
  type: 'event',
};

const methodMasterABI: abi.Function.Definition = {
  constant: true,
  inputs: [{ name: 'self', type: 'address' }],
  name: 'master',
  outputs: [{ name: '', type: 'address' }],
  payable: false,
  stateMutability: 'view',
  type: 'function',
};

const firstABI: abi.Function.Definition = {
  constant: true,
  inputs: [],
  name: 'first',
  outputs: [{ name: '', type: 'address' }],
  payable: false,
  stateMutability: 'view',
  type: 'function',
};
const getABI: abi.Function.Definition = {
  constant: true,
  inputs: [{ name: '_nodeMaster', type: 'address' }],
  name: 'get',
  outputs: [
    { name: 'listed', type: 'bool' },
    { name: 'endorsor', type: 'address' },
    { name: 'identity', type: 'bytes32' },
    { name: 'active', type: 'bool' },
  ],
  payable: false,
  stateMutability: 'view',
  type: 'function',
};
const nextABI: abi.Function.Definition = {
  constant: true,
  inputs: [{ name: '_nodeMaster', type: 'address' }],
  name: 'next',
  outputs: [{ name: '', type: 'address' }],
  payable: false,
  stateMutability: 'view',
  type: 'function',
};
const candidateABI: abi.Event.Definition = {
  anonymous: false,
  inputs: [
    { indexed: true, name: 'nodeMaster', type: 'address' },
    { indexed: false, name: 'action', type: 'bytes32' },
  ],
  name: 'Candidate',
  type: 'event',
};
const $SponsorABI: abi.Event.Definition = {
  anonymous: false,
  inputs: [
    { indexed: true, name: 'sponsor', type: 'address' },
    { indexed: false, name: 'action', type: 'bytes32' },
  ],
  name: '$Sponsor',
  type: 'event',
};
const currentSponsorABI: abi.Function.Definition = {
  constant: true,
  inputs: [{ name: '_self', type: 'address' }],
  name: 'currentSponsor',
  outputs: [{ name: '', type: 'address' }],
  payable: false,
  stateMutability: 'view',
  type: 'function',
};
const isSponsorABI: abi.Function.Definition = {
  constant: true,
  inputs: [
    { name: '_self', type: 'address' },
    { name: '_sponsor', type: 'address' },
  ],
  name: 'isSponsor',
  outputs: [{ name: '', type: 'bool' }],
  payable: false,
  stateMutability: 'view',
  type: 'function',
};
const paramsGetABI: abi.Function.Definition = {
  constant: true,
  inputs: [{ name: '_key', type: 'bytes32' }],
  name: 'get',
  outputs: [{ name: '', type: 'uint256' }],
  payable: false,
  stateMutability: 'view',
  type: 'function',
};
const BoundABI: abi.Event.Definition = {
  anonymous: false,
  inputs: [
    { indexed: true, name: 'owner', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' },
    { indexed: false, name: 'token', type: 'uint256' },
  ],
  name: 'Bound',
  type: 'event',
};
const UnboundABI: abi.Event.Definition = {
  anonymous: false,
  inputs: [
    { indexed: true, name: 'owner', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' },
    { indexed: false, name: 'token', type: 'uint256' },
  ],
  name: 'Unbound',
  type: 'event',
};

export const BoundEvent = new abi.Event(BoundABI);
export const UnboundEvent = new abi.Event(UnboundABI);

export const authority = {
  first: new abi.Function(firstABI),
  get: new abi.Function(getABI),
  next: new abi.Function(nextABI),
  Candidate: new abi.Event(candidateABI),
  revoked: '0x' + Buffer.from('revoked').toString('hex').padEnd(64, '0'),
  added: '0x' + Buffer.from('added').toString('hex').padEnd(64, '0'),
};
export const prototype = {
  $Sponsor: new abi.Event($SponsorABI),
  $Master: new abi.Event($MasterABI),
  master: new abi.Function(methodMasterABI),

  currentSponsor: new abi.Function(currentSponsorABI),
  isSponsor: new abi.Function(isSponsorABI),
  unsponsored: '0x' + Buffer.from('unsponsored').toString('hex').padEnd(64, '0'),
  selected: '0x' + Buffer.from('selected').toString('hex').padEnd(64, '0'),
};
export const params = {
  get: new abi.Function(paramsGetABI),
  keys: {
    proposerEndorsement: '0x' + Buffer.from('proposer-endorsement').toString('hex').padStart(64, '0'),
  },
};

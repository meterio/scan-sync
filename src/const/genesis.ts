import { ExecutorAddress, ExtensionAddress, ParamsAddress, PrototypeAddress } from './address';
import { Network } from './network';

const uint8ToAddress = (input: number) => '0x' + Buffer.alloc(1).fill(input).toString('hex').padStart(40, '0');

const preCompiledContract = [uint8ToAddress(1)];
export const getPreAllocAccount = (net: Network) => {
  if (net === Network.MainNet) {
    return [
      ParamsAddress,
      ExecutorAddress,
      PrototypeAddress,
      ExtensionAddress,
      ...preCompiledContract,
      ...mainnet.map((item) => item.address),
    ];
  } else if (net === Network.TestNet) {
    return [ParamsAddress, PrototypeAddress, ExtensionAddress, ...preCompiledContract, ...testnet];
  } else {
    throw new Error('unknown network: ' + net);
  }
};

// "address", "name", "release epoch"
const mainnet = [
  // team accounts
  { address: '0x2fa2d56e312c47709537acb198446205736022aa', name: 'Team 1', epoch: '4380' }, // 182.5 days
  { address: '0x08ebea6584b3d9bf6fbcacf1a1507d00a61d95b7', name: 'Team 2', epoch: '8760' }, // 365 days
  { address: '0x045df1ef32d6db371f1857bb60551ef2e43abb1e', name: 'Team 3', epoch: '13140' }, // 547.5 days
  { address: '0xbb8fca96089572f08736062b9c7da651d00011d0', name: 'Team 4', epoch: '17520' }, // 730 days
  { address: '0xab22ab75f8c42b6969c5d226f39aeb7be35bf24b', name: 'Team 5', epoch: '21900' }, // 912.5 days
  { address: '0x63723217e860bc409e29b46eec70101cd03d8242', name: 'Team 6', epoch: '26280' }, // 1095 days
  { address: '0x0374f5867ab2effd2277c895e7d1088b10ec9452', name: 'Team 7', epoch: '30660' }, // 1277.5 days
  { address: '0x5308b6f26f21238963d0ea0b391eafa9be53c78e', name: 'Team 8', epoch: '35050' }, // 1460 days

  // Foundation
  { address: '0xbb28e3212cf0df458cb3ba2cf2fd14888b2d7da7', name: 'Marketing', epoch: '24' }, // 1 day
  { address: '0xe9061c2517bba8a7e2d2c20053cd8323b577efe7', name: 'Foundation Ops', epoch: '24' },
  { address: '0x489d1aac58ab92a5edbe076e71d7f47d1578e20a', name: 'Public Sale', epoch: '24' },
  { address: '0x46b77531b74ff31882c4636a35547535818e0baa', name: 'Foundation Lock', epoch: '17520' }, // 730 days

  // testnet meter mapping
  { address: '0xfa48b8c0e56f9560acb758324b174d32b9eb2e39', name: 'Account for DFL MTR', epoch: '24' }, // 1 day
  { address: '0x0434a7f71945451f446297688e468efa716443bf', name: 'Account for DFL Airdrop', epoch: '24' },
  { address: '0x867a4314d877f5be69048f65cf68ebc6f70fc639', name: 'MC', epoch: '24' },
  { address: '0xcef65d58d09c9c5d39e0bb28f7a4c502322132a5', name: 'PO', epoch: '24' },
  { address: '0xe246b3d9caceaf36a42ffb1d66f9c1ad7f32b33e', name: 'lin zhong shu bai', epoch: '24' },
  { address: '0x150b4febe7b197c4b2b455dc2629f1366ea84bd7', name: 'Anothny', epoch: '24' },
  { address: '0x0e5f991b5b11173e5a2682ec3f68fc6efff95590', name: 'beng deng', epoch: '24' },
  { address: '0x16fB7dC58954Fc1Fa65318B752fC91f2824115B6', name: 'ni liu sha', epoch: '24' },
  { address: '0x77867ff74462bf2754b228092523c11d605aa4f9', name: 'da qi', epoch: '24' },
  { address: '0x0d3434d537e85a6b48e5fc7d988e24f6a705e64f', name: 'Shuai', epoch: '24' },
  { address: '0xe2f91040e099f0070800be43f5e2491b785b945e', name: 'Tony Wang', epoch: '24' },
  { address: '0x1a922d445e8176531926d3bd585dbb59f0ae65b1', name: 'xiu xing zhe', epoch: '24' },
  { address: '0x673c8e958302bd7cca53112bc04b2adab7e66faf', name: 'xiaofo peng you', epoch: '24' },
  { address: '0xd90401e403834aa42850c4d2a7049d68dfd2ecd7', name: 'jian fei', epoch: '24' },
  { address: '0xcc79e77273e6d4e9c2eb078bbe11a8071ed08a47', name: 'Jennifer', epoch: '24' },
  { address: '0x5bfef0997ce0ea62cb29fffb28ad2e187e51af26', name: 'name 1', epoch: '24' },
  { address: '0xec6c5ba4653ed015d6ed65bf385123eb0e479ab6', name: 'name 2', epoch: '24' },
  { address: '0x9e0a6279edfaa778529a4212ba6dca667a7f41d2', name: 'name 3', epoch: '24' },
  { address: '0xf531583d59056fceb07d577a9187eda9d12e6dda', name: 'name 4', epoch: '24' },
  { address: '0x5d4dab27103450a0dbc2f71942023ebb27cd2310', name: 'name 5', epoch: '24' },
  { address: '0xd8d58db373fc83258b26409248cc481af8395ffa', name: 'name 6', epoch: '24' },
];

const testnet: string[] = [];

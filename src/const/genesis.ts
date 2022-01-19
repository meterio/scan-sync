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
    return [
      ParamsAddress,
      PrototypeAddress,
      ExtensionAddress,
      ...preCompiledContract,
      ...testnet.map((item) => item.address),
    ];
  } else {
    throw new Error('unknown network: ' + net);
  }
};

export const getAccountName = (net, addr) => {
  if (net === Network.MainNet) {
    if (addr.toLowerCase() in mainnetKnown) {
      return mainnetKnown[addr];
    }
  } else if (net === Network.TestNet) {
    if (addr.toLowerCase() in testnetKnown) {
      return testnetKnown[addr];
    }
  }
};

// "address", "name", "release epoch"
const mainnetKnown = {
  '0x46b77531b74ff31882c4636a35547535818e0baa': 'Foundation Growth Reserve Indefinitely Locked',
  '0x2fa2d56e312c47709537acb198446205736022aa': 'Locked Batch 1',
  '0x08ebea6584b3d9bf6fbcacf1a1507d00a61d95b7': 'Locked Batch 2',
  '0x045df1ef32d6db371f1857bb60551ef2e43abb1e': 'Locked Batch 3',
  '0xbb8fca96089572f08736062b9c7da651d00011d0': 'Locked Batch 4',
  '0xab22ab75f8c42b6969c5d226f39aeb7be35bf24b': 'Locked Batch 5',
  '0x63723217e860bc409e29b46eec70101cd03d8242': 'Locked Batch 6',
  '0x0374f5867ab2effd2277c895e7d1088b10ec9452': 'Locked Batch 7',
  '0x5308b6f26f21238963d0ea0b391eafa9be53c78e': 'Locked Batch 8',
  '0xe9061c2517bba8a7e2d2c20053cd8323b577efe7': 'Foundation Ops',
  '0xbb28e3212cf0df458cb3ba2cf2fd14888b2d7da7': 'Marketing',
  '0x62e3e1df0430e6da83060b3cffc1adeb3792daf1': 'Bridge Locked',
  '0x5c5713656c6819ebe3921936fd28bed2a387cda5': 'Bridge Active',
  '0x1c4b70a3968436b9a0a9cf5205c787eb81bb558c': 'Gate.io',
  '0x0d0707963952f2fba59dd06f2b425ace40b492fe': 'Gate.io',
  '0x78e6f3af2bf71afa209c6e81b161c6a41d2da79d': 'Foundation Ops',
  '0xc1a76f84d977e8d424a8eb09ce6adf029d38b91d': 'Bilaxy',
  '0x6f04787447975b40d29611833711117ed9de155f': 'mxc',

  // system contract
  '0x687a6294d0d6d63e751a059bf1ca68e4ae7b13e2': 'MTR system contract',
  '0x228ebbee999c6a7ad74a6130e81b12f9fe237ba3': 'MTRG system contract',

  // script engine
  '0x6163636f756e742d6c6f636b2d61646472657373': 'Account Lock Script',
  '0x616b696e672d6d6f64756c652d61646472657373': 'Staking Script',
  '0x74696f6e2d6163636f756e742d61646472657373': 'Auction Script',
  '0x61746f722d62656e656669742d61646472657373': 'Validator Benefit',
  '0xe852f654dfaee0e2b60842657379a56e1cafa292': 'Auction Leftover',
};

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

const testnetKnown = {
  '0x1a07d16b152e9a3f5c353bf05944ade8de1a37e9': 'Executor',
  '0x1de8ca2f973d026300af89041b0ecb1c0803a7e6': 'Master',

  // script engine
  '0x6163636f756e742d6c6f636b2d61646472657373': 'Account Lock Script',
  '0x616b696e672d6d6f64756c652d61646472657373': 'Staking Script',
  '0x74696f6e2d6163636f756e742d61646472657373': 'Auction Script',
};

const testnet = [
  { address: '0x1a07d16b152e9a3f5c353bf05944ade8de1a37e9', name: 'executor', epoch: '0' },
  { address: '0x1de8ca2f973d026300af89041b0ecb1c0803a7e6', name: 'account0', epoch: '0' },

  // team accounts
  { address: "0x671e86B2929688e2667E2dB56e0472B7a3AF6Ad6", name: "Team 1", epoch: "4380"},  // 182.5 days
  { address: "0x3D63757898984ab66716A0F4aAF1A60eFc0608e1", name: "Team 2", epoch: "8760"},  // 365 days
  { address: "0x6e4c7C6dB73371C049Ee2E9ac15557DceEbff4a0", name: "Team 3", epoch: "13140"}, // 547.5 days
  { address: "0xdC7b7279ef4940a0776CA15d08ab5296a0ECBE96", name: "Team 4", epoch: "17520"}, // 730 days
  { address: "0xFa1424A93C7cF926fFFACBb9858C480102585C24", name: "Team 5", epoch: "21900"}, // 912.5 days
  { address: "0x826e9f61c8179Aca37fe81620B989125Ccb36089", name: "Team 6", epoch: "26280"}, // 1095 days
  { address: "0x11A9E06994968b696bEE2f643fFdcAe7c0D5c060", name: "Team 7", epoch: "30660"}, // 1277.5 days
  { address: "0x8E7896D70618D38651c7231d26A2ABee259216c0", name: "Team 8", epoch: "35050"}, // 1460 days

  // Foundation
  { address: "0x61ad236FCcCF342B1b76a7DE5D0475EEeb8405a9", name: "Marketing", epoch: "3"}, // 1 day
  { address: "0xAca2D120eE27e0E493bF91Ee9f3315Ec005b9CE3", name: "Foundation Ops", epoch: "24"},
  { address: "0x8B9Ef3147950C00422cDED432DC5b4c0AA2D2Cdd", name: "Public Sale", epoch: "3"},
  { address: "0x78BA7A9E73e219E85bE44D484529944355BF6701", name: "Foundation Lock", epoch: "17520"}, // 730 days

  // testnet meter mapping
  { address: "0xfB88393e18e1B8c45fC2a90b9c533C61D20E290c", name: "Account for DFL STPT", epoch: "3"}, // 1 day
  { address: "0xa6FfDc4f4de5D00f1a218d702a5283300Dfbd5f2", name: "Account for DFL Airdrop", epoch: "24"},
  { address: "0xe7f434Ed3b2ff7f0a2C1582C1cd4321713167419", name: "MC", epoch: "24"},
  { address: "0x79440D5193b2D83fc828002901D4036a65aF1b4C", name: "PO", epoch: "24"},
  { address: "0xfc1091aF3f7720D73D1A29134B74bE6f15F35c90", name: "lin zhong shu bai", epoch: "24"},
  { address: "0xd9f35d8b5E23CCE0b70A723a930863708defE0E0", name: "Anothny", epoch: "24"},
  { address: "0xF57e2c52f570147A7D8c811f4D03d5932cD8FdA5", name: "beng deng", epoch: "24"},
  { address: "0x08fEA8CcD3AA6811E213182731c137eEB291D294", name: "ni liu sha", epoch: "24"},
  { address: "0x9f4a27264Cc89cfb0D385881C348551e4009918F", name: "da qi", epoch: "24"},
  { address: "0x25aA205E81b442A2760aF51A1d8C7D708868F9bA", name: "Shuai", epoch: "24"},
  { address: "0xfd746a652b3a3A81bAA01CB92faE5ba4C32c3667", name: "Tony Wang", epoch: "24"},
  { address: "0xf53E2Edf6d35c163e23F196faA49aB7181322d1e", name: "sdk Dong", epoch: "3"},
];

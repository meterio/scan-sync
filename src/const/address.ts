export const ParamsAddress = '0x' + Buffer.from('Params').toString('hex').padStart(40, '0');
export const ExecutorAddress = '0x' + Buffer.from('Executor').toString('hex').padStart(40, '0');
export const PrototypeAddress = '0x' + Buffer.from('Prototype').toString('hex').padStart(40, '0');
export const ExtensionAddress = '0x' + Buffer.from('Extension').toString('hex').padStart(40, '0');
export const MeasureAddress = '0x' + Buffer.from('Measure').toString('hex').padStart(40, '0');

export const StakingModuleAddress =
  '0x' + Buffer.from('staking-module-address').toString('hex').padStart(40, '0').slice(-40);
export const AuctionModuleAddress =
  '0x' + Buffer.from('auction-account-address').toString('hex').padStart(40, '0').slice(-40);

export const ZeroAddress = '0x'.padEnd(42, '0');
export const KnowExchange = new Map<string, string>();
export const BridgePoolAddress = '0x5c5713656c6819ebe3921936fd28bed2a387cda5';

export const KeyPowPoolCoef = '0x' + Buffer.from('powpool-coef', 'utf-8').toString('hex').padStart(64, '0');

export const LockedMeterGovAddrs: { [key: string]: true } = {
  ZeroAddress: true,
  BridgePoolAddress: true,
  '0x46b77531b74ff31882c4636a35547535818e0baa': true, // Permanant Locked
  '0x2fa2d56e312c47709537acb198446205736022aa': true,
  '0x08ebea6584b3d9bf6fbcacf1a1507d00a61d95b7': true,
  '0x045df1ef32d6db371f1857bb60551ef2e43abb1e': true,
  '0xbb8fca96089572f08736062b9c7da651d00011d0': true,
  '0xab22ab75f8c42b6969c5d226f39aeb7be35bf24b': true,
  '0x63723217e860bc409e29b46eec70101cd03d8242': true,
  '0x0374f5867ab2effd2277c895e7d1088b10ec9452': true,
  '0x5308b6f26f21238963d0ea0b391eafa9be53c78e': true,
  '0xe9061c2517bba8a7e2d2c20053cd8323b577efe7': true,
  '0xbb28e3212cf0df458cb3ba2cf2fd14888b2d7da7': true,
  '0x78e6f3af2bf71afa209c6e81b161c6a41d2da79d': true,
  '0x62e3e1df0430e6da83060b3cffc1adeb3792daf1': true,
};

export const LockedMeterAddrs: { [key: string]: true } = {
  ZeroAddress: true,
  // BridgePoolAddress: true,
  // '0x0434a7f71945451f446297688e468efa716443bf': true, // Locked meter
};
// Thanks to Fabian(creator of vechainstats.com) for the information
KnowExchange.set('0x0f53ec6bbd2b6712c07d8880e5c8f08753d0d5d5', 'BigONE');
KnowExchange.set('0xa4adafaef9ec07bc4dc6de146934c7119341ee25', 'Binance 1 (Hot wallet)');
KnowExchange.set('0xd0d9cd5aa98efcaeee2e065ddb8538fa977bc8eb', 'Binance 2 (Cold wallet)');
KnowExchange.set('0x1263c741069eda8056534661256079d485e111eb', 'Binance 3 (Warm wallet)');
KnowExchange.set('0xfe64e37dfc7d64743d9351260fa99073c840452b', 'Binance US (Hot wallet)');
KnowExchange.set('0xe401984ab34bae9f6c9128e50b57e7988ba815c7', 'Bitfinex');
KnowExchange.set('0xcaca08a5053604bb9e9715ed78102dbb392f21ee', 'Bitfinex (Cold wallet)');
KnowExchange.set('0xb8dc5048769cf1a76a82b6d8c4cbd741b4fc0c48', 'Bithumb');
KnowExchange.set('0x003bfdd8117f9388f82a1101a2c6f4745803c350', 'Bithumb (Cold wallet 2)');
KnowExchange.set('0x572494959983627cff1f2fe0ef44231ddae2451a', 'Bithumb (Cold wallet)');
KnowExchange.set('0x2cf496da57192011e01448dae61895c0f4bc5d68', 'Bithumb (Hot wallet)');
KnowExchange.set('0x0a0c9597ed79bd4dee9d13337da739315d376ebe', 'BitMart');
KnowExchange.set('0x01d1aec89781056ae69ee7381e8e237b5c0b6a64', 'Bitrue');
KnowExchange.set('0xb73554767983dc5aaeac2b948e407f57e8e9dea1', 'Bittrex (Main wallet)');
KnowExchange.set('0xe13322e57366a4dff3a3a32b33355ff2bd2c4dbd', 'Bitvavo');
KnowExchange.set('0xfbc6013ee8891ddc86d850fb8bac99b4d14c8405', 'Coinsuper');
KnowExchange.set('0x0d0707963952f2fba59dd06f2b425ace40b492fe', 'Gate.io');
KnowExchange.set('0x1c4b70a3968436b9a0a9cf5205c787eb81bb558c', 'Gate.io (Cold wallet)');
KnowExchange.set('0xfa4b22b75ae0900e88b640175ae0cd1896ec251a', 'HitBTC');
KnowExchange.set('0xd7dd13a54755cb68859eec0cac24144aafb8c881', 'Huobi');
KnowExchange.set('0xda4d4530d856623dc820427f71e9aa601075f02d', 'KuCoin (Out wallet)');
KnowExchange.set('0x9037aa63d3860b708a31df9d372709322d6a2911', 'KuCoin (Warm wallet)');
KnowExchange.set('0x34e106fcd890331b70be740ca2660aafe9c602d9', 'KuCoin (Cold wallet)');
KnowExchange.set('0x94d85ade017a805396a19327ac4c8e5a347c8a72', 'LaToken (current hot wallet)');
KnowExchange.set('0xa4e7fe69f7a188ddb1af24fa2fd227fb0dd07d83', 'LaToken 1 (first wallet)');
KnowExchange.set('0x68e29026cf3a6b6e3fce24e9fcc2865f39c884d7', 'LaToken 2 (second wallet)');
KnowExchange.set('0xfa02e5f286f635df9378395f4be54647e73a66a0', 'LBank');
KnowExchange.set('0x9a107a75cff525b033a3e53cadafe3d193b570ec', 'MXC');
KnowExchange.set('0x14db82cc90a6cbe876cc24adcfe2953cfdacfee9', 'OceanEx (BAG wallet)');
KnowExchange.set('0x8979cdda17e1afd32c73b65145484abe03f46725', 'OceanEx (DBET wallet 1)');
KnowExchange.set('0x8e9e08eed34cf829158fab863f99c0225d31e123', 'OceanEx (DBET wallet 2)');
KnowExchange.set('0x10fa7c0e8d4e2c04b600918ebdac06823bcd3dee', 'OceanEx (ICO/Cold wallet)');
KnowExchange.set('0x254afc2490d83b1a56fe621cd708f89456472d87', 'OceanEx (JUR wallet 2)');
KnowExchange.set('0x589f83e66272d3d783c06dd6a66cb3b3549e5453', 'OceanEx (OCE wallet 1)');
KnowExchange.set('0x9d30a969297cb008e2d777135155e89a35b5dff4', 'OceanEx (OCE wallet 2)');
KnowExchange.set('0x4e28e3f74c5974c8d18611d5323ae8a1344c3e73', 'OceanEx (PLA wallet 1)');
KnowExchange.set('0x45685fb104772e9b6421202ed2d7309d7a6dc32d', 'OceanEx (PLA wallet 2)');
KnowExchange.set('0xee12ecae8a1fea9d4279640bb87072c9db76198d', 'OceanEx (SHA wallet 1)');
KnowExchange.set('0xe6f432d44de32f22a0b6c743e448e4421653393e', 'OceanEx (SHA wallet 2)');
KnowExchange.set('0xc4c8bf14dbb11703e39aca0d6e51ebf2e93882d7', 'OceanEx (TIC wallet)');
KnowExchange.set('0x284b9e222c461e32c2fa17053e2ea207041cffa0', 'OceanEx (VTHO wallet)');
KnowExchange.set('0x15bccf377f1a9bbd0cd8e24d031c9451326f29a0', 'OceanEx 1 (Hot wallet)');
KnowExchange.set('0x48728dcafa1afaeb79c6d7249b6b4a3868ce5c12', 'OceanEx 2');
KnowExchange.set('0x64594d4e1c9296c15384441fc1640d9812b51ffd', 'OceanEx 3 (Custodian wallet old)');
KnowExchange.set('0xd96ae915d6e28640c373640fd57fad8022c53965', 'OceanEx 4 (Custodian wallet new)');
KnowExchange.set('0xa760bdcbf6c2935d2f1591a38f23251619f802ad', 'OceanEx VTHO (Sender)');
KnowExchange.set('0x21d54bcf0142c5a3286a7ec7449ad9c4fd5a68f2', 'RightBTC (PLA wallet)');
KnowExchange.set('0x18c2385481cdf28779ac271272398dd61cc8cf3e', 'vexchange.io (DBET contract)');
KnowExchange.set('0x6d08d19dff533050f93eaaa0a009e2771d3598bc', 'vexchange.io (EHrT contract)');
KnowExchange.set('0xfeca5a0c2ffd0c894b986f93b492b572236a347a', 'vexchange.io (JUR contract)');
KnowExchange.set('0xdc391a5dbb89a3f768c41cfa0e85dcaaf3a91f91', 'vexchange.io (OCE contract)');
KnowExchange.set('0xd293f479254d5f6494c66a4982c7ca514a53d7c4', 'vexchange.io (PLA contract)');
KnowExchange.set('0xc19cf5dfb71374b920f786078d37b5225cfcf30e', 'vexchange.io (SHA contract)');
KnowExchange.set('0x992cd19c2f33d5f5569f17ff047063b3b0ff1ada', 'vexchange.io (TIC contract)');
KnowExchange.set('0xf9f99f982f3ea9020f0a0afd4d4679dfee1b63cf', 'vexchange.io (VTHO contract)');
KnowExchange.set('0xdc690f1a5de6108239d2d91cfdaa1d19e7ef7f82', 'vexchange.io (YEET custom contract)');
KnowExchange.set('0x534bd48d7cfb0602ea3708cfddacfeb2242c843e', 'vtho.exchange (Contract)');
KnowExchange.set('0x012345403c589a51b02ee27bd41339f6114aac6a', 'vtho.exchange (Intermediary)');
KnowExchange.set('0xfe3baf051e7957393d4bedd14447851946163a74', 'CoinEx (Out)');

export enum Network {
  MainNet = '0x000000008d23443cdb7c8b00391d41d957eab0d5bf812a1657f73f75ead5f997', // mainnet
  TestNet = '0x0000000066429e45f4fac1771b85c839ccbc9bece7c03bdf9003e295739dd6e0', // warringstakes
  DevNet = '0x00000000ed77a5a4cc2cb585ed7fba4200b89751142cd6fe124aecc3d3350e58', // tetra
}

export const getNetwork = (network: string) => {
  switch (network.toLowerCase()) {
    case 'devnet':
      return Network.DevNet;
    case 'testnet':
      return Network.TestNet;
    case 'mainnet':
      return Network.MainNet;
  }
  return Network.TestNet;
};

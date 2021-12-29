export enum Network {
  MainNet = '0x000000008d23443cdb7c8b00391d41d957eab0d5bf812a1657f73f75ead5f997', // mainnet
  TestNet = '0x000000000a03bf523d73774b881c66fbc91df6a0e139a312376676ddd734a4b1', // warringstakes
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

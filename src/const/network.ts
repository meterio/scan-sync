export enum Network {
  MainNet = '0x00000000733c970e6a7d68c7db54e3705eee865a97a07bf7e695c63b238f5e52', // mainnet
  TestNet = '0x000000003383aa3278b83f8c66d7ec335d5b1409fc832b8dd627c55dd8213665', // warringstakes
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

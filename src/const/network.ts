export enum Network {
  MainNet = '0x00000000b08e2405eb4f5b45187746c64fe1171ae640730ece343757b4bf415e', // mainnet
  TestNet = '0x000000000c4fa1212105004b4b019b9f4634904e874f636de2e931d0beb8af96', // testnet
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

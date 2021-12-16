export enum Network {
  MainNet = '0x0000000099725cb54f3134e1946734c6940096747728f6f26ee5179fc741193f', // mainnet
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

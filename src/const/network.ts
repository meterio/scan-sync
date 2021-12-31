export enum Network {
  MainNet = '0x0000000007be693a0f0b9120a60965880a9dbb30f9bc1358e167f5df97e650db', // mainnet
  TestNet = '0x00000000d87b1c4973d56b0b9d6b3f24c85dccd74034724dfc5c1b4682aa3c6f', // warringstakes
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

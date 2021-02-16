export const isHex = (str: string): boolean => {
  return /^[a-f0-9]+$/i.test(str.toLowerCase());
};

export function getBit(number: number, bitPosition: number): number {
  return (number >> bitPosition) & 1;
}

export function setBit(number: number, bitPosition: number, value: boolean): number {
  if (value) {
    return number | (1 << bitPosition);
  } else {
    return number & ~(1 << bitPosition);
  }
}

export function intToByte(value: number): number {
  if (value < -128 || value > 127) {
    throw new Error('value must be in range -128 to 127 for a signed byte');
  }
  return (value + 256) % 256;
}

export function intToLittleEndianList(number: number): number[] {
  const byteList: number[] = [];
  for (let i = 0; i < 2; i++) {
    byteList.push((number >> (i * 8)) & 0xff);
  }
  return byteList;
}

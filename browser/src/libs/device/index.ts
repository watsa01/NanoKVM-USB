import { Modifiers } from './keyboard.ts';
import { Key as MouseKey, Mode as MouseMode } from './mouse.ts';
import { CmdEvent, CmdPacket, InfoPacket } from './proto.ts';
import { SerialPort } from './serial-port.ts';
import { intToByte, intToLittleEndianList } from './utils.ts';

export class Device {
  addr: number;
  serialPort: SerialPort;

  constructor() {
    this.addr = 0x00;
    this.serialPort = new SerialPort();
  }

  async getInfo() {
    const data = new CmdPacket(this.addr, CmdEvent.GET_INFO).encode();
    await this.serialPort.write(data);

    const rsp = await this.serialPort.read(14);
    const rspPacket = new CmdPacket(-1, -1, rsp);
    return new InfoPacket(rspPacket.DATA);
  }

  async sendKeyboardData(modifiers: Modifiers, keys: number[]) {
    if (keys.length !== 6) {
      throw new Error('keyboard keys length must be 6');
    }

    const data = [modifiers.encode(), 0x00, ...keys];
    const cmdData = new CmdPacket(this.addr, CmdEvent.SEND_KB_GENERAL_DATA, data).encode();

    await this.serialPort.write(cmdData);
  }

  async sendMouseAbsoluteData(
    key: MouseKey,
    width: number,
    height: number,
    x: number,
    y: number,
    scroll: number
  ) {
    const xAbs = width === 0 ? 0 : Math.floor((x * 4096) / width);
    const yAbs = width === 0 ? 0 : Math.floor((y * 4096) / height);

    const data = [
      MouseMode.ABSOLUTE,
      key.encode(),
      ...intToLittleEndianList(xAbs),
      ...intToLittleEndianList(yAbs),
      scroll
    ];
    const cmdData = new CmdPacket(this.addr, CmdEvent.SEND_MS_ABS_DATA, data).encode();
    await this.serialPort.write(cmdData);
  }

  async sendMouseRelativeData(msKey: MouseKey, x: number, y: number, scroll: number) {
    const xByte = intToByte(x);
    const yByte = intToByte(y);

    const data = [MouseMode.RELATIVE, msKey.encode(), xByte, yByte, scroll];
    const cmdData = new CmdPacket(this.addr, CmdEvent.SEND_MS_REL_DATA, data).encode();
    await this.serialPort.write(cmdData);
  }
}

// Factory function to create device based on mode
// Note: For remote mode, dynamically import RemoteDevice when needed
export async function createDevice(mode: 'local' | 'remote' = 'local'): Promise<Device | any> {
  if (mode === 'remote') {
    const { RemoteDevice } = await import('../network/RemoteDevice');
    return new RemoteDevice();
  } else {
    return new Device();
  }
}

// Default local device instance for backward compatibility
export const device = new Device();

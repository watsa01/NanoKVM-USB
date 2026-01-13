import { SerialPort } from 'serialport';
import { CmdEvent, CmdPacket, InfoPacket } from '../shared/device/proto';
import { intToByte, intToLittleEndianList } from '../shared/device/utils';
import config from '../config';

export class SerialService {
  private port: SerialPort | null = null;
  private readonly TIMEOUT = 500; // 500ms
  private readonly addr = 0x00;
  private isInitialized = false;

  constructor() {
    this.port = null;
  }

  async init(): Promise<void> {
    try {
      if (this.port?.isOpen) {
        console.log('Closing existing serial port before opening new one');
        await this.close();
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`Opening serial port: ${config.serialDevice} at ${config.serialBaud} baud`);

      this.port = new SerialPort({
        path: config.serialDevice,
        baudRate: config.serialBaud,
      });

      return new Promise((resolve, reject) => {
        this.port!.on('open', () => {
          console.log(`Serial port ${config.serialDevice} opened successfully at ${config.serialBaud} baud`);
          this.isInitialized = true;
          resolve();
        });

        this.port!.on('error', (err) => {
          console.error('Serial port error:', err.message);
          this.isInitialized = false;
          reject(err);
        });
      });
    } catch (err) {
      console.error('Error opening serial port:', err);
      this.isInitialized = false;
      throw err;
    }
  }

  async write(data: number[]): Promise<void> {
    if (!this.port?.isOpen) {
      console.warn('Serial port not open, skipping write');
      return;
    }

    const uint8Array = new Uint8Array(data);
    return new Promise((resolve, reject) => {
      this.port!.write(uint8Array, (err) => {
        if (err) {
          console.error('Error writing to serial port:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async read(minSize: number): Promise<number[]> {
    if (!this.port?.isOpen) {
      throw new Error('Serial port not initialized');
    }

    const result: number[] = [];
    const startTime = Date.now();

    return new Promise((resolve) => {
      const onData = (data: Buffer) => {
        result.push(...Array.from(data));

        if (result.length >= minSize) {
          this.port!.removeListener('data', onData);
          resolve(result.slice(0, minSize));
        }
      };

      const timeout = setTimeout(() => {
        this.port!.removeListener('data', onData);
        resolve([]);
      }, this.TIMEOUT);

      this.port!.on('data', onData);
    });
  }

  async close(): Promise<void> {
    if (this.port?.isOpen) {
      try {
        console.log('Closing serial port...');
        await new Promise<void>((resolve, reject) => {
          this.port!.close((err) => {
            if (err) {
              console.error('Error closing serial port:', err);
              reject(err);
            } else {
              console.log('Serial port closed successfully');
              this.isInitialized = false;
              resolve();
            }
          });
        });
      } catch (error) {
        console.error('Error closing serial port:', error);
        throw error;
      }
    } else {
      console.log('Serial port is already closed or not initialized');
    }
  }

  // Device command methods

  async getInfo(): Promise<InfoPacket> {
    const data = new CmdPacket(this.addr, CmdEvent.GET_INFO).encode();
    await this.write(data);

    const rsp = await this.read(14);
    if (rsp.length === 0) {
      throw new Error('No response from device');
    }

    const rspPacket = new CmdPacket(-1, -1, rsp);
    return new InfoPacket(rspPacket.DATA);
  }

  async sendKeyboardData(modifiers: number, keys: number[]): Promise<void> {
    if (keys.length !== 6) {
      throw new Error('keyboard keys length must be 6');
    }

    const data = [modifiers, 0x00, ...keys];
    const cmdData = new CmdPacket(this.addr, CmdEvent.SEND_KB_GENERAL_DATA, data).encode();
    await this.write(cmdData);
  }

  async sendMouseRelativeData(key: number, x: number, y: number, scroll: number): Promise<void> {
    // Clamp values to signed byte range (-128 to 127)
    const clampedX = Math.max(-128, Math.min(127, Math.round(x)));
    const clampedY = Math.max(-128, Math.min(127, Math.round(y)));

    const xByte = intToByte(clampedX);
    const yByte = intToByte(clampedY);

    const data = [0x01, key, xByte, yByte, scroll];
    const cmdData = new CmdPacket(this.addr, CmdEvent.SEND_MS_REL_DATA, data).encode();
    await this.write(cmdData);
  }

  async sendMouseAbsoluteData(
    key: number,
    width: number,
    height: number,
    x: number,
    y: number,
    scroll: number
  ): Promise<void> {
    const xAbs = width === 0 ? 0 : Math.floor((x * 4096) / width);
    const xLittle = intToLittleEndianList(xAbs);

    const yAbs = height === 0 ? 0 : Math.floor((y * 4096) / height);
    const yLittle = intToLittleEndianList(yAbs);

    const data = [0x02, key, ...xLittle, ...yLittle, scroll];
    const cmdData = new CmdPacket(this.addr, CmdEvent.SEND_MS_ABS_DATA, data).encode();
    await this.write(cmdData);
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isOpen: this.port?.isOpen || false,
      device: config.serialDevice,
      baudRate: config.serialBaud,
    };
  }
}

// Export singleton instance
export const serialService = new SerialService();

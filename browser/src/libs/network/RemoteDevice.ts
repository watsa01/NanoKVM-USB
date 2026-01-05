import { Modifiers } from '../device/keyboard';
import { Key as MouseKey } from '../device/mouse';
import { InfoPacket } from '../device/proto';
import { WebSocketClient } from './WebSocketClient';

export class RemoteDevice {
  private ws: WebSocketClient;
  private mjpegUrl: string = '';
  private pendingInfoRequest: ((info: InfoPacket) => void) | null = null;

  constructor() {
    this.ws = new WebSocketClient();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.ws.on('device:info', (data) => {
      if (this.pendingInfoRequest) {
        const info = new InfoPacket([
          this.parseVersion(data.chipVersion),
          data.isConnected ? 1 : 0,
          this.encodeLockBits(data.numLock, data.capsLock, data.scrollLock),
        ]);
        this.pendingInfoRequest(info);
        this.pendingInfoRequest = null;
      }
    });

    this.ws.on('error', (error) => {
      console.error('RemoteDevice error:', error);
    });
  }

  private parseVersion(version: string): number {
    // Parse version like "V1.3" to byte representation
    const match = version.match(/V(\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1]);
      const minor = parseInt(match[2]);
      return 0x30 + major * 10 + minor;
    }
    return 0x31; // Default V1.1
  }

  private encodeLockBits(numLock: boolean, capsLock: boolean, scrollLock: boolean): number {
    let bits = 0;
    if (numLock) bits |= 0x01;
    if (capsLock) bits |= 0x02;
    if (scrollLock) bits |= 0x04;
    return bits;
  }

  async connect(serverUrl: string): Promise<void> {
    this.mjpegUrl = `${serverUrl}/stream/mjpeg`;
    await this.ws.connect(serverUrl);
  }

  disconnect(): void {
    this.ws.disconnect();
  }

  async getInfo(): Promise<InfoPacket> {
    return new Promise((resolve, reject) => {
      this.pendingInfoRequest = resolve;
      this.ws.send('device:getInfo');

      // Timeout after 2 seconds
      setTimeout(() => {
        if (this.pendingInfoRequest) {
          this.pendingInfoRequest = null;
          reject(new Error('Device info request timeout'));
        }
      }, 2000);
    });
  }

  async sendKeyboardData(modifiers: Modifiers, keys: number[]): Promise<void> {
    if (keys.length !== 6) {
      throw new Error('keyboard keys length must be 6');
    }

    this.ws.send('keyboard:data', {
      modifiers: modifiers.encode(),
      keys,
    });
  }

  async sendMouseAbsoluteData(
    key: MouseKey,
    width: number,
    height: number,
    x: number,
    y: number,
    scroll: number
  ): Promise<void> {
    // Convert to normalized coordinates (0-1)
    const normalizedX = width === 0 ? 0 : x / width;
    const normalizedY = height === 0 ? 0 : y / height;

    this.ws.send('mouse:absolute', {
      buttons: key.encode(),
      x: normalizedX,
      y: normalizedY,
      scroll,
    });
  }

  async sendMouseRelativeData(msKey: MouseKey, x: number, y: number, scroll: number): Promise<void> {
    this.ws.send('mouse:relative', {
      buttons: msKey.encode(),
      x,
      y,
      scroll,
    });
  }

  getMjpegUrl(): string {
    return this.mjpegUrl;
  }

  isConnected(): boolean {
    return this.ws.isConnected();
  }
}

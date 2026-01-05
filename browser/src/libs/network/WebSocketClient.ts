import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';

export interface WebSocketClientEvents {
  connected: () => void;
  disconnected: () => void;
  error: (error: any) => void;
  'device:info': (info: any) => void;
  'device:status': (status: any) => void;
}

export class WebSocketClient extends EventEmitter {
  private socket: Socket | null = null;
  private serverUrl: string = '';
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY = 1000;

  constructor() {
    super();
  }

  connect(serverUrl: string): Promise<void> {
    this.serverUrl = serverUrl;

    return new Promise((resolve, reject) => {
      console.log(`Connecting to WebSocket server: ${serverUrl}`);

      this.socket = io(serverUrl, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: this.MAX_RECONNECT_ATTEMPTS,
        reconnectionDelay: this.RECONNECT_DELAY,
      });

      this.socket.on('connect', () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.emit('connected');
        resolve();
      });

      this.socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
        this.emit('disconnected');
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        this.reconnectAttempts++;
        if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
          this.emit('error', error);
          reject(error);
        }
      });

      // Listen for device events
      this.socket.on('device:info', (data) => {
        this.emit('device:info', data);
      });

      this.socket.on('device:status', (data) => {
        this.emit('device:status', data);
      });

      this.socket.on('error', (data) => {
        console.error('Server error:', data);
        this.emit('error', data);
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      console.log('Disconnecting WebSocket...');
      this.socket.disconnect();
      this.socket = null;
    }
  }

  send(event: string, data?: any): void {
    if (!this.socket?.connected) {
      console.warn('WebSocket not connected, cannot send event:', event);
      return;
    }

    this.socket.emit(event, data);
  }

  on<K extends keyof WebSocketClientEvents>(
    event: K,
    listener: WebSocketClientEvents[K]
  ): this {
    return super.on(event, listener);
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

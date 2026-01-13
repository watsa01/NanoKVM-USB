import { io, Socket } from 'socket.io-client';

export interface WebSocketClientEvents {
  connected: () => void;
  disconnected: () => void;
  error: (error: any) => void;
  'device:info': (info: any) => void;
  'device:status': (status: any) => void;
}

export class WebSocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY = 1000;
  private eventListeners: Map<string, Function[]> = new Map();

  constructor() {}

  connect(serverUrl: string): Promise<void> {
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

  send(event: string, data?: any): boolean {
    if (!this.socket?.connected) {
      console.error('WebSocket not connected, dropping event:', event);
      return false;
    }

    try {
      this.socket.emit(event, data);
      return true;
    } catch (error) {
      console.error('Failed to send WebSocket event:', event, error);
      return false;
    }
  }

  on<K extends keyof WebSocketClientEvents>(
    event: K,
    listener: WebSocketClientEvents[K]
  ): this {
    const listeners = this.eventListeners.get(event as string) || [];
    listeners.push(listener as Function);
    this.eventListeners.set(event as string, listeners);
    return this;
  }

  private emit(event: string, ...args: any[]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => listener(...args));
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

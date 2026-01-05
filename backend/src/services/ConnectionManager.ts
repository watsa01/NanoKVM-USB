import { Socket } from 'socket.io';

interface ClientInfo {
  id: string;
  socket: Socket;
  connectedAt: Date;
  lastActivity: Date;
}

export class ConnectionManager {
  private clients: Map<string, ClientInfo> = new Map();
  private readonly MAX_CLIENTS = 1; // Single client for now

  addClient(socket: Socket): boolean {
    if (this.clients.size >= this.MAX_CLIENTS) {
      console.log(`Max clients (${this.MAX_CLIENTS}) reached, rejecting new connection`);
      return false;
    }

    const clientInfo: ClientInfo = {
      id: socket.id,
      socket,
      connectedAt: new Date(),
      lastActivity: new Date(),
    };

    this.clients.set(socket.id, clientInfo);
    console.log(`Client connected: ${socket.id} (total: ${this.clients.size})`);
    return true;
  }

  removeClient(socketId: string): void {
    if (this.clients.delete(socketId)) {
      console.log(`Client disconnected: ${socketId} (remaining: ${this.clients.size})`);
    }
  }

  updateActivity(socketId: string): void {
    const client = this.clients.get(socketId);
    if (client) {
      client.lastActivity = new Date();
    }
  }

  getClient(socketId: string): ClientInfo | undefined {
    return this.clients.get(socketId);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getAllClients(): ClientInfo[] {
    return Array.from(this.clients.values());
  }

  hasCapacity(): boolean {
    return this.clients.size < this.MAX_CLIENTS;
  }

  disconnectAll(): void {
    this.clients.forEach(client => {
      client.socket.disconnect(true);
    });
    this.clients.clear();
    console.log('All clients disconnected');
  }
}

// Export singleton instance
export const connectionManager = new ConnectionManager();

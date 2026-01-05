import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import config from './config';
import { serialService } from './services/SerialService';
import { videoService } from './services/VideoService';
import { connectionManager } from './services/ConnectionManager';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      serial: serialService.getStatus(),
      video: videoService.getStatus(),
      clients: connectionManager.getClientCount(),
    },
  });
});

// Device information endpoints
app.get('/api/devices/serial', async (req: Request, res: Response) => {
  try {
    const { SerialPort } = await import('serialport');
    const ports = await SerialPort.list();
    res.json({ ports });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// MJPEG video stream endpoint
app.get('/stream/mjpeg', (req: Request, res: Response) => {
  console.log('MJPEG stream requested');

  // Set headers for MJPEG stream
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=--FRAME',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Pragma': 'no-cache',
  });

  // Send frames to client
  const sendFrame = (data: Buffer) => {
    res.write('--FRAME\r\n');
    res.write('Content-Type: image/jpeg\r\n');
    res.write(`Content-Length: ${data.length}\r\n`);
    res.write('\r\n');
    res.write(data);
    res.write('\r\n');
  };

  // Listen for frames from video service
  videoService.on('frame', sendFrame);

  // Start streaming if not already
  if (!videoService.isActive()) {
    videoService.startStreaming().catch(err => {
      console.error('Failed to start video streaming:', err);
      res.status(500).end();
    });
  }

  // Clean up when client disconnects
  req.on('close', () => {
    console.log('MJPEG client disconnected');
    videoService.removeListener('frame', sendFrame);

    // Stop streaming if no more clients
    // Note: In production, you'd want to track active stream clients
  });
});

// WebSocket connection handling
io.on('connection', (socket: Socket) => {
  console.log(`New WebSocket connection attempt: ${socket.id}`);

  // Check if we can accept new clients
  if (!connectionManager.hasCapacity()) {
    console.log('Max clients reached, rejecting connection');
    socket.emit('error', {
      message: 'Server is at maximum capacity',
      code: 'MAX_CLIENTS',
    });
    socket.disconnect(true);
    return;
  }

  // Add client
  if (!connectionManager.addClient(socket)) {
    socket.emit('error', {
      message: 'Failed to add client',
      code: 'ADD_CLIENT_FAILED',
    });
    socket.disconnect(true);
    return;
  }

  // Send initial device status
  socket.emit('device:status', {
    connected: serialService.getStatus().isOpen,
    serialPort: config.serialDevice,
    videoDevice: config.videoDevice,
  });

  // Handle keyboard data
  socket.on('keyboard:data', async (payload: { modifiers: number; keys: number[] }) => {
    try {
      connectionManager.updateActivity(socket.id);
      await serialService.sendKeyboardData(payload.modifiers, payload.keys);
    } catch (error: any) {
      console.error('Error sending keyboard data:', error);
      socket.emit('error', {
        message: error.message,
        code: 'KEYBOARD_ERROR',
      });
    }
  });

  // Handle mouse absolute data
  socket.on('mouse:absolute', async (payload: {
    buttons: number;
    x: number;
    y: number;
    scroll: number;
  }) => {
    try {
      connectionManager.updateActivity(socket.id);
      // Convert normalized coordinates (0-1) to device coordinates
      await serialService.sendMouseAbsoluteData(
        payload.buttons,
        1, // width (normalized)
        1, // height (normalized)
        payload.x,
        payload.y,
        payload.scroll
      );
    } catch (error: any) {
      console.error('Error sending mouse absolute data:', error);
      socket.emit('error', {
        message: error.message,
        code: 'MOUSE_ERROR',
      });
    }
  });

  // Handle mouse relative data
  socket.on('mouse:relative', async (payload: {
    buttons: number;
    x: number;
    y: number;
    scroll: number;
  }) => {
    try {
      connectionManager.updateActivity(socket.id);
      await serialService.sendMouseRelativeData(
        payload.buttons,
        payload.x,
        payload.y,
        payload.scroll
      );
    } catch (error: any) {
      console.error('Error sending mouse relative data:', error);
      socket.emit('error', {
        message: error.message,
        code: 'MOUSE_ERROR',
      });
    }
  });

  // Handle device info request
  socket.on('device:getInfo', async () => {
    try {
      connectionManager.updateActivity(socket.id);
      const info = await serialService.getInfo();
      socket.emit('device:info', {
        chipVersion: info.CHIP_VERSION,
        isConnected: info.IS_CONNECTED,
        numLock: info.NUM_LOCK,
        capsLock: info.CAPS_LOCK,
        scrollLock: info.SCROLL_LOCK,
      });
    } catch (error: any) {
      console.error('Error getting device info:', error);
      socket.emit('error', {
        message: error.message,
        code: 'GET_INFO_ERROR',
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    connectionManager.removeClient(socket.id);
  });
});

// Initialize services and start server
async function start() {
  try {
    console.log('Initializing NanoKVM-USB backend server...');

    // Initialize serial port
    console.log('Initializing serial port...');
    await serialService.init();
    console.log('Serial port initialized successfully');

    // Start HTTP server
    httpServer.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
      console.log(`- Health check: http://localhost:${config.port}/health`);
      console.log(`- MJPEG stream: http://localhost:${config.port}/stream/mjpeg`);
      console.log(`- WebSocket: ws://localhost:${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  connectionManager.disconnectAll();
  await videoService.stopStreaming();
  await serialService.close();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  connectionManager.disconnectAll();
  await videoService.stopStreaming();
  await serialService.close();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start the server
start();

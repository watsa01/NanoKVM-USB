# NanoKVM-USB Remote Access Implementation

## Overview

The NanoKVM-USB project has been successfully separated into frontend and backend components, enabling remote access over the network. You can now run the backend on the machine with the KVM device plugged in, and access the frontend from a different laptop.

## What's Been Implemented

### ✅ Backend (Complete)

**Location:** `/backend`

1. **Node.js + TypeScript Server**
   - Express HTTP server on port 3000
   - Socket.IO WebSocket server for real-time communication
   - CORS enabled for local network access

2. **SerialService** (`backend/src/services/SerialService.ts`)
   - USB serial communication at 57600 baud
   - Reuses protocol code from the frontend
   - Implements all device commands (keyboard, mouse, device info)

3. **VideoService** (`backend/src/services/VideoService.ts`)
   - MJPEG video streaming via ffmpeg
   - HTTP endpoint: `/stream/mjpeg`
   - Configurable resolution, quality, and FPS

4. **ConnectionManager** (`backend/src/services/ConnectionManager.ts`)
   - Tracks active client connections
   - Single client enforcement (configurable)

5. **API Endpoints**
   - `GET /health` - Server health check
   - `GET /stream/mjpeg` - MJPEG video stream
   - `GET /api/devices/serial` - List serial ports

6. **WebSocket Events**
   - `keyboard:data` - Keyboard input
   - `mouse:absolute` - Absolute mouse position
   - `mouse:relative` - Relative mouse movement
   - `device:getInfo` - Device information request

### ✅ Frontend (Complete)

**Location:** `/browser/src/libs/network`

1. **RemoteDevice Class** (`RemoteDevice.ts`)
   - Implements same interface as local Device class
   - Communicates over WebSocket
   - Converts local protocol to network messages

2. **WebSocketClient** (`WebSocketClient.ts`)
   - Socket.IO client wrapper
   - Auto-reconnection with exponential backoff
   - Event emitter for responses

3. **Updated Components**
   - Camera class supports both local MediaStream and remote MJPEG URLs
   - Device factory pattern for local vs remote mode selection
   - Connection state management atoms (Jotai)

### ✅ Deployment (Complete)

1. **Backend Dockerfile** (`backend/Dockerfile`)
   - Node.js Alpine image with ffmpeg
   - TypeScript compilation
   - Exposes port 3000

2. **Updated docker-compose.yml**
   - Backend service with USB device access
   - Frontend service
   - Network bridge for inter-service communication

## Quick Start

### 1. Install Dependencies

#### Backend
```bash
cd backend
npm install
```

#### Frontend
```bash
cd browser
npm install
```

### 2. Configuration

Create `backend/.env` file:
```env
PORT=3000
VIDEO_DEVICE=/dev/video0
SERIAL_DEVICE=/dev/ttyUSB0
SERIAL_BAUD=57600
VIDEO_RESOLUTION=1920x1080
MJPEG_QUALITY=80
MJPEG_FPS=30
CORS_ORIGIN=*
```

**Note:** Adjust `/dev/ttyUSB0` to match your actual serial device. Use `ls /dev/tty*` to list available devices.

### 3. Running with Docker (Recommended)

#### Start both backend and frontend:
```bash
docker-compose up --build
```

#### Access:
- **Frontend:** http://localhost:9000
- **Backend API:** http://localhost:3000
- **MJPEG Stream:** http://localhost:3000/stream/mjpeg
- **Health Check:** http://localhost:3000/health

### 4. Running Locally (Development)

#### Terminal 1 - Backend:
```bash
cd backend
npm run dev
```

#### Terminal 2 - Frontend:
```bash
cd browser
npm run dev
```

## Testing the Backend

### 1. Check Server Health
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-05T...",
  "services": {
    "serial": {
      "isInitialized": true,
      "isOpen": true,
      "device": "/dev/ttyUSB0",
      "baudRate": 57600
    },
    "video": {
      "isStreaming": false,
      "device": "/dev/video0",
      "resolution": "1920x1080",
      "fps": 30,
      "quality": 80
    },
    "clients": 0
  }
}
```

### 2. Test MJPEG Stream
Open in browser:
```
http://localhost:3000/stream/mjpeg
```

You should see the live video feed from the KVM device.

### 3. Test WebSocket Connection

Use the browser console:
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected!');

  // Request device info
  socket.emit('device:getInfo');
});

socket.on('device:info', (data) => {
  console.log('Device info:', data);
});

socket.on('device:status', (data) => {
  console.log('Device status:', data);
});
```

## Using Remote Mode in Frontend

### Manual Integration (Until UI is built)

In your React components, you can use the RemoteDevice like this:

```typescript
import { RemoteDevice } from './libs/network/RemoteDevice';
import { camera } from './libs/camera';

// Create remote device
const remoteDevice = new RemoteDevice();

// Connect to backend
await remoteDevice.connect('http://localhost:3000');

// Open remote video stream
await camera.openRemote(remoteDevice.getMjpegUrl());

// Use device (same interface as local device)
await remoteDevice.sendKeyboardData(modifiers, keys);
await remoteDevice.sendMouseAbsoluteData(key, width, height, x, y, scroll);
const info = await remoteDevice.getInfo();
```

## What Remains to Be Done

### UI Components (Optional)

While the core functionality is complete, you may want to add UI components for a better user experience:

1. **Connection Modal** (`browser/src/components/connection/ConnectionModal.tsx`)
   - Input field for server URL
   - Connect/Disconnect button
   - Connection status display

2. **Status Indicator** (`browser/src/components/connection/StatusIndicator.tsx`)
   - Connected (green)
   - Connecting (yellow)
   - Disconnected (red)
   - Latency display

3. **Update Device Modal** (`browser/src/components/device-modal/index.tsx`)
   - Add radio buttons for "Local USB" vs "Remote Server"
   - Show server URL input for remote mode

4. **Update App.tsx**
   - Support MJPEG `<img>` tag for remote mode
   - Switch between `<video>` (local) and `<img>` (remote)

Example in App.tsx:
```tsx
import { camera } from './libs/camera';

// In render:
{camera.getMode() === 'remote' ? (
  <img
    src={camera.getMjpegUrl()}
    alt="Remote KVM Video"
    style={{
      transform: `scale(${videoScale}) rotate(${videoRotation}deg)`,
      objectFit: 'scale-down'
    }}
  />
) : (
  <video
    ref={videoRef}
    autoPlay
    playsInline
    style={{
      transform: `scale(${videoScale}) rotate(${videoRotation}deg)`,
      objectFit: 'scale-down'
    }}
  />
)}
```

## Troubleshooting

### Backend Issues

**Serial port not opening:**
```bash
# List available serial ports
ls /dev/tty*

# Check permissions
sudo chmod 666 /dev/ttyUSB0

# Or add user to dialout group
sudo usermod -a -G dialout $USER
```

**Video device not found:**
```bash
# List video devices
ls /dev/video*

# Test with ffmpeg
ffmpeg -f v4l2 -list_formats all -i /dev/video0
```

**Docker USB device access:**
- Ensure `privileged: true` is set in docker-compose.yml
- Device paths must match host device paths
- Try `--device /dev/bus/usb` to grant access to all USB devices

### Frontend Issues

**WebSocket connection refused:**
- Check backend is running: `curl http://localhost:3000/health`
- Check CORS settings in backend/.env
- Verify serverUrl in connection atoms

**MJPEG stream not displaying:**
- Test stream directly: http://localhost:3000/stream/mjpeg
- Check browser console for errors
- Verify video device is accessible

## Network Configuration

### Local Network Access

To access from another laptop on the same network:

1. **Find backend server IP:**
   ```bash
   ip addr show | grep inet
   # or
   hostname -I
   ```

2. **Update frontend server URL:**
   ```typescript
   // Use the backend machine's IP instead of localhost
   const serverUrl = 'http://192.168.1.100:3000';
   ```

3. **Firewall:**
   ```bash
   # Allow port 3000 (backend)
   sudo ufw allow 3000/tcp

   # Allow port 9000 (frontend)
   sudo ufw allow 9000/tcp
   ```

### Remote Access (Over Internet)

For access outside your local network, you'll need:

1. **Port forwarding** on your router (ports 3000 and 9000)
2. **Dynamic DNS** if you don't have a static IP
3. **Consider security:** Add authentication (not implemented yet)

## Architecture Summary

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│  Laptop B   │ ───────>│   Machine A      │ ───────>│ KVM Device  │
│  (Browser)  │  HTTP/  │  Node.js Backend │  USB/   │             │
│             │  WS     │  Port 3000       │  Serial │             │
└─────────────┘         └──────────────────┘         └─────────────┘
```

**Communication:**
- **Video:** MJPEG over HTTP (port 3000)
- **Control:** WebSocket for keyboard/mouse (port 3000)
- **Protocol:** JSON messages wrapping binary serial protocol

**Latency:**
- Keyboard/Mouse: <100ms
- Video (MJPEG): ~200-500ms

## Performance Tips

1. **Reduce video resolution** for lower bandwidth:
   ```env
   VIDEO_RESOLUTION=1280x720  # Instead of 1920x1080
   ```

2. **Adjust MJPEG quality** (trade-off: quality vs bandwidth):
   ```env
   MJPEG_QUALITY=60  # Lower = smaller files, lower quality
   ```

3. **Reduce frame rate** for slower connections:
   ```env
   MJPEG_FPS=15  # Instead of 30
   ```

## Future Enhancements

- [ ] WebRTC for lower latency video (<200ms)
- [ ] Authentication and HTTPS/WSS
- [ ] Multi-user support with permission levels
- [ ] Bandwidth usage monitoring
- [ ] Connection quality adaptation
- [ ] Recording functionality in remote mode

## Files Created/Modified

### Backend (New)
- `backend/src/server.ts`
- `backend/src/services/SerialService.ts`
- `backend/src/services/VideoService.ts`
- `backend/src/services/ConnectionManager.ts`
- `backend/src/config.ts`
- `backend/src/shared/device/*` (copied from frontend)
- `backend/package.json`
- `backend/tsconfig.json`
- `backend/Dockerfile`
- `backend/.env.example`

### Frontend (New/Modified)
- `browser/src/libs/network/RemoteDevice.ts` (new)
- `browser/src/libs/network/WebSocketClient.ts` (new)
- `browser/src/libs/device/index.ts` (modified - added factory)
- `browser/src/libs/camera/index.ts` (modified - added remote support)
- `browser/src/jotai/connection.ts` (new)
- `browser/package.json` (modified - added socket.io-client)

### Deployment
- `docker-compose.yml` (modified - added backend service)

## Support

If you encounter issues:
1. Check the logs: `docker-compose logs -f backend`
2. Verify device paths: `ls /dev/video* /dev/tty*`
3. Test backend health: `curl http://localhost:3000/health`
4. Check this README's troubleshooting section

Enjoy your remote KVM access! 🚀

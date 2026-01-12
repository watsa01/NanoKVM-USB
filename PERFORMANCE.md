# Performance Optimization Guide

This guide explains how to optimize NanoKVM-USB for different network conditions, especially when using WiFi or mobile networks (4G/5G).

## Problem: Video Latency and Lag

If you experience video latency where the display falls behind and doesn't catch up to real-time, it's usually due to bandwidth limitations. The default settings prioritize quality over bandwidth efficiency.

## Solution: Backend Configuration

The backend server has three key settings in `/backend/.env` that control video streaming performance:

### 1. Video Resolution (`VIDEO_RESOLUTION`)

Controls the size of the video stream.

- **High Quality / LAN**: `1920x1080` (Full HD)
- **Balanced / WiFi**: `1280x720` (720p) - **Recommended default**
- **Low Bandwidth / 4G**: `640x480` (480p)

### 2. MJPEG Quality (`MJPEG_QUALITY`)

Controls JPEG compression quality (1-100).

- **High Quality / LAN**: `80-100`
- **Balanced / WiFi**: `50-60` - **Recommended default**
- **Low Bandwidth / 4G**: `30-50`

### 3. Frame Rate (`MJPEG_FPS`)

Controls how many frames per second are streamed.

- **High Quality / LAN**: `30` fps
- **Balanced / WiFi**: `15-20` fps - **Recommended default**
- **Low Bandwidth / 4G**: `10-15` fps

## Example Configurations

### Default (Optimized for WiFi/4G)

```env
VIDEO_RESOLUTION=1280x720
MJPEG_QUALITY=50
MJPEG_FPS=15
```

**Bandwidth**: ~2-4 Mbps
**Use case**: Most home/office WiFi, 4G mobile connections

### High Quality (LAN/Fast WiFi)

```env
VIDEO_RESOLUTION=1920x1080
MJPEG_QUALITY=80
MJPEG_FPS=30
```

**Bandwidth**: ~10-15 Mbps
**Use case**: Local network, gigabit ethernet, fast WiFi

### Low Bandwidth (Slow 4G/3G)

```env
VIDEO_RESOLUTION=640x480
MJPEG_QUALITY=40
MJPEG_FPS=10
```

**Bandwidth**: ~0.5-1 Mbps
**Use case**: Slow mobile connections, congested networks

## Frontend Improvements

The browser frontend has been updated with:

1. **Frame dropping**: Automatically drops old frames when rendering can't keep up
2. **Auto-reconnect**: Detects stream stalls and reconnects to get fresh frames
3. **Canvas rendering**: Replaces browser's native MJPEG handling for better control

These improvements work automatically - no configuration needed.

## How to Apply Changes

1. Edit `/backend/.env` with your preferred settings
2. Restart the backend server:
   ```bash
   cd backend
   npm run dev
   ```
   Or if using Docker:
   ```bash
   docker-compose restart
   ```

3. Reload the browser interface

## Troubleshooting

### Still experiencing lag?

1. **Lower all three settings** - Try reducing resolution to 640x480, quality to 40, and fps to 10
2. **Check network speed** - Run a speed test to verify your upload/download speeds
3. **Check console logs** - Open browser DevTools and look for "Dropped N frames" messages

### Video is choppy but not lagging behind?

This means your settings are working correctly - frames are being dropped to maintain low latency. If you want smoother video:
- Increase `MJPEG_FPS` if your bandwidth allows
- Or accept the choppiness as the tradeoff for low latency

### Connection keeps reconnecting?

The auto-reconnect triggers after 3 seconds without new frames. This usually means:
- Network is too slow for current settings - reduce quality/fps/resolution
- Server is overloaded - check backend CPU usage
- USB device issues - check `dmesg` logs on the server

## Technical Details

The video stream uses Motion JPEG (MJPEG) format over HTTP. Bandwidth is calculated as:

```
Bandwidth (Mbps) ≈ Resolution × Quality × FPS / 1000
```

For example:
- 1920×1080 @ Q80 @ 30fps ≈ 12 Mbps
- 1280×720 @ Q50 @ 15fps ≈ 3 Mbps
- 640×480 @ Q40 @ 10fps ≈ 0.8 Mbps

Lower settings mean less bandwidth but also lower quality and smoothness. Find the balance that works for your network.

import { useEffect, useRef, useState } from 'react';

interface VideoCanvasProps {
  mjpegUrl: string;
  videoScale: number;
  videoRotation: number;
  shouldSwapDimensions: boolean;
  className?: string;
}

export const VideoCanvas = ({
  mjpegUrl,
  videoScale,
  videoRotation,
  shouldSwapDimensions,
  className
}: VideoCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isRenderingRef = useRef(false);
  const latestImageRef = useRef<HTMLImageElement | null>(null);
  const pendingFramesRef = useRef<Uint8Array[]>([]);
  const lastFrameTimeRef = useRef<number>(Date.now());
  const lastRenderTimeRef = useRef<number>(Date.now());
  const reconnectTimerRef = useRef<number | null>(null);
  const periodicTimerRef = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1920, height: 1080 });

  // Reconnect if no frames for this long (in ms)
  const RECONNECT_TIMEOUT = 3000; // Give more time before reconnecting for stability

  useEffect(() => {
    if (!mjpegUrl) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Create new abort controller for this stream
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let isActive = true;
    let streamGeneration = 0;

    const reconnectStream = () => {
      console.log('Forcing stream reconnection due to stall...');
      abortControllerRef.current?.abort();
    };

    const startReconnectMonitor = () => {
      const checkForStall = () => {
        if (!isActive) return;

        const timeSinceLastFrame = Date.now() - lastFrameTimeRef.current;
        if (timeSinceLastFrame > RECONNECT_TIMEOUT) {
          reconnectStream();
          return;
        }

        reconnectTimerRef.current = setTimeout(checkForStall, 1000);
      };

      reconnectTimerRef.current = setTimeout(checkForStall, 1000);
    };

    const stopReconnectMonitor = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const schedulePeriodicReconnect = () => {
      // Clear any existing periodic timer first
      if (periodicTimerRef.current !== null) {
        clearTimeout(periodicTimerRef.current);
        periodicTimerRef.current = null;
      }

      // Force reconnect every 10 seconds (increased from 5s for stability)
      periodicTimerRef.current = setTimeout(() => {
        if (!isActive) return;
        console.log('Periodic reconnect to flush network buffers');
        abortControllerRef.current?.abort();
      }, 10000);
    };

    const renderLatestFrame = () => {
      // Skip if already rendering
      if (isRenderingRef.current || pendingFramesRef.current.length === 0) {
        return;
      }

      isRenderingRef.current = true;

      // Get ONLY the latest frame and discard all others
      const frameData = pendingFramesRef.current[pendingFramesRef.current.length - 1];
      const droppedCount = pendingFramesRef.current.length - 1;
      pendingFramesRef.current = [];

      if (droppedCount > 0) {
        console.log(`Dropped ${droppedCount} old frames to maintain low latency`);
      }

      // Track render latency
      const now = Date.now();
      const latency = now - lastFrameTimeRef.current;
      if (latency > 1000) {
        console.warn(`High latency detected: ${latency}ms since last frame arrival`);
        // Don't force immediate reconnect - let the periodic timer handle it
      }
      lastRenderTimeRef.current = now;

      // Create blob and object URL for the JPEG data
      const blob = new Blob([frameData], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);

      const img = new Image();

      img.onload = () => {
        if (!isActive) {
          URL.revokeObjectURL(url);
          isRenderingRef.current = false;
          return;
        }

        // Update canvas dimensions if image size changed
        if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
        }

        // Clear and draw the new frame
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        // Clean up
        if (latestImageRef.current) {
          const oldUrl = latestImageRef.current.src;
          if (oldUrl.startsWith('blob:')) {
            URL.revokeObjectURL(oldUrl);
          }
        }
        latestImageRef.current = img;

        isRenderingRef.current = false;

        // Render next frame if available
        if (pendingFramesRef.current.length > 0) {
          requestAnimationFrame(renderLatestFrame);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        isRenderingRef.current = false;
        console.error('Failed to decode JPEG frame');

        // Try next frame if available
        if (pendingFramesRef.current.length > 0) {
          requestAnimationFrame(renderLatestFrame);
        }
      };

      img.src = url;
    };

    const startStreaming = async () => {
      const currentGeneration = ++streamGeneration;

      try {
        console.log(`Starting MJPEG stream fetch (generation ${currentGeneration}):`, mjpegUrl);

        // Start monitoring for stalls
        startReconnectMonitor();

        // Schedule periodic reconnect to flush network buffers
        schedulePeriodicReconnect();

        // Update last frame time to prevent immediate reconnect
        lastFrameTimeRef.current = Date.now();

        const response = await fetch(mjpegUrl, {
          signal: abortControllerRef.current!.signal,
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        let buffer = new Uint8Array(0);

        // Find JPEG frame boundaries (SOI: 0xFF 0xD8, EOI: 0xFF 0xD9)
        const SOI = new Uint8Array([0xFF, 0xD8]);
        const EOI = new Uint8Array([0xFF, 0xD9]);

        const findMarker = (data: Uint8Array, marker: Uint8Array, startIndex = 0): number => {
          for (let i = startIndex; i <= data.length - marker.length; i++) {
            let match = true;
            for (let j = 0; j < marker.length; j++) {
              if (data[i + j] !== marker[j]) {
                match = false;
                break;
              }
            }
            if (match) return i;
          }
          return -1;
        };

        // Read stream and parse MJPEG frames
        while (isActive) {
          const { done, value } = await reader.read();

          if (done) {
            console.log('Stream ended');
            break;
          }

          // Append new data to buffer
          const newBuffer = new Uint8Array(buffer.length + value.length);
          newBuffer.set(buffer);
          newBuffer.set(value, buffer.length);
          buffer = newBuffer;

          // Limit buffer size to prevent memory issues
          if (buffer.length > 10 * 1024 * 1024) { // 10MB max
            console.warn('Buffer too large, resetting');
            buffer = new Uint8Array(0);
            continue;
          }

          // Extract all complete JPEG frames
          while (true) {
            const soiIndex = findMarker(buffer, SOI);
            if (soiIndex === -1) {
              // No frame start found, clear old data
              if (buffer.length > 5 * 1024 * 1024) {
                buffer = new Uint8Array(0);
              }
              break;
            }

            const eoiIndex = findMarker(buffer, EOI, soiIndex + 2);
            if (eoiIndex === -1) {
              // Incomplete frame, trim buffer and wait for more data
              if (soiIndex > 0) {
                buffer = buffer.slice(soiIndex);
              }
              break;
            }

            // Extract complete frame
            const frameEnd = eoiIndex + 2;
            const frame = buffer.slice(soiIndex, frameEnd);

            // Update last frame time
            lastFrameTimeRef.current = Date.now();

            // Add frame to pending queue (keep max 1 frame for lowest latency)
            pendingFramesRef.current.push(frame);
            if (pendingFramesRef.current.length > 1) {
              pendingFramesRef.current.shift();
            }

            // Trigger render if not already rendering
            if (!isRenderingRef.current) {
              requestAnimationFrame(renderLatestFrame);
            }

            // Remove processed frame from buffer
            buffer = buffer.slice(frameEnd);
          }
        }

      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.log(`Stream fetch aborted (generation ${currentGeneration})`);
        } else {
          console.error('Error streaming MJPEG:', err);
        }
      } finally {
        stopReconnectMonitor();

        // Clear periodic reconnect timer
        if (periodicTimerRef.current !== null) {
          clearTimeout(periodicTimerRef.current);
          periodicTimerRef.current = null;
        }

        // Reconnect if still active
        if (isActive) {
          console.log(`Stream ended, reconnecting in 500ms...`);
          await new Promise(resolve => setTimeout(resolve, 500));

          if (isActive) {
            // Create new abort controller for reconnect
            const newAbortController = new AbortController();
            abortControllerRef.current = newAbortController;

            // Restart streaming
            await startStreaming();
          }
        }
      }
    };

    startStreaming();

    // Cleanup function
    return () => {
      console.log('Cleaning up video stream');
      isActive = false;
      stopReconnectMonitor();

      // Clear periodic timer on unmount
      if (periodicTimerRef.current !== null) {
        clearTimeout(periodicTimerRef.current);
        periodicTimerRef.current = null;
      }

      abortControllerRef.current?.abort();

      // Clear pending frames
      pendingFramesRef.current = [];

      // Clean up any pending image URLs
      if (latestImageRef.current) {
        const url = latestImageRef.current.src;
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      }
    };
  }, [mjpegUrl]);

  return (
    <canvas
      ref={canvasRef}
      id="video"
      className={className}
      style={{
        transform: `scale(${videoScale}) rotate(${videoRotation}deg)`,
        transformOrigin: 'center',
        maxWidth: '100%',
        maxHeight: '100vh',
        width: 'auto',
        height: 'auto',
        aspectRatio: `${dimensions.width} / ${dimensions.height}`,
        display: 'block',
        margin: '0 auto'
      }}
      width={dimensions.width}
      height={dimensions.height}
    />
  );
};

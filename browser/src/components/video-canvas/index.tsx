import { useEffect, useRef, useState } from 'react';

interface VideoCanvasProps {
  mjpegUrl: string;
  videoScale: number;
  videoRotation: number;
  shouldSwapDimensions: boolean;
  mouseStyle: string;
  className?: string;
}

export const VideoCanvas = ({
  mjpegUrl,
  videoScale,
  videoRotation,
  shouldSwapDimensions,
  mouseStyle,
  className
}: VideoCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isRenderingRef = useRef(false);
  const latestImageRef = useRef<HTMLImageElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1920, height: 1080 });

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

    const startStreaming = async () => {
      try {
        console.log('Starting MJPEG stream fetch:', mjpegUrl);

        const response = await fetch(mjpegUrl, {
          signal: abortController.signal,
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
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

        const renderFrame = (frameData: Uint8Array) => {
          // Skip rendering if already rendering (drop frame for low latency)
          if (isRenderingRef.current) {
            return;
          }

          isRenderingRef.current = true;

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
          };

          img.onerror = () => {
            URL.revokeObjectURL(url);
            isRenderingRef.current = false;
            console.error('Failed to decode JPEG frame');
          };

          img.src = url;
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

          // Extract complete JPEG frames
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

            // Render frame (will skip if already rendering)
            renderFrame(frame);

            // Remove processed frame from buffer
            buffer = buffer.slice(frameEnd);
          }
        }

      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.log('Stream fetch aborted');
        } else {
          console.error('Error streaming MJPEG:', err);
        }
      }
    };

    startStreaming();

    // Cleanup function
    return () => {
      isActive = false;
      abortController.abort();

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
        maxWidth: shouldSwapDimensions ? '100vh' : '100%',
        maxHeight: shouldSwapDimensions ? '100vw' : '100%',
        objectFit: 'scale-down',
        display: 'block'
      }}
      width={dimensions.width}
      height={dimensions.height}
    />
  );
};

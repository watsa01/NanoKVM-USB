import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import config from '../config';

export class VideoService extends EventEmitter {
  private ffmpegProcess: ChildProcess | null = null;
  private isStreaming = false;
  private frameBuffer: Buffer[] = [];
  private readonly MAX_BUFFER_SIZE = 10;
  private dataBuffer: Buffer = Buffer.alloc(0);

  constructor() {
    super();
  }

  async startStreaming(): Promise<void> {
    if (this.isStreaming) {
      console.log('Video streaming already active');
      return;
    }

    const [width, height] = config.videoResolution.split('x').map(Number);

    // Use ffmpeg to capture from the video device and encode as MJPEG
    const ffmpegArgs = [
      '-f', 'v4l2',
      '-input_format', 'mjpeg',
      '-video_size', `${width}x${height}`,
      '-framerate', config.mjpegFps.toString(),
      '-i', config.videoDevice,
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', config.mjpegQuality.toString(),
      '-'
    ];

    console.log(`Starting video capture: ${config.videoDevice} at ${width}x${height}`);
    this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

    this.ffmpegProcess.stdout?.on('data', (data: Buffer) => {
      this.handleFrameData(data);
    });

    this.ffmpegProcess.stderr?.on('data', (data: Buffer) => {
      // ffmpeg outputs progress to stderr
      const message = data.toString();
      if (message.includes('error') || message.includes('Error')) {
        console.error('FFmpeg error:', message);
      }
    });

    this.ffmpegProcess.on('error', (err) => {
      console.error('FFmpeg process error:', err);
      this.isStreaming = false;
      this.emit('error', err);
    });

    this.ffmpegProcess.on('close', (code) => {
      console.log(`FFmpeg process exited with code ${code}`);
      this.isStreaming = false;
      this.emit('close');
    });

    this.isStreaming = true;
    this.emit('start');
  }

  private handleFrameData(data: Buffer): void {
    // MJPEG frames are separated by JPEG markers
    // SOI (Start of Image): 0xFF 0xD8
    // EOI (End of Image): 0xFF 0xD9

    // Accumulate incoming data
    this.dataBuffer = Buffer.concat([this.dataBuffer, data]);

    // Parse complete JPEG frames from the buffer
    while (true) {
      // Find SOI marker (0xFF 0xD8)
      const soiIndex = this.findMarker(this.dataBuffer, 0xFF, 0xD8);
      if (soiIndex === -1) {
        // No SOI found, clear buffer if it's getting too large
        if (this.dataBuffer.length > 5 * 1024 * 1024) { // 5MB max
          this.dataBuffer = Buffer.alloc(0);
        }
        break;
      }

      // Find EOI marker (0xFF 0xD9) after SOI
      const eoiIndex = this.findMarker(this.dataBuffer, 0xFF, 0xD9, soiIndex + 2);
      if (eoiIndex === -1) {
        // No EOI found yet, keep accumulating
        // Trim data before SOI to save memory
        if (soiIndex > 0) {
          this.dataBuffer = this.dataBuffer.subarray(soiIndex);
        }
        break;
      }

      // Extract complete JPEG frame (including EOI marker)
      const frameEnd = eoiIndex + 2;
      const frame = this.dataBuffer.subarray(soiIndex, frameEnd);

      // Emit the complete frame
      this.emit('frame', frame);

      // Buffer frames for clients that connect mid-stream
      this.frameBuffer.push(frame);
      if (this.frameBuffer.length > this.MAX_BUFFER_SIZE) {
        this.frameBuffer.shift();
      }

      // Remove processed frame from buffer
      this.dataBuffer = this.dataBuffer.subarray(frameEnd);
    }
  }

  private findMarker(buffer: Buffer, byte1: number, byte2: number, startIndex: number = 0): number {
    for (let i = startIndex; i < buffer.length - 1; i++) {
      if (buffer[i] === byte1 && buffer[i + 1] === byte2) {
        return i;
      }
    }
    return -1;
  }

  async stopStreaming(): Promise<void> {
    if (this.ffmpegProcess) {
      console.log('Stopping video capture...');
      this.ffmpegProcess.kill('SIGTERM');

      // Give it 2 seconds to terminate gracefully
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (this.ffmpegProcess.killed === false) {
        console.log('Force killing ffmpeg process');
        this.ffmpegProcess.kill('SIGKILL');
      }

      this.ffmpegProcess = null;
      this.isStreaming = false;
      this.frameBuffer = [];
      this.dataBuffer = Buffer.alloc(0);
    }
  }

  getStatus() {
    return {
      isStreaming: this.isStreaming,
      device: config.videoDevice,
      resolution: config.videoResolution,
      fps: config.mjpegFps,
      quality: config.mjpegQuality,
    };
  }

  isActive(): boolean {
    return this.isStreaming;
  }
}

// Export singleton instance
export const videoService = new VideoService();

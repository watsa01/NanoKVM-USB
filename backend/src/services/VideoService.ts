import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import config from '../config';

export class VideoService extends EventEmitter {
  private ffmpegProcess: ChildProcess | null = null;
  private isStreaming = false;
  private frameBuffer: Buffer[] = [];
  private readonly MAX_BUFFER_SIZE = 10;

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

    // For simplicity, we'll emit the data as it comes
    // In production, you'd want to parse individual JPEG frames
    this.emit('frame', data);

    // Buffer frames for clients that connect mid-stream
    this.frameBuffer.push(data);
    if (this.frameBuffer.length > this.MAX_BUFFER_SIZE) {
      this.frameBuffer.shift();
    }
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

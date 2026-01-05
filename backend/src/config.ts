import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // USB Devices
  videoDevice: process.env.VIDEO_DEVICE || '/dev/video0',
  serialDevice: process.env.SERIAL_DEVICE || '/dev/ttyUSB0',
  serialBaud: parseInt(process.env.SERIAL_BAUD || '57600', 10),

  // Video Settings
  videoResolution: process.env.VIDEO_RESOLUTION || '1920x1080',
  mjpegQuality: parseInt(process.env.MJPEG_QUALITY || '80', 10),
  mjpegFps: parseInt(process.env.MJPEG_FPS || '30', 10),

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || '*',
};

export default config;

class Camera {
  id: string = '';
  width: number = 1920;
  height: number = 1080;
  audioId: string = '';
  stream: MediaStream | null = null;
  mjpegUrl: string = '';
  mode: 'local' | 'remote' = 'local';

  public async open(id: string, width: number, height: number, audioId?: string) {
    if (!id && !this.id) {
      return;
    }

    this.close();

    const constraints = {
      video: { deviceId: { exact: id }, width: { ideal: width }, height: { ideal: height } },
      audio: audioId ? { deviceId: { exact: audioId } } : false
    };

    this.id = id;
    this.width = width;
    this.height = height;
    this.mode = 'local';
    if (audioId) this.audioId = audioId;
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
  }

  public async openRemote(mjpegUrl: string) {
    this.close();
    this.mjpegUrl = mjpegUrl;
    this.mode = 'remote';
  }

  public async updateResolution(width: number, height: number) {
    if (this.mode === 'local') {
      return this.open(this.id, width, height, this.audioId);
    }
    // For remote mode, resolution is controlled by the backend
  }

  public close(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.mjpegUrl = '';
  }

  public getStream(): MediaStream | null {
    return this.stream;
  }

  public getMjpegUrl(): string {
    return this.mjpegUrl;
  }

  public getMode(): 'local' | 'remote' {
    return this.mode;
  }

  public isOpen(): boolean {
    return this.stream !== null || this.mjpegUrl !== '';
  }
}

export const camera = new Camera();

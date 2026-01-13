import { useEffect, useState } from 'react';
import { Alert, Result, Spin } from 'antd';
import clsx from 'clsx';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'react-responsive';

import { DeviceModal } from '@/components/device-modal';
import { Keyboard } from '@/components/keyboard';
import { Menu } from '@/components/menu';
import { Mouse } from '@/components/mouse';
import { VideoCanvas } from '@/components/video-canvas';
import { VirtualKeyboard } from '@/components/virtual-keyboard';
import {
  resolutionAtom,
  serialStateAtom,
  videoRotationAtom,
  videoScaleAtom,
  videoStateAtom
} from '@/jotai/device.ts';
import { isKeyboardEnableAtom } from '@/jotai/keyboard.ts';
import { mouseStyleAtom } from '@/jotai/mouse.ts';
import { camera } from '@/libs/camera';
import { setDevice } from '@/libs/device';
import { RemoteDevice } from '@/libs/network/RemoteDevice';
import * as storage from '@/libs/storage';

// Remote backend URL - change this to match your setup
const BACKEND_URL = `http://${window.location.hostname}:3000`;

// Create remote device instance
const remoteDevice = new RemoteDevice();

// Set it as the global device instance so all components can use it
setDevice(remoteDevice);

const App = () => {
  const { t } = useTranslation();
  const isBigScreen = useMediaQuery({ minWidth: 850 });

  const mouseStyle = useAtomValue(mouseStyleAtom);
  const videoScale = useAtomValue(videoScaleAtom);
  const videoState = useAtomValue(videoStateAtom);
  const serialState = useAtomValue(serialStateAtom);
  const isKeyboardEnable = useAtomValue(isKeyboardEnableAtom);
  const setResolution = useSetAtom(resolutionAtom);
  const setVideoState = useSetAtom(videoStateAtom);
  const setSerialState = useSetAtom(serialStateAtom);
  const [videoRotation, setVideoRotation] = useAtom(videoRotationAtom);

  const [isLoading, setIsLoading] = useState(true);
  const [isCameraAvailable, setIsCameraAvailable] = useState(false);
  const [shouldSwapDimensions, setShouldSwapDimensions] = useState(false);

  useEffect(() => {
    initResolution();
    initRotation();

    return () => {
      camera.close();
      remoteDevice.disconnect();
    };
  }, []);

  useEffect(() => {
    setShouldSwapDimensions(videoRotation === 90 || videoRotation === 270);
  }, [videoRotation]);

  function initResolution() {
    const resolution = storage.getVideoResolution();
    if (resolution) {
      setResolution(resolution);
    }

    connectToRemoteBackend();
  }

  function initRotation() {
    const rotation = storage.getVideoRotation();
    if (rotation) {
      setVideoRotation(rotation);
    }
  }

  async function connectToRemoteBackend() {
    try {
      console.log(`Connecting to remote backend: ${BACKEND_URL}`);

      // Connect to remote device
      await remoteDevice.connect(BACKEND_URL);

      // Register connection state change handler
      remoteDevice.onConnectionChange((connected) => {
        console.log(`WebSocket connection state changed: ${connected}`);
        setSerialState(connected ? 'connected' : 'disconnected');
      });

      // Open remote camera stream
      await camera.openRemote(remoteDevice.getMjpegUrl());

      // Set connection states to bypass DeviceModal
      setVideoState('connected');
      setSerialState('connected');

      setIsCameraAvailable(true);
      console.log('Connected to remote backend successfully');
    } catch (err: any) {
      console.error('Failed to connect to remote backend:', err);
      setIsCameraAvailable(false);
      setSerialState('disconnected');
    }

    setIsLoading(false);
  }

  if (isLoading) {
    return <Spin size="large" spinning={isLoading} tip={t('camera.tip')} fullscreen />;
  }

  if (!isCameraAvailable) {
    return (
      <Result
        status="info"
        title={t('camera.denied')}
        extra={[<h2 className="text-xl text-white">{t('camera.authorize')}</h2>]}
      />
    );
  }

  return (
    <>
      <DeviceModal />

      {videoState === 'connected' && (
        <>
          <Menu />

          {serialState === 'notSupported' && (
            <Alert message={t('serial.notSupported')} type="warning" banner closable />
          )}

          {serialState === 'disconnected' && (
            <Alert
              message="WebSocket Disconnected"
              description="Mouse and keyboard inputs are currently disabled. Attempting to reconnect..."
              type="error"
              banner
            />
          )}

          {serialState === 'connected' && (
            <>
              <Mouse />
              {isKeyboardEnable && <Keyboard />}
            </>
          )}
        </>
      )}

      <VideoCanvas
        mjpegUrl={camera.getMjpegUrl()}
        videoScale={videoScale}
        videoRotation={videoRotation}
        shouldSwapDimensions={shouldSwapDimensions}
        className={clsx(
          'block select-none',
          shouldSwapDimensions ? 'min-h-[640px] min-w-[360px]' : 'min-h-[360px] min-w-[640px]',
          mouseStyle
        )}
      />

      <VirtualKeyboard isBigScreen={isBigScreen} />
    </>
  );
};

export default App;

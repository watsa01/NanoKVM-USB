import { useEffect, useRef } from 'react';
import { message } from 'antd';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';

import { resolutionAtom } from '@/jotai/device.ts';
import { scrollDirectionAtom, scrollIntervalAtom } from '@/jotai/mouse.ts';
import { device } from '@/libs/device';
import { Key } from '@/libs/device/mouse.ts';
import { mouseJiggler } from '@/libs/mouse-jiggler';

export const Relative = () => {
  const { t } = useTranslation();
  const [messageApi, contextHolder] = message.useMessage();

  const resolution = useAtomValue(resolutionAtom);
  const scrollDirection = useAtomValue(scrollDirectionAtom);
  const scrollInterval = useAtomValue(scrollIntervalAtom);

  const isLockedRef = useRef(false);
  const keyRef = useRef<Key>(new Key());
  const lastScrollTimeRef = useRef(0);

  useEffect(() => {
    messageApi.open({
      key: 'relative',
      type: 'info',
      content: t('mouse.requestPointer'),
      duration: 3,
      style: {
        marginTop: '40vh'
      }
    });
  }, []);

  // listen mouse events
  useEffect(() => {
    let canvas: HTMLElement | null = null;

    function handlePointerLockChange() {
      isLockedRef.current = document.pointerLockElement === canvas;
    }

    function handleClick(event: any) {
      disableEvent(event);
      if (!isLockedRef.current) {
        canvas?.requestPointerLock();
      }
    }

    async function handleMouseDown(event: any) {
      disableEvent(event);

      switch (event.button) {
        case 0: keyRef.current.left = true; break;
        case 1: keyRef.current.mid = true; break;
        case 2: keyRef.current.right = true; break;
        default: return;
      }

      await send(0, 0, 0);
    }

    async function handleMouseUp(event: any) {
      disableEvent(event);

      switch (event.button) {
        case 0: keyRef.current.left = false; break;
        case 1: keyRef.current.mid = false; break;
        case 2: keyRef.current.right = false; break;
        default: return;
      }

      await send(0, 0, 0);
    }

    async function handleMouseMove(event: any) {
      disableEvent(event);

      let x =
        event.movementX ||
        event.mozMovementX ||
        event.webkitMovementX ||
        0;
      let y =
        event.movementY ||
        event.mozMovementY ||
        event.webkitMovementY ||
        0;

      if (x === 0 && y === 0) return;

      x = Math.abs(x) < 10 ? x * 2 : x;
      y = Math.abs(y) < 10 ? y * 2 : y;

      x = Math.max(-128, Math.min(127, x));
      y = Math.max(-128, Math.min(127, y));

      await send(x, y, 0);
      mouseJiggler.moveEventCallback();
    }

    async function handleWheel(event: any) {
      disableEvent(event);

      const now = Date.now();
      if (now - lastScrollTimeRef.current < scrollInterval) return;

      const delta = Math.floor(event.deltaY);
      if (delta === 0) return;

      await send(
        0,
        0,
        delta > 0 ? -scrollDirection : scrollDirection
      );

      lastScrollTimeRef.current = now;
    }

    function attachListeners() {
      if (!canvas) return;

      document.addEventListener('pointerlockchange', handlePointerLockChange);
      canvas.addEventListener('click', handleClick);
      canvas.addEventListener('mousedown', handleMouseDown);
      canvas.addEventListener('mouseup', handleMouseUp);
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('wheel', handleWheel);
      canvas.addEventListener('contextmenu', disableEvent);
    }

    function detachListeners() {
      if (!canvas) return;

      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('contextmenu', disableEvent);
    }

    const retry = setInterval(() => {
      canvas = document.getElementById('video');
      if (canvas) {
        clearInterval(retry);
        attachListeners();
      }
    }, 100);

    const timeout = setTimeout(() => clearInterval(retry), 3000);

    return () => {
      clearInterval(retry);
      clearTimeout(timeout);
      detachListeners();
    };
  }, [resolution, scrollDirection, scrollInterval]);


  async function send(x: number, y: number, scroll: number) {
    await device.sendMouseRelativeData(keyRef.current, x, y, scroll);
  }

  // disable default events
  function disableEvent(event: any) {
    event.preventDefault();
    event.stopPropagation();
  }

  return <>{contextHolder}</>;
};

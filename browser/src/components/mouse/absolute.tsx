import { useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';

import { resolutionAtom, videoRotationAtom } from '@/jotai/device.ts';
import { scrollDirectionAtom, scrollIntervalAtom } from '@/jotai/mouse.ts';
import { device } from '@/libs/device';
import { Key } from '@/libs/device/mouse.ts';
import { mouseJiggler } from '@/libs/mouse-jiggler';

export const Absolute = () => {
  const resolution = useAtomValue(resolutionAtom);
  const videoRotation = useAtomValue(videoRotationAtom);
  const scrollDirection = useAtomValue(scrollDirectionAtom);
  const scrollInterval = useAtomValue(scrollIntervalAtom);

  const keyRef = useRef<Key>(new Key());
  const lastScrollTimeRef = useRef(0);

  // listen mouse events
  useEffect(() => {
    let canvas: HTMLElement | null = null;

    async function handleMouseDown(event: any) {
      disableEvent(event);

      switch (event.button) {
        case 0: keyRef.current.left = true; break;
        case 1: keyRef.current.mid = true; break;
        case 2: keyRef.current.right = true; break;
        default: return;
      }

      await send(event);
    }

    async function handleMouseUp(event: any) {
      disableEvent(event);

      switch (event.button) {
        case 0: keyRef.current.left = false; break;
        case 1: keyRef.current.mid = false; break;
        case 2: keyRef.current.right = false; break;
        default: return;
      }

      await send(event);
    }

    async function handleMouseMove(event: any) {
      disableEvent(event);
      await send(event);
      mouseJiggler.moveEventCallback();
    }

    async function handleWheel(event: any) {
      disableEvent(event);

      const now = Date.now();
      if (now - lastScrollTimeRef.current < scrollInterval) return;

      const delta = Math.floor(event.deltaY);
      if (delta === 0) return;

      await send(event, delta > 0 ? -scrollDirection : scrollDirection);
      lastScrollTimeRef.current = now;
    }

    async function send(event: MouseEvent, scroll = 0) {
      if (!canvas) return;
      const { x, y } = getCorrectedCoords(event.clientX, event.clientY);
      await device.sendMouseAbsoluteData(keyRef.current, 1, 1, x, y, scroll);
    }

    function attachListeners() {
      if (!canvas) return;

      canvas.addEventListener('mousedown', handleMouseDown);
      canvas.addEventListener('mouseup', handleMouseUp);
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('wheel', handleWheel);
      canvas.addEventListener('click', disableEvent);
      canvas.addEventListener('contextmenu', disableEvent);
    }

    function detachListeners() {
      if (!canvas) return;

      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('click', disableEvent);
      canvas.removeEventListener('contextmenu', disableEvent);
    }

    const retryInterval = setInterval(() => {
      canvas = document.getElementById('video');
      if (canvas) {
        clearInterval(retryInterval);
        attachListeners();
      }
    }, 100);

    const timeout = setTimeout(() => clearInterval(retryInterval), 3000);

    return () => {
      clearInterval(retryInterval);
      clearTimeout(timeout);
      detachListeners();
    };
  }, [resolution, scrollDirection, scrollInterval, videoRotation]);


  // disable default events
  function disableEvent(event: any) {
    event.preventDefault();
    event.stopPropagation();
  }

  return <></>;
};

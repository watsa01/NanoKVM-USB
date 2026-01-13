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

  useEffect(() => {
    let canvas: HTMLElement | null = null;

    // -------------------------
    // Helpers
    // -------------------------

    function disableEvent(event: any) {
      event.preventDefault();
      event.stopPropagation();
    }

    function getCorrectedCoords(clientX: number, clientY: number) {
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      const video = canvas as HTMLVideoElement;

      const videoWidth = video.videoWidth || 1920;
      const videoHeight = video.videoHeight || 1080;

      const screenRatio =
        videoRotation === 90 || videoRotation === 270
          ? videoHeight / videoWidth
          : videoWidth / videoHeight;

      const containerRatio = rect.width / rect.height;

      let renderedWidth: number;
      let renderedHeight: number;

      if (screenRatio > containerRatio) {
        renderedWidth = rect.width;
        renderedHeight = rect.width / screenRatio;
      } else {
        renderedHeight = rect.height;
        renderedWidth = rect.height * screenRatio;
      }

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const relX = clientX - centerX;
      const relY = clientY - centerY;

      let x = relX / renderedWidth + 0.5;
      let y = relY / renderedHeight + 0.5;

      x = Math.max(0, Math.min(1, x));
      y = Math.max(0, Math.min(1, y));

      return { x, y };
    }

    async function send(event: MouseEvent, scroll = 0) {
      if (!canvas) return;
      const { x, y } = getCorrectedCoords(event.clientX, event.clientY);
      await device.sendMouseAbsoluteData(
        keyRef.current,
        1,
        1,
        x,
        y,
        scroll
      );
    }

    // -------------------------
    // Event handlers
    // -------------------------

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

      await send(
        event,
        delta > 0 ? -scrollDirection : scrollDirection
      );

      lastScrollTimeRef.current = now;
    }

    // -------------------------
    // Attach / detach
    // -------------------------

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

    // -------------------------
    // Canvas lookup retry
    // -------------------------

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
  }, [resolution, videoRotation, scrollDirection, scrollInterval]);

  return null;
};

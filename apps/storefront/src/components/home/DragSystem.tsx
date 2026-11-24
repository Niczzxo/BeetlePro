'use client';

/* Cursor drag for the home rails, a faithful port of the legacy
   makeDraggable() system: over the offer track, the fresh-picks
   rail and the "Everything in this outfit" strip, the native cursor
   is replaced by the black round Drag badge (#dragBadge, rendered
   by the root layout) that follows the mouse with a short lag.
   Pressing and dragging scrolls the track 1:1; releasing with speed
   glides on with decaying momentum, then scroll-snap settles it.
   A press that moved more than 8px is a drag, not a click. Mouse
   AND touch are dragged in JS; the track CSS keeps
   touch-action:pan-y so vertical finger moves still scroll the
   page. All constants below are the legacy values. */

import { useEffect } from 'react';

const TRACK_IDS = ['offerTrack', 'pickRail', 'roomItems'];

export default function DragSystem() {
  useEffect(() => {
    const badge = document.getElementById('dragBadge');
    if (!badge) return;
    const fine = window.matchMedia('(pointer:fine)');
    let bx = 0,
      by = 0,
      tx = 0,
      ty = 0,
      bs = 0,
      ts = 0,
      raf = 0;

    function loop() {
      bx += (tx - bx) * 0.35;
      by += (ty - by) * 0.35;
      bs += (ts - bs) * 0.28;
      badge!.style.transform =
        'translate(' + bx + 'px,' + by + 'px) translate(-50%,-50%) scale(' + bs.toFixed(3) + ')';
      badge!.style.opacity = bs > 0.02 ? '1' : '0';
      if (Math.abs(tx - bx) > 0.5 || Math.abs(ty - by) > 0.5 || Math.abs(ts - bs) > 0.01)
        raf = requestAnimationFrame(loop);
      else raf = 0;
    }
    function wake() {
      if (!raf) raf = requestAnimationFrame(loop);
    }

    const cleanups: (() => void)[] = [];
    function listen(
      el: HTMLElement,
      type: string,
      fn: (e: never) => void,
      opts?: AddEventListenerOptions | boolean,
    ) {
      el.addEventListener(type, fn as EventListener, opts);
      cleanups.push(() => el.removeEventListener(type, fn as EventListener, opts));
    }

    function makeDraggable(track: HTMLElement) {
      track.classList.add('dragtrack');
      let down = false,
        startX = 0,
        startL = 0,
        moved = 0,
        vel = 0,
        lastX = 0,
        lastT = 0,
        mom = 0;
      listen(track, 'dragstart', (e: Event) => e.preventDefault());
      listen(track, 'pointerdown', (e: PointerEvent) => {
        if (e.button !== undefined && e.button !== 0) return;
        down = true;
        moved = 0;
        vel = 0;
        startX = lastX = e.clientX;
        lastT = performance.now();
        startL = track.scrollLeft;
        if (mom) {
          cancelAnimationFrame(mom);
          mom = 0;
        }
        track.classList.add('dragging');
        if (e.pointerType === 'mouse') e.preventDefault();
        try {
          track.setPointerCapture(e.pointerId);
        } catch (err) {
          /* capture is best-effort, as in the legacy */
        }
      });
      listen(track, 'pointermove', (e: PointerEvent) => {
        if (fine.matches) {
          tx = e.clientX;
          ty = e.clientY;
          ts = 1;
          wake();
        }
        if (!down) return;
        const dx = e.clientX - startX;
        if (Math.abs(dx) > moved) moved = Math.abs(dx);
        track.scrollLeft = startL - dx;
        const now = performance.now(),
          dt = now - lastT;
        if (dt > 0) {
          vel = vel * 0.65 + ((lastX - e.clientX) / dt) * 16 * 0.35;
          lastX = e.clientX;
          lastT = now;
        }
      });
      function end(cancelled: boolean) {
        if (!down) return;
        down = false;
        if (cancelled) vel = 0;
        (function glide() {
          if (Math.abs(vel) > 0.4) {
            track.scrollLeft += vel;
            vel *= 0.94;
            mom = requestAnimationFrame(glide);
          } else {
            mom = 0;
            track.classList.remove('dragging');
          }
        })();
      }
      listen(track, 'pointerup', () => end(false));
      listen(track, 'pointercancel', () => end(true));
      listen(
        track,
        'click',
        (e: MouseEvent) => {
          /* 16px of slop, not 8: a fingertip trembles several px during
             an ordinary tap, and at 8px taps on rail cards were eaten
             as drags, so the section's buttons felt dead. A deliberate
             drag travels far past 16px before release. */
          if (moved > 16) {
            e.preventDefault();
            e.stopPropagation();
            moved = 0;
          }
        },
        true,
      );
      if (fine.matches) {
        listen(track, 'pointerenter', (e: PointerEvent) => {
          tx = bx = e.clientX;
          ty = by = e.clientY;
          ts = 1;
          wake();
        });
        listen(track, 'pointerleave', () => {
          if (!down) {
            ts = 0;
            wake();
          }
        });
      }
      cleanups.push(() => track.classList.remove('dragtrack'));
    }

    TRACK_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) makeDraggable(el);
    });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}

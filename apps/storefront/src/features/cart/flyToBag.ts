'use client';

/* Fly-to-bag, a faithful port of the legacy flyToBag() and its
   helpers (bumpBag(), flyBezierY() and the PLANE_SVG constant),
   which the legacy itself reproduced from the fly-to-cart
   concept file. The effect: the product photo pops out, folds
   along its centre crease into a paper plane, the plane turns to
   the direction of travel and follows a 900ms eased quadratic
   arc to the header bag button while a dotted trail draws the
   travelled part of the same curve; on landing the bag bumps,
   a ring pulses out of the bag button, and only then does the
   caller's onLand commit the item. All timings, keyframes,
   easings and geometry below are the legacy values, unchanged:
   pop 140ms, fold 280ms, plane reveal 200ms starting 120ms
   before the flight, 46 flight frames over 900ms, arc height
   150, trail fade 320ms, landing ring 400ms.

   The one legacy adaptation kept: the plane's paper tones and
   the trail/ring colours are tints of DOSTELO's two colours
   (off-white #F4F2ED, warm black #1C1B17), via the legacy CSS
   classes (.flyer, .flyer-paper, .flyer-half, .flyer-face,
   .flyer-crease, .flyer-shadow, .flyer-plane, .flyer-trail,
   .flyer-ring), which are ported in styles/legacy.css. */

/** The legacy bumpBag(): the header bag button squashes and
    settles; a gentler single scale under reduced motion. */
export function bumpBag(): void {
  const el = document.getElementById('bagBtn');
  if (!el || !el.animate) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.animate(
    [
      { transform: 'scale(1)' },
      { transform: reduced ? 'scale(1.04)' : 'scale(1.25,.85)' },
      { transform: 'scale(.92,1.08)' },
      { transform: 'scale(1)' },
    ],
    { duration: reduced ? 200 : 380 },
  );
}

const PLANE_SVG =
  '<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false"><g transform="rotate(36 60 60)"><path d="M107 24L18 52l36 12z" fill="#FDFBF6" stroke="#837E72" stroke-width=".9"/><path d="M107 24L54 64l-10 44z" fill="#E7E2D4" stroke="#837E72" stroke-width=".9"/><path d="M107 24L44 108l-6-36z" fill="#CFC9BA" stroke="#837E72" stroke-width=".9"/><path d="M107 24L54 64" fill="none" stroke="#6E685C" stroke-width="1.2"/><path d="M54 64l-10 44" fill="none" stroke="#fff" stroke-width=".7" opacity=".7"/></g></svg>';

/** The legacy flyBezierY(): solve the flight easing
    cubic-bezier(.2,.65,.35,1) for the curve parameter at
    progress x (Newton iterations), then read its y. The trail
    sync uses it so the dotted path tracks the plane's eased
    position, not linear time. */
function flyBezierY(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let t = x;
  for (let i = 0; i < 6; i++) {
    const u = 1 - t;
    const bx = 3 * u * u * t * 0.2 + 3 * u * t * t * 0.35 + t * t * t;
    const dbx = 3 * u * u * 0.2 + 6 * u * t * 0.15 + 3 * t * t * 0.65;
    if (Math.abs(dbx) < 1e-6) break;
    t = Math.max(0, Math.min(1, t - (bx - x) / dbx));
  }
  const u2 = 1 - t;
  return 3 * u2 * u2 * t * 0.65 + 3 * u2 * t * t + t * t * t;
}

/** The legacy flyToBag(sourceEl, onLand): fly a clone of the
    source photo to the header bag button; onLand runs exactly
    at landing, never before. With no usable source or target,
    or under reduced motion, it lands immediately (the caller
    handles the reduced-motion bump itself, as the legacy
    addToBag did; the in-flight reduced check below is the
    legacy's own second guard). */
export function flyToBag(sourceEl: HTMLElement | null, onLand: () => void): void {
  const cartEl = document.getElementById('bagBtn');
  const duration = 900;
  const arcHeight = 150;
  const trail = true;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!sourceEl || !cartEl) {
    onLand();
    return;
  }
  const a = sourceEl.getBoundingClientRect();
  const b = cartEl.getBoundingClientRect();
  if (!a.width || !b.width) {
    onLand();
    return;
  }
  const x = b.left + b.width / 2 - a.left - a.width / 2;
  const y = b.top + b.height / 2 - a.top - a.height / 2;
  if (reduced) {
    bumpBag();
    onLand();
    return;
  }
  const sx = a.left + a.width / 2;
  const sy = a.top + a.height / 2;
  const ex = sx + x;
  const ey = sy + y;
  const cx = (sx + ex) / 2;
  const cy = (sy + ey) / 2 - 2 * arcHeight;
  const angle0 = (Math.atan2(y - 4 * arcHeight, x) * 180) / Math.PI;
  const pop = 140;
  const fold = 280;
  const flightStart = pop + fold;
  const reveal = 200;
  const flyer = document.createElement('div');
  flyer.className = 'flyer';
  flyer.style.left = a.left + 'px';
  flyer.style.top = a.top + 'px';
  flyer.style.width = a.width + 'px';
  flyer.style.height = a.height + 'px';
  flyer.setAttribute('aria-hidden', 'true');
  const shadow = document.createElement('div');
  shadow.className = 'flyer-shadow';
  const paper = document.createElement('div');
  paper.className = 'flyer-paper';
  const left = document.createElement('div');
  left.className = 'flyer-half left';
  const right = document.createElement('div');
  right.className = 'flyer-half right';
  const face = sourceEl.cloneNode(true) as HTMLElement;
  face.classList.add('flyer-face');
  face.removeAttribute('id');
  face.removeAttribute('role');
  face.removeAttribute('aria-label');
  (face as HTMLImageElement).alt = '';
  const face2 = face.cloneNode(true) as HTMLElement;
  left.appendChild(face);
  right.appendChild(face2);
  const crease = document.createElement('div');
  crease.className = 'flyer-crease';
  paper.appendChild(left);
  paper.appendChild(right);
  paper.appendChild(crease);
  const plane = document.createElement('div');
  plane.className = 'flyer-plane';
  plane.innerHTML = PLANE_SVG;
  flyer.appendChild(shadow);
  flyer.appendChild(paper);
  flyer.appendChild(plane);
  document.body.appendChild(flyer);
  /* Pop the photo out, then fold its two halves away along the centre crease. */
  paper.animate(
    [
      { transform: 'translateY(0) scale(1) rotate(0deg)' },
      { transform: 'translateY(-4%) scale(1.045) rotate(-.8deg)', offset: 0.7 },
      { transform: 'translateY(-3.6%) scale(1.04) rotate(-.7deg)' },
    ],
    { duration: pop + 40, easing: 'cubic-bezier(.2,.75,.3,1)', fill: 'forwards' },
  );
  const foldEase = 'cubic-bezier(.6,.04,.25,1)';
  const leftFold = left.animate(
    [
      { transform: 'rotateY(0deg)', opacity: 1 },
      { transform: 'rotateY(-64deg)', opacity: 1, offset: 0.78 },
      { transform: 'rotateY(-82deg)', opacity: 0 },
    ],
    { duration: fold, delay: pop, easing: foldEase, fill: 'forwards' },
  );
  const rightFold = right.animate(
    [
      { transform: 'rotateY(0deg)', opacity: 1 },
      { transform: 'rotateY(64deg)', opacity: 1, offset: 0.78 },
      { transform: 'rotateY(82deg)', opacity: 0 },
    ],
    { duration: fold, delay: pop, easing: foldEase, fill: 'forwards' },
  );
  Promise.all([leftFold.finished, rightFold.finished])
    .then(function () {
      paper.style.display = 'none';
    })
    .catch(function () {});
  crease.animate(
    [
      { opacity: 0, transform: 'scaleY(.15)' },
      { opacity: 0.85, transform: 'scaleY(1)', offset: 0.55 },
      { opacity: 0, transform: 'scaleY(1)' },
    ],
    { duration: fold, delay: pop, easing: 'ease-in-out' },
  );
  shadow.animate(
    [
      { opacity: 0, transform: 'scale(.65)' },
      { opacity: 0.48, transform: 'scale(1)', offset: 0.3 },
      { opacity: 0.28, transform: 'scale(.9)', offset: 0.7 },
      { opacity: 0, transform: 'scale(.5)' },
    ],
    { duration: pop + fold, easing: 'ease-out', fill: 'forwards' },
  );
  /* The plane unfolds from the crease and turns to the direction of travel before launch. */
  plane.animate(
    [
      { opacity: 0, transform: 'rotate(0deg) scale(.04,.65)' },
      { opacity: 1, transform: 'rotate(' + (angle0 + 3) + 'deg) scale(1.06,.98)', offset: 0.55 },
      { opacity: 1, transform: 'rotate(' + (angle0 - 1) + 'deg) scale(.97,1.02)', offset: 0.8 },
      { opacity: 1, transform: 'rotate(' + angle0 + 'deg) scale(1)' },
    ],
    { duration: reveal, delay: flightStart - 120, easing: 'cubic-bezier(.2,.8,.25,1)', fill: 'forwards' },
  );
  const frames: Keyframe[] = [];
  for (let fi = 0; fi < 46; fi++) {
    const t = fi / 45;
    const angle = (Math.atan2(y - 4 * arcHeight * (1 - 2 * t), x) * 180) / Math.PI;
    frames.push({
      transform:
        'translate(' +
        x * t +
        'px,' +
        (y * t - 4 * arcHeight * t * (1 - t)) +
        'px) scale(' +
        (1 - 0.84 * t) +
        ') rotate(' +
        (angle - angle0) +
        'deg)',
      opacity: t > 0.94 ? 1 - (t - 0.94) / 0.06 : 1,
    });
  }
  const flight = flyer.animate(frames, {
    duration: duration,
    delay: flightStart,
    easing: 'cubic-bezier(.2,.65,.35,1)',
    fill: 'forwards',
  });
  /* Dotted trail: draw only the travelled part of the same quadratic curve. */
  let trailSvg: SVGSVGElement | null = null;
  let trailPath: SVGPathElement | null = null;
  let raf = 0;
  let done = false;
  if (trail) {
    trailSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    trailSvg.setAttribute('class', 'flyer-trail');
    trailSvg.setAttribute('aria-hidden', 'true');
    trailPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trailSvg.appendChild(trailPath);
    document.body.appendChild(trailSvg);
  }
  function drawTrail(t: number) {
    if (!trailPath) return;
    const q = Math.max(0, Math.min(1, t));
    const u = 1 - q;
    const px = u * u * sx + 2 * u * q * cx + q * q * ex;
    const py = u * u * sy + 2 * u * q * cy + q * q * ey;
    trailPath.setAttribute(
      'd',
      'M' + sx + ' ' + sy + 'Q' + (sx + q * (cx - sx)) + ' ' + (sy + q * (cy - sy)) + ' ' + px + ' ' + py,
    );
  }
  function sync() {
    if (done) return;
    const local = Math.max(0, Math.min(duration, ((flight.currentTime as number | null) || 0) - flightStart));
    const pr = local / duration;
    const pathT = flyBezierY(pr);
    drawTrail(pathT);
    if (trailSvg) trailSvg.style.opacity = String(Math.min(1, pr * 12));
    raf = requestAnimationFrame(sync);
  }
  if (trailSvg) raf = requestAnimationFrame(sync);
  function retarget() {
    /* Scroll/resize mid-flight: drop the trail only. The flight must run to
       its natural end - finishing it early would commit the bag count while
       the plane is still in the air. The bag sits in the sticky header, so
       its viewport position (the flight target) is stable under scroll. */
    if (trailSvg) {
      trailSvg.remove();
      trailSvg = null;
      trailPath = null;
    }
  }
  window.addEventListener('resize', retarget);
  window.addEventListener('scroll', retarget, true);
  let landed = false;
  function land() {
    if (landed) return;
    landed = true;
    bumpBag();
    const r = cartEl!.getBoundingClientRect();
    const ring = document.createElement('i');
    ring.className = 'flyer-ring';
    ring.style.left = r.left + 'px';
    ring.style.top = r.top + 'px';
    ring.style.width = r.width + 'px';
    ring.style.height = r.height + 'px';
    document.body.appendChild(ring);
    const ra = ring.animate(
      [
        { transform: 'scale(.6)', opacity: 0.6 },
        { transform: 'scale(1.7)', opacity: 0 },
      ],
      { duration: 400 },
    );
    if (ra && ra.finished)
      ra.finished
        .then(function () {
          ring.remove();
        })
        .catch(function () {
          ring.remove();
        });
    onLand();
  }
  flight.finished
    .then(function () {
      done = true;
      if (raf) cancelAnimationFrame(raf);
      const fading = trailSvg;
      trailSvg = null;
      trailPath = null;
      if (fading) {
        const fa = fading.animate([{ opacity: '1' }, { opacity: '0' }], {
          duration: 320,
          easing: 'ease-out',
          fill: 'forwards',
        });
        if (fa && fa.finished) fa.finished.finally(function () {
          fading.remove();
        });
        else fading.remove();
      }
      land();
    })
    .catch(function () {
      land();
    })
    .finally(function () {
      done = true;
      if (raf) cancelAnimationFrame(raf);
      flyer.remove();
      if (trailSvg) trailSvg.remove();
      window.removeEventListener('resize', retarget);
      window.removeEventListener('scroll', retarget, true);
    });
}

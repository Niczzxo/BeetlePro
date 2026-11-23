'use client';

/* Scroll reveals, a faithful port of the legacy reveal system (the
   reference's Framer whileInView behaviour): an IntersectionObserver
   fires ONCE when enough of the element is visible (section heads
   0.3, most blocks 0.15), adds .in, and unobserves. The amount is
   measured against the SMALLER of the element's height and the
   viewport height, so a section taller than the screen can still
   trigger. Only transform/opacity animate in the legacy CSS, with
   the final layout space reserved from the start. The two-stage
   safety net is the legacy's own: at 450ms reveal whatever is
   within two and a half screens, at 900ms reveal the rest, so
   content is never stranded invisible in a no-scroll render. */

import { useEffect } from 'react';

const REVEAL_SEL = '.reveal:not(.in), .reveal-zoom:not(.in), .reveal-look:not(.in), .reveal-pop:not(.in)';

export default function RevealSystem() {
  useEffect(() => {
    let revealIO: IntersectionObserver | null = null;

    function revealCallback(entries: IntersectionObserverEntry[]) {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target as HTMLElement;
        const elH = el.getBoundingClientRect().height || 1;
        const need =
          (el.classList.contains('sec-head') ? 0.3 : 0.15) * Math.min(elH, window.innerHeight || elH);
        if (en.intersectionRect.height >= need - 1) {
          el.classList.add('in');
          if (revealIO) revealIO.unobserve(el);
        }
      });
    }

    function observeReveals() {
      if (!('IntersectionObserver' in window)) {
        document.querySelectorAll(REVEAL_SEL).forEach((el) => el.classList.add('in'));
        return;
      }
      if (!revealIO) {
        revealIO = new IntersectionObserver(revealCallback, {
          threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.65, 0.8, 1],
        });
      }
      document.querySelectorAll(REVEAL_SEL).forEach((el) => revealIO!.observe(el));
    }

    function revealSweep(all: boolean) {
      const limit = window.scrollY + window.innerHeight * 2.5;
      document.querySelectorAll(REVEAL_SEL).forEach((el) => {
        if (all || (el as HTMLElement).getBoundingClientRect().top + window.scrollY <= limit) {
          el.classList.add('in');
          if (revealIO) revealIO.unobserve(el);
        }
      });
    }

    observeReveals();
    const t1 = setTimeout(() => revealSweep(false), 450);
    const t2 = setTimeout(() => revealSweep(true), 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (revealIO) revealIO.disconnect();
    };
  }, []);

  return null;
}

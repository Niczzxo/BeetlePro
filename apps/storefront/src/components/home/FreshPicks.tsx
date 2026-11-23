'use client';

/* Fresh picks rail, ported from the legacy renderer: pick cards
   from the picks data (with the product's second gallery photo as
   the hover crossfade where it differs), arrows scroll by 55% of
   the rail width, and the progress bar follows the legacy formula
   (25% at rest, growing to 100% at the end of the rail). The rail
   is cursor-draggable via DragSystem, as in the legacy. */

import { useEffect, useRef } from 'react';
import { byId, type StorefrontPick } from '../../data/products';
import { money } from '../../lib/format';
import { ArrowLeft, ArrowRight } from '../icons';

export default function FreshPicks({ picks }: { picks: StorefrontPick[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const progRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    const prog = progRef.current;
    if (!rail || !prog) return;
    const onScroll = () => {
      const max = rail.scrollWidth - rail.clientWidth;
      const pct = max > 0 ? 25 + (rail.scrollLeft / max) * 75 : 100;
      prog.style.width = pct + '%';
    };
    rail.addEventListener('scroll', onScroll, { passive: true });
    return () => rail.removeEventListener('scroll', onScroll);
  }, []);

  function railBy(dir: number) {
    const rail = railRef.current;
    if (rail) rail.scrollBy({ left: dir * (rail.clientWidth * 0.55), behavior: 'smooth' });
  }

  return (
    <section className="wrap">
      <div className="sec-head reveal">
        <h2>DOSTELO fresh picks</h2>
        <button className="btn sm" data-nav="shop">
          View all
        </button>
      </div>
      <div className="rail reveal" id="pickRail" ref={railRef}>
        {picks.map((k) => {
          const p = byId(k.pid);
          const alt = p && p.gallery && p.gallery.length > 1 && p.gallery[1] !== k.img ? p.gallery[1] : null;
          return (
            <button className="pick" data-product={k.pid} key={k.pid}>
              <span className="ph" style={{ display: 'block' }}>
                <img src={k.img} alt={k.name} loading="lazy" decoding="async" />
                {alt ? <img className="alt" src={alt} alt="" aria-hidden="true" loading="lazy" decoding="async" /> : null}
              </span>
              <span className="meta">
                <span className="cat">{k.cat}</span>
                <span className="pr">{money(k.price)}</span>
              </span>
              <h3>{k.name}</h3>
            </button>
          );
        })}
      </div>
      <div className="pick-ctrl">
        <div className="progress">
          <i id="pickProg" style={{ width: '25%' }} ref={progRef}></i>
        </div>
        <div className="arrows">
          <button className="arrow" id="pickPrev" aria-label="Scroll fresh picks back" onClick={() => railBy(-1)}>
            <ArrowLeft />
          </button>
          <button className="arrow solid" id="pickNext" aria-label="Scroll fresh picks forward" onClick={() => railBy(1)}>
            <ArrowRight />
          </button>
        </div>
      </div>
    </section>
  );
}

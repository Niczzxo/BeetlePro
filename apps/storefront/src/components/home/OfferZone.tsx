'use client';

/* Offer zone, ported from the legacy markup and renderOffers():
   offer cards rendered from the offers data, arrow buttons scroll
   the track by one track width with smooth behaviour. The track
   itself is cursor-draggable via DragSystem, as in the legacy.
   Clicking a card keeps its data-offer category attribute; the
   shop view it navigated to is a later migration step. */

import { useRef } from 'react';
import type { StorefrontOffer } from '../../data/products';
import { ArrowLeft, ArrowRight } from '../icons';

export default function OfferZone({ offers }: { offers: StorefrontOffer[] }) {
  const trackRef = useRef<HTMLDivElement>(null);

  function offerScroll(dir: number) {
    const track = trackRef.current;
    if (track) track.scrollBy({ left: dir * track.clientWidth, behavior: 'smooth' });
  }

  return (
    <section className="wrap offers">
      <div className="sec-head reveal">
        <h2>Offer zone</h2>
        <div className="arrows">
          <button className="arrow" id="offerPrev" aria-label="Previous offers" onClick={() => offerScroll(-1)}>
            <ArrowLeft />
          </button>
          <button className="arrow solid" id="offerNext" aria-label="Next offers" onClick={() => offerScroll(1)}>
            <ArrowRight />
          </button>
        </div>
      </div>
      <div className="offer-track reveal" id="offerTrack" ref={trackRef}>
        {offers.map((o) => (
          <button className="offer" data-offer={o.cat} key={o.title}>
            <img src={o.img} alt={o.alt} loading="lazy" decoding="async" />
            <span className="oc">
              <h3>{o.title}</h3>
              <p>{o.sub}</p>
              <span className="btn light sm">Shop now</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

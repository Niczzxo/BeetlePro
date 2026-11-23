'use client';

/* Shop the look, ported from the legacy markup: the outfit photo
   with hotspot buttons (each carrying the hover preview card the
   legacy script builds: thumbnail, name, price, View) and the
   "Everything in this outfit" strip rendered from the room data.
   Clicking a hotspot keeps the legacy selection behaviour (the
   hotspot and its strip item gain .on); the product page it then
   navigated to is a later migration step. The strip is
   cursor-draggable via DragSystem, as in the legacy. */

import { byId, type RoomItem } from '../../data/products';
import { money } from '../../lib/format';

const HOTSPOTS = [
  { pid: 'belt-leather', left: '14%', top: '20%', delay: '.05s' },
  { pid: 'tee-basic', left: '56%', top: '34%', delay: '.15s' },
  { pid: 'check-shirt', left: '74%', top: '52%', delay: '.25s' },
  { pid: 'jeans-slim', left: '22%', top: '58%', delay: '.35s' },
  { pid: 'jeans-straight', left: '44%', top: '78%', delay: '.45s' },
];

export default function ShopTheLook({ room }: { room: RoomItem[] }) {
  function selectHot(pid: string, el: HTMLElement) {
    document.querySelectorAll('.hot').forEach((x) => x.classList.toggle('on', x === el));
    document
      .querySelectorAll('#roomItems .ritem')
      .forEach((x) => x.classList.toggle('on', x.getAttribute('data-hot-item') === pid));
  }

  return (
    <section className="wrap" id="look-sec">
      <div className="sec-head reveal">
        <div>
          <div className="eyebrow">Shop the look</div>
          <h2>The weekend outfit</h2>
        </div>
        <button className="btn sm" data-nav="shop">
          Shop all clothing
        </button>
      </div>
      <div className="look reveal-look">
        <img
          src="/images/jeans-slim-alt.jpg"
          alt="Weekend outfit flat lay - denim overshirt, white tee, jeans and a leather belt"
          loading="lazy"
          decoding="async"
        />
        {HOTSPOTS.map((h) => {
          const p = byId(h.pid);
          if (!p) return null;
          return (
            <button
              className="hot reveal-pop"
              style={{ left: h.left, top: h.top, transitionDelay: h.delay }}
              data-hot={h.pid}
              aria-label={p.name}
              key={h.pid}
              onClick={(e) => selectHot(h.pid, e.currentTarget)}
            >
              <span className="hotcard" aria-hidden="true">
                <img src={p.img} alt="" loading="lazy" decoding="async" />
                <span>
                  <b>{p.name}</b>
                  <span>{money(p.price)}</span>
                </span>
                <span className="vw">View &rarr;</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="room-strip reveal">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14 }}>
          <h3>Everything in this outfit</h3>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>5 pieces</span>
        </div>
        <div className="room-items" id="roomItems">
          {room.map((r) => {
            const p = byId(r.pid);
            if (!p) return null;
            return (
              <button className="ritem" data-hot-item={r.pid} data-product={r.pid} key={r.pid}>
                <img src={p.img} alt={r.label} loading="lazy" decoding="async" />
                <span>
                  <b>{r.label}</b>
                  <span>
                    From <b>{money(r.from)}</b>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

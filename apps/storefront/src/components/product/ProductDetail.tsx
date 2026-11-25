'use client';

/* Product view, a port of the legacy #view-product markup,
   openProduct(), pdShow(), selectColour() and the product image
   zoom IIFE:

   - the main photo swaps with the legacy crossfade (preload,
     fade out, swap at 170ms, fade in) whenever a thumbnail or a
     colour variant selects another photo;
   - colour swatches ring the active variant, update the
     "Colour -" label and show that variant's photo; a thumbnail
     that IS a variant's photo selects that colour too;
   - the size defaults to the legacy default (the second size),
     the label reads "Waist size -" for Pants, Jeans and Belts
     and "Size - One size" for one-size pieces;
   - the quantity stepper caps at the smaller of 9 and stock;
   - Add to bag carries the chosen colour and size into the bag
     the live site's current way: the commit lands at tap time,
     and the main photo (#pdImg) then folds into the paper plane
     and flies to the bag as decoration (CartProvider's
     addWithFly); the button keeps the legacy label with the
     price);
   - hover on the main photo magnifies it inside its frame with
     the zoom centre following the cursor, and a click opens the
     full-screen zoom box with click/wheel zoom and drag pan,
     exactly as the legacy IIFE behaves.

   The wishlist button runs the legacy toggleWish() and reads
   "Saved to wishlist" while the piece is saved, as the legacy
   pdShow() and its click handler set it. The policy links under
   it (data-nav) route to the /policies pages. */

import { useEffect, useRef, useState } from 'react';
import type { StorefrontProduct } from '../../data/products';
import { money } from '../../lib/format';
import { defaultSize, pvars, useCart } from '../../features/cart/CartProvider';
import { useWishlist } from '../../features/wishlist/WishlistProvider';
import { useScrollLock } from '../../features/scrollLock';
import ProductCard from '../home/ProductCard';
import RevealSystem from '../home/RevealSystem';

function sizeLabel(p: StorefrontProduct, curSize: string): string {
  if (p.sizes[0] === 'One size') return 'Size - One size';
  return (p.cat === 'Pants' || p.cat === 'Jeans' || p.cat === 'Belts' ? 'Waist size - ' : 'Size - ') + curSize;
}

export default function ProductDetail({
  product: p,
  related,
}: {
  product: StorefrontProduct;
  related: StorefrontProduct[];
}) {
  const { addWithFly } = useCart();
  const { wished, toggleWish } = useWishlist();
  const vars = pvars(p);

  const [src, setSrc] = useState(p.gallery[0]);
  const [opacity, setOpacity] = useState(1);
  const [activeThumb, setActiveThumb] = useState(0);
  const [curSw, setCurSw] = useState(0);
  const [curSize, setCurSize] = useState(defaultSize(p));
  const [qty, setQty] = useState(1);
  const [zbOpen, setZbOpen] = useState(false);

  const srcRef = useRef(p.gallery[0]);
  const fadeTimer = useRef<number | undefined>(undefined);
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const zbRef = useRef<HTMLDivElement>(null);
  const zbImgRef = useRef<HTMLImageElement>(null);
  const zoom = useRef({ scale: 1, px: 0, py: 0, panning: false, psx: 0, psy: 0, pMoved: false });

  useEffect(() => {
    return () => {
      if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    };
  }, []);

  /* The legacy pdShow(): preload, fade out, swap at 170ms. */
  function pdShow(next: string) {
    if (srcRef.current === next) return;
    const pre = new Image();
    pre.onload = () => {
      setOpacity(0);
      fadeTimer.current = window.setTimeout(() => {
        srcRef.current = next;
        setSrc(next);
        setOpacity(1);
      }, 170);
    };
    pre.onerror = () => {
      srcRef.current = next;
      setSrc(next);
    };
    pre.src = next;
  }

  /* The legacy selectColour(). */
  function selectColour(i: number) {
    const idx = Math.max(0, Math.min(i, vars.length - 1));
    setCurSw(idx);
    pdShow(vars[idx][2]);
    const gi = p.gallery.indexOf(vars[idx][2]);
    if (gi >= 0) setActiveThumb(gi);
  }

  function pickThumb(i: number) {
    const g = p.gallery[i];
    pdShow(g);
    setActiveThumb(i);
    /* A thumbnail that IS a colour variant's photo also selects
       that colour (the legacy #pdThumbs handler). */
    for (let vi = 0; vi < vars.length; vi++) {
      if (vars[vi][2] === g) {
        setCurSw(vi);
        break;
      }
    }
  }

  /* ---- zoom box (the legacy zoom IIFE) ---- */
  function zbApply() {
    const zimg = zbImgRef.current;
    if (!zimg) return;
    const z = zoom.current;
    zimg.style.transform = 'translate(' + z.px + 'px,' + z.py + 'px) scale(' + z.scale + ')';
    zimg.classList.toggle('zoomed', z.scale > 1);
  }
  function openZoom() {
    const zimg = zbImgRef.current;
    if (!zimg) return;
    zimg.src = srcRef.current;
    zoom.current.scale = 1;
    zoom.current.px = 0;
    zoom.current.py = 0;
    zbApply();
    setZbOpen(true);
  }
  function closeZoom() {
    setZbOpen(false);
  }

  /* The legacy wheel zoom is a non-passive listener so the page
     does not scroll under the zoom box. */
  useEffect(() => {
    const zb = zbRef.current;
    if (!zb) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const z = zoom.current;
      z.scale = Math.max(1, Math.min(4, z.scale * (e.deltaY < 0 ? 1.18 : 0.85)));
      if (z.scale === 1) {
        z.px = 0;
        z.py = 0;
      }
      zbApply();
    }
    zb.addEventListener('wheel', onWheel, { passive: false });
    return () => zb.removeEventListener('wheel', onWheel);
  }, []);

  /* The live site's scroll lock, zoom flag: the page is locked
     while the full-screen zoom box is open. */
  useScrollLock('zoom', zbOpen);

  useEffect(() => {
    if (!zbOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeZoom();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [zbOpen]);

  const out = p.stock === 0;
  const stockClass = out ? 'stockline out' : p.stock <= 4 ? 'stockline low' : 'stockline';
  const stockText = out
    ? 'Sold out - join the wishlist and we will message you when it returns'
    : p.stock <= 4
      ? 'Low stock - only ' + p.stock + ' left'
      : 'In stock \u00B7 ships within 24 hours';

  return (
    <main>
      <div className="view" id="view-product">
        <div className="wrap">
          <div className="crumb">
            <button data-nav="home">Home</button> / <button data-nav="shop">Shop</button> /{' '}
            <span id="crumbName">{p.name}</span>
          </div>
          <div className="pd">
            <div>
              <div
                className="main-img"
                ref={frameRef}
                onPointerMove={(e) => {
                  if (e.pointerType !== 'mouse') return;
                  const frame = frameRef.current;
                  const im = imgRef.current;
                  if (!frame || !im) return;
                  const r = frame.getBoundingClientRect();
                  im.style.transformOrigin =
                    (((e.clientX - r.left) / r.width) * 100).toFixed(2) +
                    '% ' +
                    (((e.clientY - r.top) / r.height) * 100).toFixed(2) +
                    '%';
                  frame.classList.add('zooming');
                }}
                onPointerLeave={() => frameRef.current?.classList.remove('zooming')}
                onClick={openZoom}
              >
                <img id="pdImg" ref={imgRef} src={src} alt={p.name} style={{ opacity }} decoding="async" />
              </div>
              <div className="thumbs" id="pdThumbs">
                {p.gallery.map((g, i) => (
                  <button
                    data-thumb={i}
                    className={i === activeThumb ? 'on' : ''}
                    key={g + i}
                    onClick={() => pickThumb(i)}
                  >
                    <img loading="lazy" decoding="async" src={g} alt={p.name + ' view ' + (i + 1)} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="pill" id="pdBadge" hidden={!p.badge}>
                {p.badge}
              </span>
              <h1 id="pdName">{p.name}</h1>
              <div className="cat" id="pdCat">
                {p.cat}
              </div>
              <div className="price">
                <b id="pdPrice">{money(p.price)}</b>
                <s id="pdWas">{p.was ? money(p.was) : ''}</s>
              </div>
              <p className="desc" id="pdDesc">
                {p.desc}
              </p>
              <div className={stockClass} id="pdStock">
                <i></i>
                <span>{stockText}</span>
              </div>
              <div
                style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginTop: 20 }}
                id="pdSwName"
              >
                Colour - {vars[curSw][0]}
              </div>
              <div className="swatches" id="pdSwatches">
                {vars.map((s, i) => (
                  <button
                    className={'sw' + (i === curSw ? ' on' : '')}
                    data-sw={i}
                    aria-label={s[0]}
                    key={s[0] + i}
                    onClick={() => selectColour(i)}
                  >
                    <i style={{ background: s[1] }}></i>
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }} id="pdSizeName">
                {sizeLabel(p, curSize)}
              </div>
              <div className="sizes" id="pdSizes">
                {p.sizes.map((z) => (
                  <button
                    type="button"
                    className={'sizebtn' + (z === curSize ? ' on' : '')}
                    data-size={z}
                    key={z}
                    onClick={() => setCurSize(z)}
                  >
                    {z}
                  </button>
                ))}
              </div>
              <div className="qtyrow">
                <div className="qty">
                  <button
                    id="qMinus"
                    aria-label="Decrease quantity"
                    onClick={() => setQty((v) => Math.max(1, v - 1))}
                  >
                    {'\u2212'}
                  </button>
                  <b id="qVal">{qty}</b>
                  <button
                    id="qPlus"
                    aria-label="Increase quantity"
                    onClick={() =>
                      setQty((v) => Math.min(Math.max(1, Math.min(9, p.stock)), v + 1))
                    }
                  >
                    +
                  </button>
                </div>
                <button
                  className="btn block"
                  id="pdAdd"
                  style={{ flex: 1 }}
                  disabled={out}
                  onClick={() => {
                    /* The legacy #pdAdd handler: addToBag with the
                       main photo as the flight source and the
                       chosen colour. */
                    if (p.stock > 0) addWithFly(p.id, qty, curSize, vars[curSw][0], imgRef.current);
                  }}
                >
                  {out ? 'Sold out' : 'Add to bag - ' + money(p.price)}
                </button>
              </div>
              <button
                className="btn light block"
                id="pdWish"
                style={{ border: '1px solid var(--line)' }}
                onClick={() => toggleWish(p.id)}
              >
                {wished(p.id) ? 'Saved to wishlist' : 'Add to wishlist'}
              </button>
              <div className="trustrow">
                <span>
                  <svg className="icon" viewBox="0 0 24 24">
                    <path d="M3 8h11v9H3zM14 11h4l3 3v3h-7z" />
                    <circle cx="7" cy="19" r="1.6" />
                    <circle cx="17" cy="19" r="1.6" />
                  </svg>
                  Delivery {'\u09F3'}70 Dhaka city {'\u00B7'} {'\u09F3'}100 sub city {'\u00B7'} {'\u09F3'}150 outside
                </span>
                <span>
                  <svg className="icon" viewBox="0 0 24 24">
                    <path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2" />
                    <path d="M20 4v4h-4M4 20v-4h4" />
                  </svg>
                  Free size exchange {'\u00B7'} 7 days
                </span>
                <span>
                  <svg className="icon" viewBox="0 0 24 24">
                    <rect x="4" y="10" width="16" height="10" rx="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  </svg>
                  COD {'\u00B7'} bKash {'\u00B7'} Nagad {'\u00B7'} Cards
                </span>
              </div>
              <div className="pdlinks">
                <button data-nav="shipping">Shipping &amp; delivery</button>
                <button data-nav="returns">Returns &amp; exchanges</button>
                <button data-nav="warranty">Stitching guarantee</button>
                <button data-nav="faq">FAQ</button>
              </div>
              <div className="spec" id="pdSpec">
                {p.spec.map((s) => (
                  <div key={s[0]}>
                    <span>{s[0]}</span>
                    <b>{s[1]}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <section style={{ paddingTop: 70 }}>
            <div className="sec-head">
              <h2 style={{ fontSize: 30 }}>You may also like</h2>
            </div>
            <div className="grid" id="pdRelated">
              {related.map((r) => (
                <ProductCard product={r} key={r.id} />
              ))}
            </div>
          </section>
        </div>
      </div>

      <div id="zoomBox" hidden={!zbOpen} ref={zbRef} data-html2canvas-ignore={true} role="dialog" aria-label="Product image zoom">
        <button className="zb-close" id="zbClose" aria-label="Close zoom" onClick={closeZoom}>
          <svg className="icon" viewBox="0 0 24 24">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <div
          className="zb-stage"
          id="zbStage"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeZoom();
          }}
        >
          <img
            id="zbImg"
            ref={zbImgRef}
            alt="Zoomed product photo"
            onClick={() => {
              const z = zoom.current;
              if (z.pMoved) return;
              if (z.scale > 1) {
                z.scale = 1;
                z.px = 0;
                z.py = 0;
              } else {
                z.scale = 2.2;
              }
              zbApply();
            }}
            onPointerDown={(e) => {
              const z = zoom.current;
              if (z.scale <= 1) return;
              z.panning = true;
              z.pMoved = false;
              z.psx = e.clientX - z.px;
              z.psy = e.clientY - z.py;
              try {
                (e.target as Element).setPointerCapture(e.pointerId);
              } catch (err) {}
            }}
            onPointerMove={(e) => {
              const z = zoom.current;
              if (!z.panning) return;
              const nx = e.clientX - z.psx;
              const ny = e.clientY - z.psy;
              if (Math.abs(nx - z.px) + Math.abs(ny - z.py) > 3) z.pMoved = true;
              z.px = nx;
              z.py = ny;
              zbApply();
            }}
            onPointerUp={() => {
              const z = zoom.current;
              z.panning = false;
              setTimeout(() => {
                z.pMoved = false;
              }, 0);
            }}
            onDragStart={(e) => e.preventDefault()}
          />
        </div>
        <div className="zb-note">Click the photo to zoom {'\u00B7'} drag to look around {'\u00B7'} Esc to close</div>
      </div>

      <RevealSystem />
    </main>
  );
}

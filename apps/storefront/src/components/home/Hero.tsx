'use client';

/* Hero, ported from the legacy markup (pendant lamps, headline,
   mini product cards) with the legacy hero offer slider behaviour:
   4 posters crossfading on a 4500ms timer, dots, autoplay paused on
   hover/focus, while the tab is hidden and while the home view is
   not on screen, swipe past a 44px threshold changes poster, and
   the click that follows a drag is swallowed. Under
   prefers-reduced-motion there is no autoplay; dots and swipe
   still work. The legacy also pauses while the ink bleed is on
   screen; that check reads #inkCanvas.is-active exactly as the
   original does (the ink step itself is still pending). */

import { useEffect, useRef } from 'react';
import type { HeroPoster, StorefrontProduct } from '../../data/products';
import { money } from '../../lib/format';
import { ArrowUpRight } from '../icons';

interface Mini {
  product: StorefrontProduct;
  label: string;
  alt: string;
}

export default function Hero({ posters, minis }: { posters: HeroPoster[]; minis: Mini[] }) {
  const sliderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const slider = sliderRef.current;
    if (!slider) return;
    const slides = Array.prototype.slice.call(slider.querySelectorAll('.hslide')) as HTMLElement[];
    const dots = Array.prototype.slice.call(slider.querySelectorAll('.hdot')) as HTMLElement[];
    const ink = document.getElementById('inkCanvas');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let idx = 0;
    let timer: ReturnType<typeof setInterval> | 0 = 0;
    const DELAY = 4500;

    function show(n: number) {
      idx = ((n % slides.length) + slides.length) % slides.length;
      slides.forEach((s, i) => {
        const on = i === idx;
        s.classList.toggle('is-active', on);
        s.setAttribute('aria-hidden', on ? 'false' : 'true');
        s.tabIndex = on ? 0 : -1;
      });
      dots.forEach((d, i) => {
        d.classList.toggle('is-active', i === idx);
      });
    }
    function tick() {
      if (document.hidden) return;
      if (!slider!.offsetParent) return; /* home view not showing */
      if (ink && ink.classList.contains('is-active')) return; /* ink bleed mid-flip */
      if (slider!.closest && slider!.closest('.anim-off')) return; /* hero off screen: do not crossfade big photos nobody can see */
      show(idx + 1);
    }
    function stop() {
      if (timer) clearInterval(timer);
      timer = 0;
    }
    function play() {
      stop();
      if (!reduced) timer = setInterval(tick, DELAY);
    }
    function restart() {
      play();
    }

    const cleanups: (() => void)[] = [];
    const on = (
      el: HTMLElement,
      type: string,
      fn: (e: never) => void,
      opts?: AddEventListenerOptions | boolean,
    ) => {
      el.addEventListener(type, fn as EventListener, opts);
      cleanups.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };

    dots.forEach((d) => {
      on(d, 'click', () => {
        show(parseInt(d.getAttribute('data-slide') || '0', 10) || 0);
        restart();
      });
    });
    on(slider, 'mouseenter', stop);
    on(slider, 'mouseleave', play);
    on(slider, 'focusin', stop);
    on(slider, 'focusout', play);

    let downX: number | null = null;
    let dragged = false;
    on(slider, 'pointerdown', (e: PointerEvent) => {
      downX = e.clientX;
      dragged = false;
    });
    on(slider, 'pointermove', (e: PointerEvent) => {
      if (downX === null) return;
      if (Math.abs(e.clientX - downX) > 10) dragged = true;
    });
    on(slider, 'pointerup', (e: PointerEvent) => {
      if (downX === null) return;
      const dx = e.clientX - downX;
      downX = null;
      if (Math.abs(dx) > 44) {
        show(idx + (dx < 0 ? 1 : -1));
        restart();
      }
    });
    on(slider, 'pointercancel', () => {
      downX = null;
    });
    on(
      slider,
      'click',
      (e: MouseEvent) => {
        if (dragged) {
          dragged = false;
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true,
    );

    show(0);
    play();
    return () => {
      stop();
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return (
    <div className="hero">
      <div className="pendants anim-pendants" aria-hidden="true">
        <div className="pendant">
          <svg width="86" height="190" viewBox="0 0 86 190">
            <line x1="43" y1="0" x2="43" y2="104" stroke="#3A372F" strokeWidth="2" />
            <path d="M8 138a35 34 0 0 1 70 0Z" fill="#2B2925" />
            <ellipse cx="43" cy="138" rx="35" ry="6" fill="#F2EFE7" />
          </svg>
        </div>
        <div className="pendant">
          <svg width="86" height="250" viewBox="0 0 86 250">
            <line x1="43" y1="0" x2="43" y2="164" stroke="#3A372F" strokeWidth="2" />
            <path d="M8 198a35 34 0 0 1 70 0Z" fill="#2B2925" />
            <ellipse cx="43" cy="198" rx="35" ry="6" fill="#F2EFE7" />
          </svg>
        </div>
        <div className="pendant">
          <svg width="86" height="160" viewBox="0 0 86 160">
            <line x1="43" y1="0" x2="43" y2="74" stroke="#3A372F" strokeWidth="2" />
            <path d="M8 108a35 34 0 0 1 70 0Z" fill="#2B2925" />
            <ellipse cx="43" cy="108" rx="35" ry="6" fill="#F2EFE7" />
          </svg>
        </div>
      </div>
      <div className="wrap hero-in">
        <div className="anim-hero">
          <h1>
            <span className="hline">
              <span>Boys’ collection</span>
            </span>
            <span className="hline">
              <span>- for every day</span>
            </span>
          </h1>
          <p className="anim-fade">
            Shirts, tees, pants, jeans and belts in honest fabrics and fair taka prices - made to be worn daily, and
            kept for years.
          </p>
          <button className="btn anim-fade" data-nav="shop">
            Shop the collection
            <ArrowUpRight />
          </button>
          <div className="hero-cards anim-minis">
            {minis.map(({ product, label, alt }) => (
              <button className="mini" data-product={product.id} key={product.id}>
                <img src={product.img} alt={alt} />
                <span>
                  <b>{label}</b>From <b>{money(product.price)}</b>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="hero-img anim-chair">
          <div
            className="hero-slider"
            id="heroSlider"
            role="region"
            aria-roledescription="carousel"
            aria-label="Current offers"
            ref={sliderRef}
          >
            {posters.map((poster, i) => (
              <button
                type="button"
                className={'hslide' + (i === 0 ? ' is-active' : '')}
                key={poster.title}
                {...(poster.cat ? { 'data-cat': poster.cat } : { 'data-nav': poster.nav || 'shop' })}
                aria-hidden={i === 0 ? undefined : true}
                tabIndex={i === 0 ? undefined : -1}
              >
                <img
                  src={poster.img}
                  alt={poster.alt}
                  fetchPriority={i === 0 ? 'high' : undefined}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  style={poster.objectPosition ? { objectPosition: poster.objectPosition } : undefined}
                />
                <span className="hslide-cap">
                  <span className="hslide-tag">{poster.tag}</span>
                  <span className="hslide-title">{poster.title}</span>
                  <span className="hslide-sub">{poster.sub}</span>
                  <span className="hslide-cta">
                    {poster.cta} <ArrowUpRight />
                  </span>
                </span>
              </button>
            ))}
            <div className="hslider-dots">
              {posters.map((poster, i) => (
                <button
                  type="button"
                  className={'hdot' + (i === 0 ? ' is-active' : '')}
                  data-slide={i}
                  aria-label={poster.dotLabel}
                  key={poster.title}
                ></button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

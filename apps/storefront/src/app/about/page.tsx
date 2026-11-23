/* About route, the legacy #view-about: the page head, the
   split story block, the three values, and the atelier strip
   (this view's own copy: its button reads "See the
   collections" and points at the collections view, unlike the
   home atelier's). Title and description are the legacy
   SEO_PAGES.about pair. */

import type { Metadata } from 'next';
import RevealSystem from '../../components/home/RevealSystem';
import { SEO_PAGES, seoMetadata } from '../../lib/seo';

export const metadata: Metadata = seoMetadata(SEO_PAGES.about);

function ShieldIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M3.5 3.5H11L20.5 13a2 2 0 0 1 0 2.8l-4.7 4.7a2 2 0 0 1-2.8 0L3.5 11V3.5Z" />
      <circle cx="8" cy="8" r="1.4" />
    </svg>
  );
}

function NeedleIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M13.4 3.6a1.6 1.6 0 0 1 2.3 0l4.7 4.7a1.6 1.6 0 0 1 0 2.3l-1.2 1.2a1.6 1.6 0 0 1-2.3 0l-4.7-4.7a1.6 1.6 0 0 1 0-2.3l1.2-1.2Z" />
      <path d="M10.6 9.9 3.9 16.6a1.85 1.85 0 0 0 2.6 2.6l6.7-6.7" />
    </svg>
  );
}

export default function AboutPage() {
  return (
    <main>
      <div className="view" id="view-about">
        <div className="wrap">
          <div className="page-head">
            <div className="eyebrow">About us</div>
            <h1>
              Clothes with care,
              <br />
              made for boys
            </h1>
          </div>
          <div className="split" style={{ marginTop: 36 }}>
            <img
              src="/images/workshop-tailor.webp"
              alt="Tailor stitching a boys cotton shirt in the DOSTELO workshop"
              loading="lazy"
              decoding="async"
            />
            <div>
              <p style={{ fontSize: 17, lineHeight: 1.7, marginTop: 0 }}>
                DOSTELO started in a small Dhaka workshop with a simple idea: boys’ clothing should
                be honest, comfortable and built to last. Every piece uses fabrics that survive
                daily wear and weekly washing - and sizes that actually match the boy wearing them.
              </p>
              <p style={{ lineHeight: 1.7 }}>
                We don’t chase fads. A DOSTELO piece is cut once, fitted on real boys, washed twenty
                times in testing - then made in small batches by the same makers who designed it.
                If a seam can be reinforced instead of replaced next season, we build it that way.
              </p>
              <p style={{ lineHeight: 1.7 }}>
                That is why our prices are honest taka prices: no middlemen and no inflated
                “discounts” - just fabric, makers, and clothing that earns its place in the
                wardrobe.
              </p>
              <button className="btn" data-nav="shop" style={{ marginTop: 10 }}>
                Explore the collection
              </button>
            </div>
          </div>
          <div className="values">
            <div className="value">
              <h3>Honest fabrics</h3>
              <p>
                Cotton first - Oxford weaves, combed jersey, piqué and real denim. Every fabric is
                wash-tested twenty times before it joins the collection.
              </p>
            </div>
            <div className="value">
              <h3>Made for everyday wear</h3>
              <p>
                Reinforced seams, collars that keep their shape and room to grow - built for school
                days, cricket evenings and everything between.
              </p>
            </div>
            <div className="value">
              <h3>Stitched by real makers</h3>
              <p>
                Every piece passes through the hands of the workshop that designed it, and carries
                our stitching guarantee - a seam that fails is repaired free.
              </p>
            </div>
          </div>
          <div className="atelier reveal" style={{ marginTop: 56 }}>
            <div className="side">
              <img
                src="/images/workshop-tailor.webp"
                alt="Tailor stitching a boys shirt in the workshop"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="mid">
              <h2>DOSTELO Atelier</h2>
              <div className="stats">
                <div className="stat">
                  <span className="ic">
                    <ShieldIcon />
                  </span>
                  <span>
                    <b>Quality</b> checked
                  </span>
                </div>
                <div className="stat">
                  <span className="ic">
                    <TagIcon />
                  </span>
                  <span>
                    <b>Honest</b> taka pricing
                  </span>
                </div>
                <div className="stat">
                  <span className="ic">
                    <NeedleIcon />
                  </span>
                  <span>
                    <b>Made</b> to last
                  </span>
                </div>
              </div>
              <button className="btn" data-nav="collections">
                See the collections
              </button>
            </div>
            <div className="side">
              <img
                src="/images/offer-up-to-30-off-shirts.jpg"
                alt="Rail of boys shirts and t-shirts ready for dispatch"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </div>
        <RevealSystem />
      </div>
    </main>
  );
}

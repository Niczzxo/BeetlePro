/* Home view, ported section by section from the legacy #view-home
   markup, in the legacy order: hero, comfort grid, about strip,
   offer zone, atelier, fresh picks, shop the look, categories,
   reviews, journal teaser. Sections the legacy script rendered from
   data (product grid, offers, picks, look strip, category cards,
   journal cards) are rendered here from src/data/products.ts, the
   legacy catalogue extracted verbatim. */

import {
  articles,
  byId,
  heroPosters,
  offers,
  picks,
  products,
  roomItems,
} from '../data/products';
import { StarRow } from '../components/icons';
import Hero from '../components/home/Hero';
import ProductCard from '../components/home/ProductCard';
import CategoryCards from '../components/home/CategoryCards';
import JournalCard from '../components/journal/JournalCard';
import OfferZone from '../components/home/OfferZone';
import FreshPicks from '../components/home/FreshPicks';
import ShopTheLook from '../components/home/ShopTheLook';
import DragSystem from '../components/home/DragSystem';
import RevealSystem from '../components/home/RevealSystem';

const REVIEWS = [
  {
    text: 'The Oxford shirt survived a full school term of daily wear and weekly washing - collar still crisp, colour still true. That never happens with market shirts.',
    name: 'Sharmin Akter',
    city: 'Dhaka',
  },
  {
    text: 'Ordered the wrong size for my son - the exchange was picked up from our home in two days and the new size arrived free. Cash on Delivery made it risk-free.',
    name: 'Tanvir Hasan',
    city: 'Chattogram',
  },
  {
    text: 'The jeans fit exactly by the size guide, and the tee is proper heavy cotton, not the thin kind. Paid with bKash, delivered to Sylhet in three days.',
    name: 'Rafid Islam',
    city: 'Sylhet',
  },
];

function TruckIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M3 8h11v9H3zM14 11h4l3 3v3h-7z" />
      <circle cx="7" cy="19" r="1.6" />
      <circle cx="17" cy="19" r="1.6" />
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

export default function HomePage() {
  const comfort = products.filter((p) => p.cat !== 'Shoes').slice(0, 8);
  const miniOxford = byId('oxford-shirt');
  const miniTee = byId('tee-basic');
  const minis = [
    ...(miniOxford
      ? [{ product: miniOxford, label: 'Oxford Cotton Shirt', alt: 'Oxford Cotton Shirt in sky blue' }]
      : []),
    ...(miniTee
      ? [{ product: miniTee, label: 'Essential T-Shirt', alt: 'Essential Crew-Neck T-Shirt in black' }]
      : []),
  ];

  return (
    <main>
      <div className="view" id="view-home">
        <Hero posters={heroPosters} minis={minis} />

        <section className="wrap" id="comfort">
          <div className="sec-head reveal">
            <h2>Comfort in every wear</h2>
            <button className="btn sm" data-nav="shop">
              Shop now
            </button>
          </div>
          <div className="grid" id="homeGrid">
            {comfort.map((p) => (
              <ProductCard product={p} key={p.id} />
            ))}
          </div>
        </section>

        <section className="wrap" id="about-sec">
          <div className="about-grid">
            <img
              className="big reveal-zoom"
              src="/images/workshop-tailor.webp"
              alt="Tailor stitching a boys cotton shirt in the DOSTELO workshop"
              loading="lazy"
              decoding="async"
            />
            <div className="reveal">
              <div className="eyebrow">About us</div>
              <h2>
                Clothes with care,
                <br />
                made for boys
              </h2>
              <p>
                DOSTELO started in a small Dhaka workshop with a simple idea: boys’ clothing should be honest,
                comfortable and built to last. Every piece uses fabrics that survive daily wear and weekly washing -
                and sizes that actually match the boy wearing them.
              </p>
              <button className="btn" data-nav="about">
                Our story
              </button>
            </div>
          </div>
          <div className="feats reveal">
            <div className="feat">
              <span className="ic">
                <svg className="icon" viewBox="0 0 24 24">
                  <path d="M11 20c-5-1-8-5-8-11V4h5c5 0 9 3 10 8-3 0-5-1-7-3 1 4 3 6 6 7-1 3-3 4-6 4Z" />
                </svg>
              </span>
              <span>
                <b>Honest fabrics</b>
                <span>Cotton first, always</span>
              </span>
            </div>
            <div className="feat">
              <span className="ic">
                <svg className="icon" viewBox="0 0 24 24">
                  <path d="M6.5 3.5v9M17.5 3.5v9M6.5 7.2h11" />
                  <path d="M4.5 12.5h15V16H4.5z" />
                  <path d="M6.5 16v4.5M17.5 16v4.5" />
                </svg>
              </span>
              <span>
                <b>Made for everyday wear</b>
                <span>School, play &amp; parties</span>
              </span>
            </div>
            <div className="feat">
              <span className="ic">
                <NeedleIcon />
              </span>
              <span>
                <b>Stitched by real makers</b>
                <span>Small-batch workshop</span>
              </span>
            </div>
            <div className="feat">
              <span className="ic">
                <TruckIcon />
              </span>
              <span>
                <b>Free size exchange</b>
                <span>7 days, anywhere in BD</span>
              </span>
            </div>
          </div>
        </section>

        <OfferZone offers={offers} />

        <section className="wrap">
          <div className="atelier reveal">
            <div className="side">
              <img
                className="reveal-zoom"
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
                    <svg className="icon" viewBox="0 0 24 24">
                      <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  </span>
                  <span>
                    <b>Quality</b> checked
                  </span>
                </div>
                <div className="stat">
                  <span className="ic">
                    <svg className="icon" viewBox="0 0 24 24">
                      <path d="M3.5 3.5H11L20.5 13a2 2 0 0 1 0 2.8l-4.7 4.7a2 2 0 0 1-2.8 0L3.5 11V3.5Z" />
                      <circle cx="8" cy="8" r="1.4" />
                    </svg>
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
              <button className="btn" data-nav="shop">
                Explore the collection
              </button>
            </div>
            <div className="side">
              <img
                className="reveal-zoom"
                src="/images/offer-up-to-30-off-shirts.jpg"
                alt="Rail of boys shirts and t-shirts ready for dispatch"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </section>

        <FreshPicks picks={picks} />

        <ShopTheLook room={roomItems} />

        <section className="wrap">
          <div className="sec-head reveal">
            <h2>Shop by category</h2>
            <button className="btn sm" data-nav="collections">
              View all
            </button>
          </div>
          <CategoryCards id="catGrid" />
        </section>

        <section className="wrap">
          <div className="reveal">
            <div
              className="eyebrow"
              style={{ textTransform: 'none', letterSpacing: 0, fontSize: 14 }}
            >
              4.9 average from 2,400 reviews
            </div>
            <h2 style={{ fontSize: 'clamp(30px,3.6vw,44px)' }}>Worn &amp; loved across Bangladesh</h2>
          </div>
          <div className="rev-grid reveal">
            {REVIEWS.map((r) => (
              <article className="review" key={r.name}>
                <div className="rhead">
                  <div className="qmark">&ldquo;</div>
                  <div className="stars" aria-label="5 out of 5 stars">
                    <StarRow />
                  </div>
                </div>
                <p>{r.text}</p>
                <b>{r.name}</b>
                <span>{r.city}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="wrap">
          <div className="sec-head reveal">
            <h2>From the journal</h2>
            <button className="btn sm" data-nav="journal">
              View all
            </button>
          </div>
          <div className="jgrid" id="homeJournal">
            {articles.map((a, i) => (
              <JournalCard article={a} index={i} key={a.id} />
            ))}
          </div>
        </section>

        <RevealSystem />
        <DragSystem />
      </div>

      {/* The legacy SEO fallback, verbatim: search engines and
          no-JS visitors get the catalogue as plain text. */}
      <noscript>
        <div className="wrap" style={{ padding: '32px 20px 8px' }}>
          <h2>DOSTELO - boys clothing in Bangladesh</h2>
          <p>
            Shirts, t-shirts, polos, pants, jeans, belts and accessories for boys, in honest cotton
            fabrics with fair taka prices. Cash on Delivery, bKash, Nagad, Rocket, Upay and cards
            accepted. Delivery ৳70 in Dhaka city, ৳100 in Dhaka sub city and ৳150 outside Dhaka,
            calculated automatically from your address at checkout (Cash on Delivery adds ৳10), and
            free on your first order; free size exchange within 7 days.
          </p>
          <h3>Shop the collection</h3>
          <ul>
            <li>Oxford Cotton Shirt - Shirts - ৳1,450</li>
            <li>Classic Formal Shirt - Shirts - ৳1,290</li>
            <li>Casual Check Shirt - Shirts - ৳1,190</li>
            <li>Essential Crew-Neck T-Shirt - T-Shirts - ৳550</li>
            <li>Graphic Art T-Shirt - T-Shirts - ৳790</li>
            <li>Classic Piqué Polo - Polo - ৳890</li>
            <li>Cotton Chino Pants - Pants - ৳1,350</li>
            <li>Slim Formal Trousers - Pants - ৳1,490</li>
            <li>Slim-Fit Denim Jeans - Jeans - ৳1,690</li>
            <li>Straight-Fit Blue Jeans - Jeans - ৳1,590</li>
            <li>Genuine Leather Belt - Belts - ৳850</li>
            <li>Classic Black Belt - Belts - ৳650</li>
            <li>Cotton Baseball Cap - Accessories - ৳450</li>
            <li>Bifold Leather Wallet - Accessories - ৳750</li>
          </ul>
          <h3>Categories</h3>
          <p>Shirts · T-Shirts · Polo · Pants · Jeans · Belts · Accessories</p>
          <h3>From the journal</h3>
          <ul>
            <li>Keeping cotton crisp in Bangladesh weather</li>
            <li>Boys’ size guide: the right fit, first time</li>
            <li>Five pieces, fifteen outfits</li>
          </ul>
        </div>
      </noscript>
    </main>
  );
}

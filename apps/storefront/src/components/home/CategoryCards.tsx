/* Category cards, the legacy catHTML() rendered into both
   #catGrid (home) and #catGrid2 (collections): a button per
   category with the photo, the go arrow, the name and the live
   piece count from the catalogue. The grid element keeps the
   caller's legacy id. */

import type { CSSProperties } from 'react';
import { categories, products } from '../../data/products';
import { ArrowUpRight } from '../icons';

export default function CategoryCards({
  id,
  style,
}: {
  id: string;
  style?: CSSProperties;
}) {
  return (
    <div className="cats" id={id} style={style}>
      {categories.map((c) => {
        const n = products.filter((p) => p.cat === c.name).length;
        return (
          <button className="catcard reveal" data-cat={c.name} key={c.name}>
            <span className="ph" style={{ display: 'block' }}>
              <img src={c.img} alt={c.alt} loading="lazy" decoding="async" />
              <span className="go">
                <ArrowUpRight size={17} />
              </span>
            </span>
            <span className="row">
              <h3>{c.name}</h3>
              <span>
                {n}
                {n === 1 ? ' piece' : ' pieces'}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

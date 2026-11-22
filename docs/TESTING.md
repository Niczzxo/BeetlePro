# Beetle Pro — Testing

Manual verification in a real browser before every delivery (self-check gate):
- Compare each homepage section against the reference (order, layout, spacing) with screenshots.
- Compare animations one by one: hero choreography, pendant lamps, scroll reveals, carousels,
  reviews marquee, hotspots, hovers — timing/easing/distance/stagger from the reference's data.
- Click-through: nav, categories, product pages, search, wishlist, bag totals (incl. delivery
  rule), checkout in BOTH themes, account tabs, policy pages.
- Zip effects: toggle flips theme with a visible ink bleed spread (not a plain switch);
  Add to Bag folds the photo into a paper plane that flies to the bag and bumps the count.
- Forms: labels above full-width inputs, zero overlap, in light and dark.
- Live-site check after each GitHub Pages deploy (the artifact preview is not the live site).
- robots.txt and sitemap.xml return content (not 404) on the live domain.

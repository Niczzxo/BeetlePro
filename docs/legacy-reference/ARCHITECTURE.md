# Beetle Pro: Architecture

- Single self-contained static page (index.html) deployed on GitHub Pages; no build step, no server.
- Hash routing for views: home, shop, category, product (#/product/<slug>), collections, journal,
  article, about, contact, checkout, account, orders and policy pages.
- Catalogue rendered from one PRODUCTS data array (name, slug, category, price, compare-at price,
  sizes, stock state, image). Categories derive from the data: adding a category is a data change.
- State in localStorage: bag, wishlist, theme (`beetle-pro-theme`).
- Demo product images live in assets/demo-* and are referenced (not inlined) so real photos can
  replace them file-for-file.
- robots.txt and sitemap.xml sit at the repo root next to index.html.
- Repo: https://github.com/Niczzxo/BeetlePro: Live: https://niczzxo.github.io/BeetlePro/

# Beetle Pro — Product Requirements

## Purpose
A Bangladesh boys-clothing e-commerce site built as a same-to-same recreation of the reference
https://beetlepro.framer.website/ (structure, layout, animations — reverse engineered, REA method),
with the reference's furniture catalogue replaced by the owner's boys collection and a full
e-commerce layer added on top.

## Users
Shoppers in Bangladesh buying boys' clothing (shirts, T-shirts, polo, pants, jeans, belts, accessories).

## Requirements
- Homepage sections in the reference's exact order and motion: header, hero, product grid,
  about/features, offer zone, atelier, fresh picks, shop the look, shop by category, reviews, journal, footer.
- Catalogue is data-driven (PRODUCTS data): categories can be added without redesign.
- Prices in Bangladeshi taka (BDT) only. Delivery ৳80, free over ৳1,500.
- Payments: Cash on Delivery, bKash, Nagad, Rocket, Upay, debit/credit card (checkout step is a
  placeholder until a real gateway is connected).
- Bag, checkout flow, order confirmation, account sign-in/sign-up (demo, this-visit only),
  Shipping / Returns & Exchanges / Stitching Guarantee / FAQ pages.
- Fly-to-cart exactly as in fly-to-cart-main.zip: photo pops out, folds along its centre crease
  into a paper plane, plane flies to the bag, item commits on landing.
- Ink bleed theme changer exactly as in ink-bleed-theme-changer-main.zip (WebGL bleed), colours
  matched to this site's theme only.
- SEO-ready: per-page titles/meta/canonical, Open Graph, JSON-LD in BDT, robots.txt, sitemap.xml.
- Product photos are DEMO placeholders (web-sourced, assets/demo-*) until the owner supplies real photos.

## Non-goals
No backend, no real payment processing, no inventory system in this static build.

# Beetle Pro: Design

## Palette (two colours only: owner rule)
- Off-white #F4F2ED (light ground)
- Warm Black #1C1B17 (theme colour; dark ground)
Everything else is a tint or shade of these two. No other hues.

## Themes
- Light: off-white ground, warm-black text. The site always opens light.
- Dark: warm black ground, off-white text. Applied ONLY when the visitor uses the navbar toggle.
  Never from prefers-color-scheme or any automatic override.
- Theme choice persists in localStorage key `beetle-pro-theme`, restored before paint.
- Theme change animates with the ink bleed transition (see INTEGRATIONS.md).

## Layout & motion
Layout, section order, spacing and animations replicate the reference (beetlepro.framer.website),
measured from its Framer data: hero entrance (fade+rise 24px, 0.8s, delays 0.1s/0.45s; pendant lamps
drop from -60px with bounce, 1s; hero image slides from +40px, 0.9s cubic-bezier(0.22,1,0.36,1)),
scroll reveals fade+rise 24px with stagger, image scales 1.04→1 / 0.98→1, hotspot pop + pulse ring,
reviews marquee, carousels as on the reference.

## Forms
One shared form style everywhere (checkout, account, contact, newsletter): label above a
full-width aligned input. No label/field overlap in either theme.

# Beetle Pro — Setup

No build or install. To run locally, serve the folder statically, e.g.:
  python3 -m http.server
and open the page. Deployment is GitHub Pages from the repo root (main branch):
index.html, assets/, robots.txt, sitemap.xml.
Large-file note: index.html is ~13 MB; the GitHub web editor cannot edit it (loads empty) —
replace it by upload + server-side rename (git mv), never by editing in the web UI.

# Beetle Pro — Debugging Notes (known traps)

- Invisible sections: scroll-reveal elements stuck at opacity 0 make the page look structurally
  broken in unscrolled/full-page views. Reveal must have a completion guarantee (observer +
  safety sweep + print rules).
- Accidental dark site: a prefers-color-scheme dark override once rendered checkout near-black.
  The site must open light always; dark only via the toggle. No prefers-color-scheme dark rules.
- Form overlap: a form container missing the shared form styles caused label/field collisions.
  All forms use the one shared form style.
- GitHub large files: the web editor loads ~13-21 MB files as empty — never commit from it.
  Replace index.html via upload + server-side git mv rename. github.dev renames can fail with
  IndexedDB "database connection is closing" on large files; a Copilot cloud agent or a one-time
  Actions workflow can do the rename server-side.
- Export inlining: demo product images (assets/demo-*) are NOT inlined into the single-file
  export; the repo must keep assets/ with the exact filenames or product photos 404.
- Ink bleed in sandboxed previews: if the html2canvas CDN is blocked, the toggle uses the CSS
  cross-fade fallback — that does not prove the live bleed is broken; verify on the live site.
- Freeze rule: never rebuild/re-export while a browser upload task using those files is running.

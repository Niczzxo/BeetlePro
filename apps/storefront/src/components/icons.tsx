/* Inline SVG icons, copied path-for-path from the legacy markup.
   The legacy .icon class (in legacy.css) supplies stroke, width and
   sizing; these components only carry the original path data. */

export function ArrowUpRight({ size }: { size?: number }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      style={size ? { width: size, height: size } : undefined}
    >
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

export function ArrowLeft() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M19.5 12h-15" />
      <path d="m10.5 6-6 6 6 6" />
    </svg>
  );
}

export function ArrowRight() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M4.5 12h15" />
      <path d="m13.5 6 6 6-6 6" />
    </svg>
  );
}

export function HeartIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M12 20.4C7.3 16.8 4.1 13.7 4.1 10.2 4.1 7.6 6 5.6 8.4 5.6c1.5 0 2.9.8 3.6 2 .7-1.2 2.1-2 3.6-2 2.4 0 4.3 2 4.3 4.6 0 3.5-3.2 6.6-7.9 10.2Z" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function StarIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="m12 3 2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.9 6.4 20l1.3-6.2L3 9.5l6.3-.7L12 3Z" />
    </svg>
  );
}

/** The legacy starRow(): five stars, used by the review cards. */
export function StarRow() {
  return (
    <>
      <StarIcon />
      <StarIcon />
      <StarIcon />
      <StarIcon />
      <StarIcon />
    </>
  );
}

/* Formatting helpers, ported from the legacy storefront script.
   money() is the legacy formatter exactly: the taka sign followed by
   the amount grouped with the en-IN locale. */

/** Format a whole-taka amount the way the legacy site does. */
export function money(n: number): string {
  return '\u09F3' + n.toLocaleString('en-IN');
}

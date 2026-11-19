// Text helpers for a Greek UI.
// Why: uppercase Greek drops accents (Αναζήτηση → ΑΝΑΖΗΤΗΣΗ), final sigma ς ≠ σ,
// and CSS text-transform makes what you SEE differ from what the DOM HOLDS.

const GREEK_VARIANTS: Record<string, string> = {
  α: 'αά', ε: 'εέ', η: 'ηή', ι: 'ιίϊΐ', ο: 'οό', υ: 'υύϋΰ', ω: 'ωώ', σ: 'σς',
};

/** Lowercase, strip accents/diacritics, unify final sigma, collapse whitespace. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('el')
    .replace(/ς/g, 'σ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when two strings are the same text apart from case, accents, final sigma and spacing. */
export function sameText(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b);
}

function escapeRegex(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
}

/**
 * A RegExp that matches `text` regardless of case, Greek accents, final sigma and spacing.
 * Use it as a locator name when the exact DOM text is uncertain:
 *   page.getByRole('button', { name: looseName('ΑΝΑΖΗΤΗΣΗ') })  // matches "Αναζήτηση"
 * exact=true (default) anchors the whole accessible name; exact=false matches a substring.
 */
export function looseName(text: string, opts: { exact?: boolean } = {}): RegExp {
  const exact = opts.exact ?? true;
  const body = [...normalizeText(text)]
    .map(ch => {
      if (ch === ' ') return '\\s+';
      const variants = GREEK_VARIANTS[ch];
      return variants ? `[${variants}]` : escapeRegex(ch);
    })
    .join('');
  return new RegExp(exact ? `^\\s*${body}\\s*$` : body, 'iu');
}

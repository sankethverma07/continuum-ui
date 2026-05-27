/**
 * detectElementKind — classify any HTMLElement into one of the Continuum
 * skeleton archetypes, using semantic HTML, computed style, className
 * patterns (Tailwind/Material/Bootstrap/shadcn), and geometry as a fallback.
 *
 * Returns both a `kind` and a bag of metadata (font-size, font-weight,
 * line count, rect) so the skeleton renderer can match the element's
 * visual weight — a 48-px heading gets a thicker bar than a 12-px caption.
 */

export type SkeletonKind =
  | 'card'
  | 'button'
  | 'nav-item'
  | 'image'
  | 'text-line'
  | 'text-block'     // multi-line wrapped text (paragraph)
  | 'heading'
  | 'subheading'     // H4/H5/H6 or large body
  | 'caption'        // small type, meta, timestamps
  | 'floating'
  | 'avatar'
  | 'divider'        // thin horizontal rule
  | 'unknown';

export interface DetectMeta {
  readonly kind: SkeletonKind;
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly lineHeight: number;
  readonly lineCount: number;        // estimated rendered lines
  readonly borderRadius: number;
  readonly isInteractive: boolean;
  readonly confidence: number;       // 0–1, how sure the classifier is
}

export interface DetectOptions {
  readonly boundsOverride?: DOMRect;
  readonly cardBias?: boolean;
  /** Known design-system patterns to match against className. */
  readonly extraPatterns?: Record<SkeletonKind, readonly RegExp[]>;
}

// ---------------------------------------------------------------------------
// ClassName pattern library — captures common conventions across design
// systems. Order matters within each kind; first match wins.
// ---------------------------------------------------------------------------

const DEFAULT_PATTERNS: Record<SkeletonKind, readonly RegExp[]> = {
  card: [
    /\b(card|Card)\b/,
    /\bMuiCard\b/,                    // Material UI
    /\bMuiPaper-elevation[1-9]\b/,    // Material elevation paper
    /\bchakra-card\b/,                // Chakra UI
    /\bantd-card\b/,                  // Ant Design
    /\brounded-(xl|2xl|3xl)\b.*\bshadow-(md|lg|xl)\b/,  // Tailwind card convention
    /\bshadow-(lg|xl|2xl)\b.*\brounded/,
  ],
  button: [
    /\bbtn\b|\bbutton\b/,
    /\bMuiButton\b/,
    /\bchakra-button\b/,
    /\brounded-(full|lg|md)\b.*\bpx-(3|4|5|6)\b.*\bpy-/,
  ],
  'nav-item': [
    /\bnav-(item|link)\b/,
    /\bMuiMenuItem\b/,
  ],
  image: [
    /\bimg\b|\bimage\b|\bavatar-image\b|\bthumbnail\b/,
  ],
  avatar: [
    /\bavatar\b/,
    /\bMuiAvatar\b/,
    /\bchakra-avatar\b/,
  ],
  floating: [
    /\btooltip\b|\bpopover\b|\bdropdown\b|\bmenu\b|\bcontext-menu\b/,
    /\bMui(Tooltip|Popover|Menu|Popper)\b/,
  ],
  heading: [
    /\bheading\b|\btitle\b|\bh-hero\b/,
  ],
  subheading: [
    /\bsubtitle\b|\bsubheading\b|\bh-section\b/,
  ],
  caption: [
    /\bcaption\b|\bmeta\b|\btimestamp\b|\bhint\b|\beyebrow\b|\blabel\b(?!.*\binput)/,
  ],
  'text-line': [],
  'text-block': [
    /\bprose\b|\barticle-body\b|\bbody-text\b/,
  ],
  divider: [
    /\bdivider\b|\bseparator\b|\bhr\b/,
  ],
  unknown: [],
};

const matchesPattern = (
  className: string,
  kind: SkeletonKind,
  extra?: Record<SkeletonKind, readonly RegExp[]>,
): boolean => {
  const all = [
    ...(DEFAULT_PATTERNS[kind] ?? []),
    ...((extra && extra[kind]) ?? []),
  ];
  return all.some((r) => r.test(className));
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEXT_TAGS = new Set([
  'P', 'SPAN', 'LI', 'BLOCKQUOTE', 'DD', 'DT', 'LABEL',
  'FIGCAPTION', 'CITE', 'EM', 'STRONG', 'SMALL', 'MARK',
]);

const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA']);

const hasMostlyTextChildren = (el: HTMLElement): boolean => {
  // Return true if the element's direct children are predominantly text
  // nodes (not nested elements). This disambiguates "a paragraph of text"
  // from "a div containing other stuff."
  const children = Array.from(el.childNodes);
  if (children.length === 0) return (el.textContent ?? '').trim().length > 0;
  let textLen = 0;
  let elemLen = 0;
  for (const c of children) {
    if (c.nodeType === Node.TEXT_NODE) {
      textLen += (c.textContent ?? '').trim().length;
    } else if (c.nodeType === Node.ELEMENT_NODE) {
      const tag = (c as HTMLElement).tagName;
      // Inline-only tags inside a text block don't count as "other stuff".
      if (['EM', 'STRONG', 'SPAN', 'A', 'CODE', 'MARK', 'SMALL', 'CITE'].includes(tag)) {
        textLen += ((c as HTMLElement).textContent ?? '').trim().length;
      } else {
        elemLen += 1;
      }
    }
  }
  return textLen > 4 && elemLen === 0;
};

// ---------------------------------------------------------------------------
// Core classifier
// ---------------------------------------------------------------------------

export const detectElementKind = (
  el: HTMLElement,
  opts: DetectOptions = {},
): DetectMeta => {
  const rect = opts.boundsOverride ?? el.getBoundingClientRect();
  const { width, height } = rect;
  const aspect = width / Math.max(1, height);
  const style = getComputedStyle(el);

  const fontSize = parseFloat(style.fontSize) || 0;
  const fontWeight = Number(style.fontWeight) || 400;
  const lineHeight =
    style.lineHeight === 'normal'
      ? fontSize * 1.2
      : parseFloat(style.lineHeight) || fontSize * 1.2;
  const borderRadius = parseFloat(style.borderRadius) || 0;
  const hasShadow = style.boxShadow !== 'none' && style.boxShadow !== '';
  const hasBorder =
    style.borderWidth !== '0px' && style.borderStyle !== 'none';
  const className = (el.className && typeof el.className === 'string')
    ? el.className
    : '';
  const isRound = borderRadius >= Math.min(width, height) / 2 - 2;
  const isInteractive =
    INTERACTIVE_TAGS.has(el.tagName) ||
    el.getAttribute('role') === 'button' ||
    el.getAttribute('role') === 'link' ||
    style.cursor === 'pointer';
  const position = style.position;
  const isFloating =
    (position === 'absolute' || position === 'fixed') && (hasShadow || borderRadius > 4);
  const lineCount = Math.max(1, Math.round(height / Math.max(1, lineHeight)));

  const mk = (kind: SkeletonKind, confidence: number): DetectMeta => ({
    kind,
    width,
    height,
    fontSize,
    fontWeight,
    lineHeight,
    lineCount,
    borderRadius,
    isInteractive,
    confidence,
  });

  // 1. Semantic HTML — highest confidence.
  if (el.tagName === 'IMG' || el.tagName === 'PICTURE') return mk('image', 1);
  if (el.tagName === 'HR') return mk('divider', 1);
  if (el.tagName === 'H1' || el.tagName === 'H2' || el.tagName === 'H3') {
    return mk('heading', 1);
  }
  if (el.tagName === 'H4' || el.tagName === 'H5' || el.tagName === 'H6') {
    return mk('subheading', 0.95);
  }

  // 2. ClassName pattern match — strong signal from design systems.
  if (className) {
    for (const kind of [
      'card', 'floating', 'button', 'avatar',
      'nav-item', 'image', 'heading', 'subheading',
      'caption', 'text-block', 'divider',
    ] as const) {
      if (matchesPattern(className, kind, opts.extraPatterns)) {
        return mk(kind, 0.9);
      }
    }
  }

  // 3. Avatar geometry (perfect circle, small).
  if (isRound && width < 96 && height < 96 && Math.abs(aspect - 1) < 0.12) {
    return mk('avatar', 0.9);
  }

  // 4. Floating UI.
  if (isFloating && width < 420 && height < 360) return mk('floating', 0.85);

  // 5. Interactive elements — buttons + links + inputs.
  if (isInteractive && width < 280 && height < 72) {
    return mk('button', 0.85);
  }

  // 6. Nav items — inside a nav/header, modest size.
  const insideNav =
    el.closest('nav') ||
    el.closest('header') ||
    el.closest('[role="navigation"]');
  if (insideNav && height < 52 && width < 240) {
    return mk('nav-item', 0.85);
  }

  // 7. Text detection via font metrics + text-heavy content.
  if (TEXT_TAGS.has(el.tagName) && hasMostlyTextChildren(el)) {
    // Multi-line wrapped text becomes a text-block (paragraph).
    if (lineCount >= 2) {
      // Further classify by font metrics:
      if (fontSize >= 22 || fontWeight >= 600) {
        // Large + wrapped = heading that wraps (rare but possible).
        return mk('heading', 0.8);
      }
      return mk('text-block', 0.85);
    }
    // Single line — classify by size.
    if (fontSize >= 24) return mk('heading', 0.85);
    if (fontSize >= 18) return mk('subheading', 0.8);
    if (fontSize <= 12) return mk('caption', 0.75);
    return mk('text-line', 0.8);
  }

  // 8. Thin + wide = divider.
  if (height <= 2 && width > 80) return mk('divider', 0.9);

  // 9. Image by background.
  if (style.backgroundImage !== 'none' && aspect > 0.4 && aspect < 3.5) {
    return mk('image', 0.75);
  }

  // 10. Card-like boxes.
  const looksCardy =
    (hasShadow || hasBorder || borderRadius > 6) &&
    width > 160 && height > 100 &&
    aspect > 0.35 && aspect < 3.8;
  if (looksCardy) return mk('card', 0.75);

  // 11. Low-confidence text fallback — element has text content, no other hints.
  if ((el.textContent ?? '').trim().length > 0 && aspect > 3 && height < 64) {
    return mk('text-line', 0.6);
  }

  // 12. Final fallbacks.
  if (opts.cardBias && width > 120 && height > 80) {
    return mk('card', 0.5);
  }
  return mk('unknown', 0.3);
};

/** Convenience: just return the kind string. */
export const detectKind = (el: HTMLElement, opts?: DetectOptions): SkeletonKind =>
  detectElementKind(el, opts).kind;

// ---------------------------------------------------------------------------
// Batch classification — walks a subtree and returns a kind per element.
// ---------------------------------------------------------------------------

export const detectAllKinds = (
  root: HTMLElement,
  opts: DetectOptions = {},
): Map<HTMLElement, DetectMeta> => {
  const result = new Map<HTMLElement, DetectMeta>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode as HTMLElement | null;
  while (node) {
    const el = node as HTMLElement;
    if (!el.hasAttribute('data-continuum-skeleton')) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 20 && rect.height > 10) {
        const meta = detectElementKind(el, { ...opts, boundsOverride: rect });
        if (meta.kind !== 'unknown') result.set(el, meta);
      }
    }
    node = walker.nextNode() as HTMLElement | null;
  }
  return result;
};

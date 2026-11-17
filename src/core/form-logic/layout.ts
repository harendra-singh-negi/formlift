// The layout: which pages are shown in which order, and what the admin drew on them.

import { resolveLimits, type Limits } from './limits';
import type { Position } from './model';
import { inUnit } from './validate';

// ---------- layout: pages and the admin's own content on them ----------
// The original PDF is never changed. A version's layout says which pages are shown in which order (original
// pages and blank ones), and what the admin drew on them: text (new, or replacing a line of the original),
// boxes and lines. Positions are page fractions like fields; sizes in points (1/72 inch) of the page.

/** `source` = page number in the original PDF, null = blank page. width / height in points. */
export interface LayoutPage {
  source: number | null;
  width: number;
  height: number;
}

export const FONTS = ['sans', 'serif', 'mono'] as const;
export type FontName = (typeof FONTS)[number];

export interface LayoutElement {
  id: string;
  type: 'text' | 'box' | 'line';
  page: number; // 1-based, in layout.pages
  position: Omit<Position, 'page'>;
  /** text */
  text?: string;
  fontSize?: number; // points
  font?: FontName;
  bold?: boolean;
  italic?: boolean;
  color?: string; // #rrggbb
  align?: 'left' | 'center' | 'right';
  /** Background (text, box). '#ffffff' covers what the original shows there. */
  fill?: string;
  /** Border (box) or the line itself. */
  stroke?: string;
  strokeWidth?: number; // points
  /** The original line this text replaces (kept for reference). */
  replaces?: string;
}

export interface Layout {
  pages: LayoutPage[];
  elements: LayoutElement[];
}


const COLOR = /^#[0-9a-f]{6}$/i;

/** The layout of an untouched document: every original page once, in order, nothing drawn. */
export const defaultLayout = (sizes: { width: number; height: number }[]): Layout => ({
  pages: sizes.map((s, i) => ({ source: i + 1, width: s.width, height: s.height })),
  elements: [],
});

/** Problems in a layout; empty = fine. `pageCount` = pages of the original PDF. */
export function validateLayout(layout: unknown, pageCount: number, limits?: Partial<Limits>): string[] {
  const { maxPages, maxElements, maxElementText } = resolveLimits(limits);
  const l = layout as Layout;
  if (!l || typeof l !== 'object' || !Array.isArray(l.pages) || !Array.isArray(l.elements))
    return ['layout must have pages and elements'];
  if (!l.pages.length) return ['The document needs at least one page'];
  if (l.pages.length > maxPages) return [`At most ${maxPages} pages`];
  if (l.elements.length > maxElements) return [`At most ${maxElements} text/box/line items`];
  const errors: string[] = [];
  l.pages.forEach((p, i) => {
    const okSource = p?.source === null || (Number.isInteger(p?.source) && p.source! >= 1 && p.source! <= pageCount);
    const okSize = [p?.width, p?.height].every((n) => typeof n === 'number' && n >= 72 && n <= 5000);
    if (!okSource || !okSize) errors.push(`Page ${i + 1}: invalid source page or size`);
  });
  const ids = new Set<string>();
  for (const e of l.elements) {
    const name = `Item on page ${e?.page ?? '?'}`;
    if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !e.id || ids.has(e.id)) {
      errors.push(`${name}: missing or duplicate id`);
      continue;
    }
    ids.add(e.id);
    if (!['text', 'box', 'line'].includes(e.type)) errors.push(`${name}: unknown type`);
    if (!Number.isInteger(e.page) || e.page < 1 || e.page > l.pages.length) errors.push(`${name}: page does not exist`);
    const p = e.position;
    if (!p || ![p.x, p.y, p.width, p.height].every(inUnit) || p.x + p.width > 1.0001 || p.y + p.height > 1.0001)
      errors.push(`${name}: position must lie inside the page`);
    if (e.text != null && (typeof e.text !== 'string' || e.text.length > maxElementText)) errors.push(`${name}: text too long`);
    if (e.replaces != null && (typeof e.replaces !== 'string' || e.replaces.length > maxElementText))
      errors.push(`${name}: invalid original text`);
    if (e.fontSize != null && !(typeof e.fontSize === 'number' && e.fontSize >= 3 && e.fontSize <= 144))
      errors.push(`${name}: font size must be 3–144`);
    if (e.strokeWidth != null && !(typeof e.strokeWidth === 'number' && e.strokeWidth >= 0 && e.strokeWidth <= 20))
      errors.push(`${name}: line width must be 0–20`);
    if (e.font != null && !FONTS.includes(e.font)) errors.push(`${name}: unknown font`);
    if (e.align != null && !['left', 'center', 'right'].includes(e.align)) errors.push(`${name}: unknown alignment`);
    for (const c of [e.color, e.fill, e.stroke])
      if (c != null && !COLOR.test(c)) errors.push(`${name}: colours must be #rrggbb`);
  }
  return errors.slice(0, 20);
}

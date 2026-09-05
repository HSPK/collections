export const PAGE_COUNT = 8;
export const THEME_IDS = ['red-letter', 'field-notes', 'carbon-copy'] as const;
export type ThemeId = typeof THEME_IDS[number];
export type PaperId = 'a4' | 'letter';
export type TextFace = 'title' | 'heading' | 'body' | 'label';

export interface Panel {
  heading: string;
  body: string;
}

export interface ZineDocument {
  version: 1;
  title: string;
  theme: ThemeId;
  paper: PaperId;
  pages: Panel[];
}

export interface Theme {
  id: ThemeId;
  name: string;
  description: string;
  ink: string;
  accent: string;
  artwork: 'burst' | 'leaf' | 'orbit';
  titleFont: string;
  bodyFont: string;
}

export const PAPERS = {
  a4: { name: 'A4', width: 297, height: 210 },
  letter: { name: 'US Letter', width: 279.4, height: 215.9 },
} as const;

export const LIMITS = {
  title: 60,
  heading: 44,
  body: 360,
  coverBody: 180,
  backBody: 240,
} as const;

export const MIN_BODY_MM = 3.25;
export const MM_PER_PT = 25.4 / 72;

// This net walks around the sheet's outside edge: 1 → 2 → … → 8.
// The half-turn on the top row makes every page upright after the long fold.
export const IMPOSITION = [
  { page: 5, column: 0, row: 0, rotation: 180 },
  { page: 4, column: 1, row: 0, rotation: 180 },
  { page: 3, column: 2, row: 0, rotation: 180 },
  { page: 2, column: 3, row: 0, rotation: 180 },
  { page: 6, column: 0, row: 1, rotation: 0 },
  { page: 7, column: 1, row: 1, rotation: 0 },
  { page: 8, column: 2, row: 1, rotation: 0 },
  { page: 1, column: 3, row: 1, rotation: 0 },
] as const;

const characters = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const words = new Intl.Segmenter(undefined, { granularity: 'word' });

export function graphemes(text: string): string[] {
  return Array.from(characters.segment(text), (item) => item.segment);
}

export function characterCount(text: string): number {
  return graphemes(text).length;
}

export function wordCount(text: string): number {
  return Array.from(words.segment(text)).filter((item) => item.isWordLike).length;
}

export function bodyLimit(pageIndex: number): number {
  return pageIndex === 0 ? LIMITS.coverBody : pageIndex === 7 ? LIMITS.backBody : LIMITS.body;
}

export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

export function isXmlText(text: string): boolean {
  for (const character of text) {
    const point = character.codePointAt(0)!;
    if (
      point !== 9 && point !== 10 && point !== 13 &&
      !(point >= 0x20 && point <= 0xd7ff) &&
      !(point >= 0xe000 && point <= 0xfffd) &&
      !(point >= 0x10000 && point <= 0x10ffff)
    ) return false;
  }
  return true;
}

export interface ValidationIssue {
  field: 'document' | 'title' | 'heading' | 'body';
  page?: number;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasDocumentShape(value: unknown): value is ZineDocument {
  return isRecord(value) && value.version === 1
    && THEME_IDS.some((theme) => theme === value.theme)
    && (value.paper === 'a4' || value.paper === 'letter')
    && Array.isArray(value.pages) && value.pages.length === PAGE_COUNT
    && typeof value.title === 'string'
    && value.pages.every((item: unknown) => isRecord(item)
      && typeof item.heading === 'string' && typeof item.body === 'string');
}

export function isZineDocument(value: unknown): value is ZineDocument {
  return hasDocumentShape(value) && validateDocument(value).length === 0;
}

export function validateDocument(value: unknown): ValidationIssue[] {
  if (!hasDocumentShape(value)) {
    return [{ field: 'document', message: 'This draft needs a title, a supported paper and style, and exactly eight text pages.' }];
  }
  const document = value;
  const issues: ValidationIssue[] = [];
  const check = (text: string, limit: number, field: ValidationIssue['field'], name: string, page?: number) => {
    let message = '';
    if (!isXmlText(text)) {
      message = `${name} contains an unsupported control character. Remove it before saving or exporting.`;
    } else if (text.length > limit * 16) {
      message = `${name} exceeds the complex-character safety limit (${limit * 16} UTF-16 units). Simplify long combining sequences.`;
    } else if (characterCount(text) > limit) {
      message = `${name} is over ${limit} characters. Nothing has been cut off; shorten it to save and export.`;
    } else if (field !== 'body' && /[\r\n\t]/u.test(text)) {
      message = `${name} must be a single line; it will wrap automatically on the page.`;
    }
    if (message) issues.push({ field, page, message });
  };
  if (!document.title.trim()) issues.push({ field: 'title', message: 'Give your zine a title before saving or exporting.' });
  check(document.title, LIMITS.title, 'title', 'The zine title');
  document.pages.forEach((panel, index) => {
    check(panel.heading, LIMITS.heading, 'heading', `Page ${index + 1} heading`, index);
    check(panel.body, bodyLimit(index), 'body', `Page ${index + 1} text`, index);
  });
  return issues;
}

export function cloneDocument(document: ZineDocument): ZineDocument {
  return { ...document, pages: document.pages.map((panel) => ({ ...panel })) };
}

export function sheetGeometry(paper: PaperId) {
  const { width, height } = PAPERS[paper];
  return {
    width,
    height,
    pageWidth: width / 4,
    pageHeight: height / 2,
    cut: { x1: width / 4, x2: width * 3 / 4, y: height / 2 },
    verticalFolds: [width / 4, width / 2, width * 3 / 4],
  };
}

export interface WrappedLine {
  text: string;
  hardBreak: boolean;
}

export type MeasureText = (text: string, fontSize: number, face: TextFace, theme: Theme) => number;

export function fontFor(face: TextFace, theme: Theme): string {
  return face === 'body' ? theme.bodyFont
    : face === 'label' ? 'Arial, Helvetica, sans-serif' : theme.titleFont;
}

export const estimateText: MeasureText = (text, size) => {
  let width = 0;
  for (const character of graphemes(text)) {
    if (/^\t$/u.test(character)) width += 1.4;
    else if (/^\s$/u.test(character)) width += 0.35;
    else if (/^[ilI.,'!:;|]$/u.test(character)) width += 0.34;
    else if (/^[MW@%]$/u.test(character)) width += 0.98;
    else if (/^[\u0020-\u024f]$/u.test(character)) width += 0.64;
    else width += 1.1;
  }
  return width * size;
};

export function canvasMeasurer(context: CanvasRenderingContext2D): MeasureText {
  const cache = new Map<string, number>();
  return (text, size, face, theme) => {
    const weight = face === 'body' || face === 'label' ? 400 : 700;
    const font = `${weight} ${size * 10}px ${fontFor(face, theme)}`;
    const key = `${font}\u0000${text}`;
    const existing = cache.get(key);
    if (existing !== undefined) return existing;
    context.font = font;
    const width = context.measureText(text.replace(/\t/g, '    ')).width / 10;
    if (cache.size > 12000) cache.clear();
    cache.set(key, width);
    return width;
  };
}

// Whitespace is retained, including hard line breaks. Only over-wide tokens
// are split, and only between complete graphemes (never inside an emoji).
export function wrapText(text: string, width: number, measure: (text: string) => number): WrappedLine[] {
  if (!(width > 0) || !Number.isFinite(width)) throw new Error('Text needs a positive, finite line width.');
  if (text === '') return [];
  const lines: WrappedLine[] = [];
  const paragraphs = normalizeNewlines(text).split('\n');
  paragraphs.forEach((paragraph, paragraphIndex) => {
    let line = '';
    const flush = () => {
      lines.push({ text: line, hardBreak: false });
      line = '';
    };
    const appendLongToken = (token: string) => {
      for (const character of graphemes(token)) {
        if (line && measure(line + character) > width) flush();
        line += character;
      }
    };
    for (const token of paragraph.match(/\s+|\S+/gu) ?? []) {
      if (measure(line + token) <= width) {
        line += token;
      } else if (/\S/u.test(token)) {
        if (line) flush();
        if (measure(token) <= width) line = token;
        else appendLongToken(token);
      } else {
        appendLongToken(token);
      }
    }
    lines.push({ text: line, hardBreak: paragraphIndex < paragraphs.length - 1 });
  });
  return lines;
}

export interface TextBlock {
  face: TextFace;
  field: 'title' | 'heading' | 'body';
  lines: WrappedLine[];
  fontSize: number;
  lineHeight: number;
  height: number;
  x: number;
  y: number;
  widths: number[];
}

function fitText(
  text: string, width: number, height: number, min: number, max: number,
  leading: number, face: TextFace, theme: Theme, measure: MeasureText,
): Omit<TextBlock, 'x' | 'y' | 'field'> | null {
  const atSize = (fontSize: number) => {
    const lines = wrapText(text, width, (line) => measure(line, fontSize, face, theme));
    const widths = lines.map((line) => measure(line.text, fontSize, face, theme));
    const lineHeight = fontSize * leading;
    const result = { face, lines, widths, fontSize, lineHeight, height: lines.length * lineHeight };
    return result.height <= height + 0.001 && widths.every((item) => item <= width + 0.001) ? result : null;
  };
  let best = atSize(min);
  if (!best) return null;
  const largest = atSize(max);
  if (largest) return largest;
  let low = min;
  let high = max;
  for (let attempt = 0; attempt < 9; attempt++) {
    const middle = (low + high) / 2;
    const candidate = atSize(middle);
    if (candidate) {
      low = middle;
      best = candidate;
    } else high = middle;
  }
  return best;
}

export interface PageLayout {
  number: number;
  width: number;
  height: number;
  blocks: TextBlock[];
  art: { x: number; y: number; width: number; height: number };
  bodyPoints: number;
}

class PageFitError extends Error {
  constructor(readonly field: 'title' | 'heading' | 'body', message: string) {
    super(message);
  }
}

export function layoutPage(
  document: ZineDocument, pageIndex: number, theme: Theme, measure: MeasureText = estimateText,
): PageLayout {
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= PAGE_COUNT) throw new Error('Choose a page from 1 to 8.');
  const { pageWidth: width, pageHeight: height } = sheetGeometry(document.paper);
  const panel = document.pages[pageIndex]!;
  const margin = 6;
  const textWidth = width - margin * 2;
  const bottom = height - 12;
  const blocks: TextBlock[] = [];
  let cursor = 16;

  if (pageIndex === 0 && panel.heading) {
    const subtitle = fitText(panel.heading, textWidth, 10, 2.9, 3.35, 1.2, 'label', theme, measure);
    if (!subtitle) throw new PageFitError('heading', 'The cover subtitle needs fewer words or a shorter unbroken character sequence.');
    blocks.push({ ...subtitle, x: margin, y: cursor, field: 'heading' });
    cursor += subtitle.height + 3;
  }

  const title = pageIndex === 0 ? document.title : panel.heading;
  const titleFace = pageIndex === 0 ? 'title' : 'heading';
  const heading = fitText(title, textWidth, pageIndex === 0 ? 30 : 22, 3.9, pageIndex === 0 ? 10 : 6.7, 1.08, titleFace, theme, measure);
  if (!heading) throw new PageFitError(pageIndex === 0 ? 'title' : 'heading', `Page ${pageIndex + 1} heading will not fit. Shorten it; no text has been removed.`);
  if (title) blocks.push({ ...heading, x: margin, y: cursor, field: pageIndex === 0 ? 'title' : 'heading' });
  cursor += heading.height + 3;

  const minimumArt = 8;
  const bodyRoom = bottom - cursor - minimumArt - 4;
  const body = fitText(normalizeNewlines(panel.body), textWidth, bodyRoom, MIN_BODY_MM, 4, 1.28, 'body', theme, measure);
  if (!body) throw new PageFitError('body', `Page ${pageIndex + 1} text will not fit at readable print size. Shorten it or remove some line breaks; all your text is still in the editor.`);
  const desiredArt = panel.body ? (pageIndex === 0 || pageIndex === 7 ? 25 : 18) : 39;
  const artHeight = Math.max(minimumArt, Math.min(desiredArt, bottom - cursor - body.height - 4));
  const art = { x: margin, y: cursor, width: textWidth, height: artHeight };
  if (panel.body) blocks.push({ ...body, x: margin, y: cursor + artHeight + 4, field: 'body' });
  return { number: pageIndex + 1, width, height, blocks, art, bodyPoints: body.fontSize / MM_PER_PT };
}

export function analyzeDocument(document: ZineDocument, theme: Theme, measure: MeasureText = estimateText) {
  const issues = validateDocument(document);
  const layouts: (PageLayout | null)[] = Array.from({ length: PAGE_COUNT }, () => null);
  if (issues.length) return { issues, layouts };
  for (let index = 0; index < PAGE_COUNT; index++) {
    try {
      layouts[index] = layoutPage(document, index, theme, measure);
    } catch (error) {
      if (!(error instanceof PageFitError)) throw error;
      issues.push({ field: error.field, page: index, message: error.message });
    }
  }
  return { issues, layouts };
}

export function number(value: number): string {
  return (Math.round(value * 1000) / 1000).toString();
}

export function filenameFor(document: ZineDocument): string {
  const slug = document.title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 70).replace(/-$/g, '');
  return `${slug || 'my-zine'}-${document.paper}-8-page.svg`;
}
export { escapeMarkup as escapeXml } from '../../core/page';

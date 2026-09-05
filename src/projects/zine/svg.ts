import {
  IMPOSITION, PAPERS, analyzeDocument, escapeXml, fontFor, number, sheetGeometry,
  type MeasureText, type PageLayout, type Theme, type ZineDocument,
} from './engine';
import { artwork } from './artwork';

function pageMarkup(layout: PageLayout, theme: Theme): string {
  const n = number;
  const pageNumber = String(layout.number).padStart(2, '0');
  const blocks = layout.blocks.map((block) => {
    const color = block.face === 'title' ? theme.accent : theme.ink;
    return `<g data-field="${block.field}" font-family="${escapeXml(fontFor(block.face, theme))}" font-size="${n(block.fontSize)}" font-weight="${block.face === 'title' || block.face === 'heading' ? '700' : '400'}" fill="${color}">${block.lines.map((line, index) => {
      // Explicit per-line lengths keep fallback system fonts inside the same
      // physical measure when the SVG is opened on a different computer.
      const length = block.widths[index]! > 0
        ? ` textLength="${n(block.widths[index]!)}" lengthAdjust="spacingAndGlyphs"` : '';
      return `<text x="${n(block.x)}" y="${n(block.y + block.fontSize + block.lineHeight * index)}"${length} data-break="${line.hardBreak ? 'hard' : 'soft'}" xml:space="preserve" style="white-space:pre">${escapeXml(line.text)}</text>`;
    }).join('')}</g>`;
  }).join('');
  return `<path d="M 6 11 h ${n(layout.width - 12)}" stroke="${theme.ink}" stroke-width=".35"/>
    <text x="6" y="8.5" font-family="Arial, Helvetica, sans-serif" font-size="2.3" letter-spacing=".45" fill="${theme.ink}">POCKET EDITION</text>
    ${blocks}
    <g transform="translate(${n(layout.art.x)} ${n(layout.art.y)})">${artwork(theme, layout.number, layout.art.width, layout.art.height)}</g>
    <path d="M 6 ${n(layout.height - 9)} h ${n(layout.width - 12)}" stroke="${theme.ink}" stroke-width=".25"/>
    <text x="6" y="${n(layout.height - 5.5)}" font-family="Arial, Helvetica, sans-serif" font-size="2.4" fill="${theme.ink}">${pageNumber}</text>
    <text x="${n(layout.width - 6)}" y="${n(layout.height - 5.5)}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="2.2" fill="${theme.ink}">${layout.number === 1 ? 'COVER' : layout.number === 8 ? 'BACK COVER' : 'KEEP READING'}</text>`;
}

export interface SheetOptions {
  guides?: boolean;
  measure?: MeasureText;
}

export function makeSheetSvg(document: ZineDocument, theme: Theme, options: SheetOptions = {}): string {
  const { issues, layouts } = analyzeDocument(document, theme, options.measure);
  if (issues.length) throw new Error(issues.map((issue) => issue.message).join(' '));
  const geometry = sheetGeometry(document.paper);
  const { width, height, pageWidth, pageHeight, cut } = geometry;
  const n = number;
  const pages = IMPOSITION.map((slot) => {
    const x = slot.column * pageWidth;
    const y = slot.row * pageHeight;
    return `<g data-page="${slot.page}" data-rotation="${slot.rotation}" transform="translate(${n(x)} ${n(y)}) rotate(${slot.rotation} ${n(pageWidth / 2)} ${n(pageHeight / 2)})">${pageMarkup(layouts[slot.page - 1]!, theme)}</g>`;
  }).join('\n');
  const guides = options.guides ? `
    <g id="fold-guides" fill="none" stroke="#807970" stroke-width=".22" stroke-dasharray="1.5 1.5">
      ${geometry.verticalFolds.map((x) => `<path d="M ${n(x)} 0 V ${n(height)}"/>`).join('')}
      <path d="M 0 ${n(cut.y)} H ${n(width)}"/>
    </g>
    <g id="cut-guide" fill="none" stroke="#ce3825" stroke-width=".5">
      <path d="M ${n(cut.x1)} ${n(cut.y)} H ${n(cut.x2)}"/>
      <path d="M ${n(cut.x1)} ${n(cut.y - 1.4)} v 2.8 M ${n(cut.x2)} ${n(cut.y - 1.4)} v 2.8"/>
    </g>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${n(width)}mm" height="${n(height)}mm" viewBox="0 0 ${n(width)} ${n(height)}" role="img" aria-labelledby="sheet-title sheet-description">
  <title id="sheet-title">${escapeXml(document.title)} — ${PAPERS[document.paper].name} eight-page zine</title>
  <desc id="sheet-description">Single-sided landscape sheet. Print at 100% actual size, no fit or shrink. Top row: 5, 4, 3, 2 rotated 180 degrees. Bottom row: 6, 7, 8, 1 upright. Crease a four-column, two-row grid. Cut the horizontal center crease only between the quarter and three-quarter marks. Fold long edges together with ink outside, push the short ends inward, and collapse the cross with page 1 in front and page 8 behind. ${options.guides ? 'Dashed gray lines are folds; the solid red line is the only cut.' : 'Fold and cut guides are omitted.'}</desc>
  <metadata id="zine-document">${escapeXml(JSON.stringify(document))}</metadata>
  <rect width="${n(width)}" height="${n(height)}" fill="#ffffff"/>
  ${pages}
  ${guides}
</svg>`;
}

import { escapeMarkup } from '../../core/page';
import { HARMONY_INFO, ROLE_INFO } from './data';
import { contrastGrade, contrastRatio, cookPalette, isRecipeName, readableInk, ROLES } from './engine';
import type { KitchenState } from './engine';

export function paletteCss(state: KitchenState): string {
  const palette = cookPalette(state);
  return [
    '/* Palette Kitchen | sRGB colors, with readable black/white ink. */',
    ':root {',
    ...ROLES.map((role) => `  --palette-${role}: ${palette[role]};`),
    '',
    ...ROLES.map((role) => `  --palette-on-${role}: ${readableInk(palette[role])};`),
    '}',
    '',
  ].join('\n');
}

export function paletteSvg(state: KitchenState, name: string): string {
  const palette = cookPalette(state);
  const recipeName = name.trim() || 'A fresh color recipe';
  if (!isRecipeName(recipeName)) throw new RangeError('Use a recipe name of up to 48 printable characters.');
  const title = escapeMarkup(recipeName);
  const chips = ROLES.map((role, index) => {
    const color = palette[role];
    const foreground = readableInk(color);
    const black = contrastRatio(color, '#000000');
    const white = contrastRatio(color, '#ffffff');
    const x = 64 + index * 254.4;
    return `<g>
      <rect x="${x}" y="224" width="254.4" height="336" fill="${color}"/>
      <text x="${x + 20}" y="263" fill="${foreground}" font-size="16">${index + 1} / ${ROLE_INFO[role].short.toUpperCase()}</text>
      <text x="${x + 20}" y="421" fill="${foreground}" font-family="Georgia,serif" font-size="106">Aa</text>
      <text x="${x + 20}" y="526" fill="${foreground}" font-family="monospace" font-size="24">${color.toUpperCase()}</text>
      <text x="${x + 12}" y="606" font-size="17">${ROLE_INFO[role].name}</text>
      <text x="${x + 12}" y="640" font-size="15">Black ${black.toFixed(2)}:1 / ${contrastGrade(black)}</text>
      <text x="${x + 12}" y="666" font-size="15">White ${white.toFixed(2)}:1 / ${contrastGrade(white)}</text>
    </g>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="910" viewBox="0 0 1400 910" role="img" aria-labelledby="title description">
  <title id="title">${title} - Palette Kitchen</title>
  <desc id="description">Five sRGB colors with real WCAG contrast ratios against black and white.</desc>
  <rect width="1400" height="910" fill="#f4eee3"/>
  <g fill="#302b27" font-family="Arial,sans-serif">
    <text x="64" y="63" font-size="15" letter-spacing="3">PALETTE KITCHEN / RECIPE CARD</text>
    <text x="64" y="125" font-family="Georgia,serif" font-size="52">Good color, from scratch.</text>
    <path d="M64 151H1336" stroke="#302b27"/>
    <text x="64" y="194" font-size="24">${title}</text>
    ${chips}
    <path d="M64 709H1336" stroke="#302b27"/>
    <text x="64" y="746" font-size="18">${HARMONY_INFO[state.settings.harmony].name} | Spice ${state.settings.spice}% | Paper warmth ${state.settings.warmth}</text>
    <text x="64" y="777" font-size="17">WCAG 2 sRGB luminance. Normal text: AA 4.5:1, AAA 7:1. Large text: AA 3:1.</text>
    <rect x="64" y="809" width="1272" height="52" fill="${palette.paper}"/>
    <text x="84" y="843" fill="${palette.ink}" font-size="21">Your ink on your paper. ${contrastRatio(palette.ink, palette.paper).toFixed(2)}:1 / ${contrastGrade(contrastRatio(palette.ink, palette.paper))}</text>
  </g>
</svg>`;
}

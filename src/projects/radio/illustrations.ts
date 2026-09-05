import { escapeMarkup } from '../../core/page';
import { stations } from './data';
import type { Station, StationId } from './data';

export const antenna = `<svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <path d="M16 53h32M23 53l9-36 9 36M25 43h14M27 34h10M32 17V8M20 10a18 18 0 0 0 0 21M44 10a18 18 0 0 1 0 21M13 4a27 27 0 0 0 0 33M51 4a27 27 0 0 1 0 33" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="32" cy="13" r="3" fill="currentColor"/>
</svg>`;

export const logbook = `<svg viewBox="0 0 160 120" fill="none" aria-hidden="true">
  <path d="m21 19 90-5 8 91-91 6-7-92Z" fill="#eee1bd" stroke="currentColor" stroke-width="1.6"/>
  <path d="m36 18 7 91M49 38l47-3M50 49l35-2M51 60l44-3M53 83l25-2M19 32l11-1M20 48l11-1M22 64l10-1M23 80l11-1M24 96l11-1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <path d="m124 22 10 3-22 66-9 10-1-14 22-65Z" fill="#a3452b" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="m102 87 10 4M126 28l-20 59M116 17l12-1" stroke="currentColor" stroke-width="1.6"/>
</svg>`;

const glyphs: Record<StationId, string> = {
  laundromat: '<rect x="13" y="9" width="38" height="47" rx="3"/><path d="M13 20h38M20 14h10M43 14h1"/><circle cx="32" cy="37" r="12"/><path d="M23 40c4-7 11 6 18-4"/>',
  library: '<path d="M9 14c10-3 17 0 23 5 6-5 13-8 23-5v34c-10-3-17 0-23 5-6-5-13-8-23-5V14Zm23 5v34M15 27l10 2M39 28l10-2M15 36l10 2M39 37l10-2"/><path d="M7 57c8-5 10 5 18 0s10 5 18 0 10 5 16 0"/>',
  orbit: '<ellipse cx="32" cy="33" rx="28" ry="12" transform="rotate(-29 32 33)"/><circle cx="32" cy="33" r="15"/><path d="M23 24c8 2 4 8 13 8s2 10 9 11M22 42l9-1-1 6"/><path d="m46 9 7 4-4 7-7-4 4-7Z"/>',
  orchard: '<path d="M30 56V26M30 37l-13-8M30 42l15-12M7 56h48"/><path d="M16 31C-1 27 8 12 19 15c1-15 20-12 22-2 16-1 21 17 6 21M43 37v9m-5 0h10l-2 7h-6l-2-7Z"/><path d="M5 43h11M49 7h10"/>',
};

export function stationGlyph(id: StationId): string {
  return `<svg class="radio-station-glyph" viewBox="0 0 64 64" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${glyphs[id]}</svg>`;
}

const scenes: Record<StationId, string> = {
  laundromat: `
    <path d="M17 157h288M24 32h175v125H24zM30 40h163M91 40v117M145 40v117" />
    <path d="M34 50h46v92H34zM100 50h36v92h-36zM154 50h36v92h-36z" fill="#ece0bc"/>
    <path d="M34 66h46M100 66h36M154 66h36M43 56h13M107 56h12M161 56h11"/>
    <circle cx="57" cy="102" r="17"/><circle cx="118" cy="102" r="13"/><circle cx="172" cy="102" r="13"/>
    <path d="M42 108c11-15 17 9 30-7M106 103c8-8 10 7 24-2M159 106c8-13 13 5 25-8M38 146v11M77 146v11"/>
    <path d="M231 110h46v7h-46zM235 117l-5 40M274 117l7 40M237 110V73h34v37M238 87h32"/>
    <path d="M211 43h80v17h-80zM218 50h20M246 50h36M210 141h22l-3 12h-16l-3-12Z"/>
    <path d="M220 81v13M220 107v9M220 128v4M16 27l184-6M22 166h268"/>
    <path d="m56 9-3 11m53-13-3 11m56-13-3 11m55-11-3 11m56-9-3 11" opacity=".45"/>`,
  library: `
    <path d="M18 151h289M26 29h149v122H26zM36 37h129v56H36zM99 37v56M37 65h128"/>
    <path d="M185 28h106v123H185zM192 65h92M192 104h92M198 37v25h9V37zM212 35v27h12V35zM229 41v21h8V41zM245 35l9 27 9-3-9-27Z"/>
    <path d="M198 75v26h10V75zM216 72v29h12V72zM235 77v24h8V77zM250 73v28h10V73zM267 78v23h10V78z"/>
    <path d="M55 116h101v6H55zM63 122v29M147 122v29M102 114V89m-14 0h28l-7-13H95l-7 13ZM77 112c7-5 12-5 20-2 7-3 13-3 19 0"/>
    <path d="M43 52c7-7 14 8 24 0s15 7 25 0M107 78l12-5-1 9-11-4Zm18 0h11M40 137h10v14H40M35 132h20v5H35"/>
    <path d="M55 83c3-5 10-5 14 0M52 79l-5-5m8 4-1-7m12 7 1-7m3 8 6-5M199 120h68"/>
    <circle cx="145" cy="48" r="3"/><circle cx="155" cy="40" r="2"/><path d="M19 163h282"/>`,
  orbit: `
    <path d="M22 21h270v131H22zM28 27h258v119H28zM39 37h124v76H39z"/>
    <path d="M47 105c22-62 81-59 108 0" fill="#ece0bc"/><path d="M58 85c16 6 13-10 31-2s13 7 29 1 20 3 29 8M72 101c7-7 18 2 25-4M137 48l5 5-5 5-5-5 5-5Z"/>
    <path d="M180 44h88v56h-88zM187 52h74M188 66h25M188 76h46M188 87h17M213 87h23M247 65v22"/>
    <path d="M65 124h151v7H65zM75 131v15M209 131v15M108 124v-15h19v15M128 112h6v7h-6M119 124c13 12 27 16 38 7"/>
    <path d="M225 114h47v32h-47zM225 122h47M247 114v32M239 136h17M243 132l4-4 4 4"/>
    <path d="m62 52 2 2m41-9 2 2m15 22 2 2M31 161h253M191 109l5 1-1 7-5-1 1-7Z"/>
    <path d="M246 111V94m0 7c-8-1-10-9-4-9m4 14c8-1 12-8 6-10"/>`,
  orchard: `
    <path d="M13 151h294M12 142c42-14 72 5 110-1s89-14 115-2 50-1 70-1M29 114V24h17v113M45 42h255M45 92h255"/>
    <path d="M102 143V67m0 20L76 64m26 36 26-27M81 73C50 71 58 35 82 38c4-28 38-29 47-4 31-4 42 34 13 45" fill="#ece0bc"/>
    <path d="M210 145V68m0 16-17-19m17 36 24-32M192 75c-30-8-19-42 5-36 1-24 30-30 41-6 31-2 39 32 13 41"/>
    <path d="M133 75v26m-8 0h17l-4 15h-10l-3-15ZM238 70v20m-8 0h17l-4 14h-10l-3-14Z"/>
    <path d="M264 109v38m28-33v30M264 114l28 5M264 136l28-3M273 139l13 8h-19l6-8Z"/>
    <path d="M15 19h20M150 23h26M270 68h29M13 70h27M164 118h16v20h-16zM180 122h6v9h-6M52 163h224"/>`,
};

export function stationSketch(station: Station): string {
  return `<svg class="radio-scene" viewBox="0 0 320 180" role="img" aria-label="${escapeMarkup(station.sketchCaption)}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${scenes[station.id]}</svg>`;
}

export function dialPosition(index: number): number {
  return 45 + index * (510 / Math.max(1, stations.length - 1));
}

export function printedDial(index: number): string {
  const ticks = Array.from({ length: 31 }, (_, tick) => {
    const x = 45 + tick * 17;
    return `<path d="M${x} 24v${tick % 10 === 0 ? 28 : tick % 5 === 0 ? 20 : 12}"/>`;
  }).join('');
  return `<svg class="radio-dial" viewBox="0 0 600 100" aria-hidden="true">
    <path d="M29 17h542M29 58h542" fill="none" stroke="currentColor" stroke-width="1"/>
    <g fill="none" stroke="currentColor" stroke-width="1.2">${ticks}</g>
    <g fill="currentColor" text-anchor="middle" class="radio-dial-labels">
      ${stations.map((station, stationIndex) => `<text x="${dialPosition(stationIndex)}" y="84">${escapeMarkup(station.frequency)}</text>`).join('')}
    </g>
    <g data-radio-needle transform="translate(${dialPosition(index)} 0)" class="radio-needle">
      <path d="M-6 4H6L0 14Z" fill="currentColor"/><path d="M0 10v52" fill="none" stroke="currentColor" stroke-width="2.8"/>
    </g>
  </svg>`;
}

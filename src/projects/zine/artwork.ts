import { number, type Theme } from './engine';

export function artwork(theme: Theme, page: number, width: number, height: number): string {
  const n = number;
  const ink = theme.ink;
  const accent = theme.accent;
  if (theme.artwork === 'burst') {
    const cx = width * (page % 2 ? 0.74 : 0.26);
    const cy = height / 2;
    const radius = Math.min(height * 0.46, width * 0.24);
    const points = Array.from({ length: 32 }, (_, index) => {
      const angle = index * Math.PI / 16 + page * Math.PI / 24;
      const r = radius * (index % 2 ? 0.62 : 1);
      return `${n(cx + Math.cos(angle) * r)},${n(cy + Math.sin(angle) * r)}`;
    }).join(' ');
    const other = width - cx;
    const bars = Array.from({ length: 4 }, (_, index) =>
      `<path d="M ${n(other - width * 0.17)} ${n(height * (0.23 + index * 0.18))} h ${n(width * (index % 2 ? 0.27 : 0.34))}" stroke="${ink}" stroke-width="${n(index === 1 ? 1.1 : 0.4)}"/>`,
    ).join('');
    return `<polygon points="${points}" fill="${accent}"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(radius * 0.26)}" fill="${ink}"/>${bars}`;
  }
  if (theme.artwork === 'leaf') {
    const cx = width * 0.48;
    const leaves = [0.24, 0.46, 0.68].map((position, index) => {
      const y = height * position;
      const side = (index + page) % 2 ? -1 : 1;
      const end = cx + side * Math.min(width * 0.28, height * 0.62);
      return `<path d="M ${n(cx)} ${n(y + height * 0.19)} Q ${n(end)} ${n(y + height * 0.18)} ${n(end)} ${n(y)} Q ${n(cx)} ${n(y)} ${n(cx)} ${n(y + height * 0.19)} Z" fill="${index % 2 ? ink : accent}"/>`;
    }).join('');
    return `<path d="M ${n(cx)} ${n(height * 0.94)} Q ${n(cx + width * 0.025)} ${n(height * 0.5)} ${n(cx)} ${n(height * 0.08)}" fill="none" stroke="${ink}" stroke-width=".55"/>${leaves}<path d="M 1 ${n(height * 0.94)} h ${n(width - 2)} M 1 ${n(height * 0.94)} v -2 M ${n(width - 1)} ${n(height * 0.94)} v -2" fill="none" stroke="${ink}" stroke-width=".3"/>`;
  }
  const radius = Math.min(height * 0.43, width * 0.2);
  const cy = height / 2;
  const cx = width * 0.48;
  const offset = radius * 0.6;
  const lines = Array.from({ length: 5 }, (_, index) =>
    `<path d="M ${n(width * 0.05)} ${n(height * (0.23 + index * 0.13))} h ${n(width * 0.13)}" stroke="${ink}" stroke-width=".4"/>`,
  ).join('');
  return `${lines}<circle cx="${n(cx - offset)}" cy="${n(cy)}" r="${n(radius)}" fill="none" stroke="${ink}" stroke-width=".65"/><circle cx="${n(cx + offset)}" cy="${n(cy)}" r="${n(radius)}" fill="none" stroke="${accent}" stroke-width="1.25"/><circle cx="${n(width * 0.88)}" cy="${n(cy)}" r="${n(Math.min(radius * 0.25, 2.8))}" fill="${ink}"/>`;
}

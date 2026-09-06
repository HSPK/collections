export const INKS = [
  { id: 0, name: 'Indigo', color: '#244580', rgb: [28, 54, 112] },
  { id: 1, name: 'Carbon', color: '#363d48', rgb: [27, 32, 43] },
  { id: 2, name: 'Madder', color: '#a94772', rgb: [145, 42, 87] },
] as const;

export type Pigment = 0 | 1 | 2;

export function viscosityFromControl(value: number): number {
  return 0.000035 + 0.0012 * (value / 100) ** 2;
}

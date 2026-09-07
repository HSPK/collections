export const PLANETS = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'] as const;
export type Planet = typeof PLANETS[number];
export type BodyName = 'Sun' | Planet | 'Moon';
export interface BodyData {
  name: BodyName; radiusKm: number; color: string; displayRadius: number; kind: number;
  subtitle: string; story: string; reference: string;
}
export const BODIES: readonly BodyData[] = [
  { name: 'Sun', radiusKm: 695700, color: '#ffcc76', displayRadius: 2.3, kind: 0,
    subtitle: 'The light at the center', story: 'The same star lights every world. Its apparent size changes with your distance, not its physical radius.', reference: 'Photosphere / spherical model' },
  { name: 'Mercury', radiusKm: 2439.7, color: '#b6aaa0', displayRadius: 0.48, kind: 1,
    subtitle: 'A world of long mornings', story: 'An eccentric 88-day orbit takes Mercury through the steepest change in sunlight of the eight planets. Watch its speed change along the sampled orbit.', reference: 'Mean-radius rocky surface' },
  { name: 'Venus', radiusKm: 6051.8, color: '#e8c493', displayRadius: 0.68, kind: 2,
    subtitle: 'Beneath a veil of clouds', story: 'Venus turns retrograde, slowly, beneath its bright atmosphere. This view shows an illustrative cloud deck, not a visible surface map.', reference: 'Mean radius; clouds illustrated' },
  { name: 'Earth', radiusKm: 6371, color: '#67acb9', displayRadius: 0.74, kind: 3,
    subtitle: 'A place to stand', story: 'Leave the orbital view for an actual geodetic observer. A few hundred kilometers on Earth can move you from totality to a partial eclipse.', reference: 'Mean-radius globe; Earth sky uses geodetic ellipsoid' },
  { name: 'Mars', radiusKm: 3389.5, color: '#da8665', displayRadius: 0.58, kind: 4,
    subtitle: 'The rust-colored neighbor', story: 'Mars is not always nearby. Its changing position relative to Earth is a consequence of two different orbital periods.', reference: 'Mean-radius rocky surface' },
  { name: 'Jupiter', radiusKm: 69911, color: '#d9b18e', displayRadius: 1.38, kind: 5,
    subtitle: 'Weather on a planetary scale', story: 'Jupiter has no solid surface to land on. Banded procedural clouds mark an idealized reference sphere; the real atmosphere is deep and moving.', reference: 'Mean-radius cloud-top reference; no solid ground' },
  { name: 'Saturn', radiusKm: 58232, color: '#e4c98f', displayRadius: 1.16, kind: 6,
    subtitle: 'A tilted architecture of ice', story: 'The rings occupy the equatorial plane. Their orientation follows the IAU pole, while the banding and ring artwork remain illustrative.', reference: 'Mean-radius cloud-top reference; no solid ground' },
  { name: 'Uranus', radiusKm: 25362, color: '#93d3d5', displayRadius: 0.9, kind: 7,
    subtitle: 'An axis almost on its side', story: 'A radically tilted rotation axis gives Uranus its unusual seasons. The orbital camera uses the same inertial frame as the other worlds.', reference: 'Mean-radius cloud-top reference; no solid ground' },
  { name: 'Neptune', radiusKm: 24622, color: '#4f80d7', displayRadius: 0.87, kind: 8,
    subtitle: 'Sunlight, thirty times farther', story: 'At Neptune, the Sun is still the dominant light, but a far smaller disk. Its 165-year orbit is sampled from the ephemeris, not a circular animation.', reference: 'Mean-radius cloud-top reference; no solid ground' },
  { name: 'Moon', radiusKm: 1737.4, color: '#c5c4be', displayRadius: 0.22, kind: 9,
    subtitle: 'One sphere, changing light', story: 'The Moon is always a sphere. Its phase is the portion of the sunlit hemisphere facing your location; local vertical sets the apparent tilt.', reference: 'Mean-radius sphere; terrain not modeled' },
];
export function bodyData(name: BodyName): BodyData {
  const result = BODIES.find(body => body.name === name);
  if (!result) throw new RangeError('Unsupported body.');
  return result;
}
export function isBody(value: unknown): value is BodyName {
  return BODIES.some(body => body.name === value);
}
export interface Site { name: string; latitude: number; longitude: number; elevation: number }
export const SITES: readonly Site[] = [
  { name: 'Nazas, Mexico', latitude: 25.288, longitude: -104.015, elevation: 1250 },
  { name: 'Dallas, USA', latitude: 32.7767, longitude: -96.797, elevation: 131 },
  { name: 'Albuquerque, USA', latitude: 35.0844, longitude: -106.6504, elevation: 1619 },
  { name: 'New York, USA', latitude: 40.7128, longitude: -74.006, elevation: 10 },
  { name: 'Honolulu, USA', latitude: 21.3099, longitude: -157.8581, elevation: 5 },
  { name: 'London, UK', latitude: 51.5074, longitude: -0.1278, elevation: 35 },
  { name: 'Sydney, Australia', latitude: -33.8688, longitude: 151.2093, elevation: 58 },
  { name: 'Cape Town, South Africa', latitude: -33.9249, longitude: 18.4241, elevation: 25 },
  { name: 'Tokyo, Japan', latitude: 35.6762, longitude: 139.6503, elevation: 40 },
  { name: 'Beijing, China', latitude: 39.9042, longitude: 116.4074, elevation: 0 },
  { name: 'Shanghai, China', latitude: 31.2304, longitude: 121.4737, elevation: 0 },
];
export const STUDIES = [
  { id: 'nazas', title: '01 / In the Moon’s shadow', detail: 'Nazas · 08 Apr 2024 · total path', site: 0, day: '2024-04-08', seek: true },
  { id: 'dallas', title: '02 / Totality in Dallas', detail: 'Dallas · 08 Apr 2024 · total path', site: 1, day: '2024-04-08', seek: true },
  { id: 'annular', title: '03 / A ring of sunlight', detail: 'Albuquerque · 14 Oct 2023 · annular path', site: 2, day: '2023-10-14', seek: true },
  { id: 'partial', title: '04 / Outside the umbra', detail: 'New York · 08 Apr 2024 · partial path', site: 3, day: '2024-04-08', seek: true },
  { id: 'night', title: '05 / The other side of Earth', detail: 'Sydney · 08 Apr 2024 · same UTC as Nazas', site: 6, day: '2024-04-08', seek: false },
] as const;

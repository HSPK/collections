export interface Vec3 { x: number; y: number; z: number }
export const DEG = Math.PI / 180;
export const DAY_MS = 86_400_000;
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const scale = (v: Vec3, k: number): Vec3 => ({ x: v.x * k, y: v.y * k, z: v.z * k });
export const sub = (a: Vec3, b: Vec3): Vec3 => add(a, scale(b, -1));
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x,
});
export const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const wrap = (degrees: number) => ((degrees % 360) + 360) % 360;
export function unit(v: Vec3): Vec3 {
  const r = length(v);
  if (!Number.isFinite(r) || r === 0) throw new RangeError('A direction must be finite and nonzero.');
  return scale(v, 1 / r);
}
export function separation(a: Vec3, b: Vec3): number {
  const u = unit(a), v = unit(b);
  return Math.atan2(length(cross(u, v)), dot(u, v));
}
export function angularRadius(radiusKm: number, distanceKm: number): number {
  if (!Number.isFinite(radiusKm) || !Number.isFinite(distanceKm) || radiusKm <= 0 || distanceKm <= radiusKm)
    throw new RangeError('Angular radii require a positive radius and an exterior observer.');
  return Math.asin(radiusKm / distanceKm);
}
export type EclipseType = 'none' | 'partial' | 'annular' | 'total';
export interface DiskOverlap { kind: EclipseType; obscuration: number; separation: number }
export function diskOverlap(sun: number, moon: number, distance: number): DiskOverlap {
  if (![sun, moon, distance].every(Number.isFinite) || sun <= 0 || moon <= 0 || distance < 0)
    throw new RangeError('Disk radii must be positive and separation nonnegative.');
  if (distance >= sun + moon) return { kind: 'none', obscuration: 0, separation: distance };
  if (moon >= sun + distance) return { kind: 'total', obscuration: 1, separation: distance };
  if (sun >= moon + distance) return { kind: 'annular', obscuration: (moon / sun) ** 2, separation: distance };
  const a = Math.acos(clamp((distance ** 2 + sun ** 2 - moon ** 2) / (2 * distance * sun), -1, 1));
  const b = Math.acos(clamp((distance ** 2 + moon ** 2 - sun ** 2) / (2 * distance * moon), -1, 1));
  const area = sun ** 2 * a + moon ** 2 * b -
    0.5 * Math.sqrt(Math.max(0, (-distance + sun + moon) * (distance + sun - moon) *
      (distance - sun + moon) * (distance + sun + moon)));
  return { kind: 'partial', obscuration: clamp(area / (Math.PI * sun ** 2), 0, 1), separation: distance };
}

// Astronomy Engine HOR is right-handed: north, west, zenith.
export function horizonDirection(azimuth: number, altitude: number): Vec3 {
  const a = azimuth * DEG, h = altitude * DEG;
  return { x: Math.cos(h) * Math.cos(a), y: -Math.cos(h) * Math.sin(a), z: Math.sin(h) };
}
export function skyBasis(azimuth: number, altitude: number) {
  const forward = horizonDirection(azimuth, altitude);
  const right = { x: -Math.sin(azimuth * DEG), y: -Math.cos(azimuth * DEG), z: 0 };
  return { forward, right, up: cross(right, forward) };
}
export function overlapAboveHorizon(sunDirection: Vec3, moonDirection: Vec3, sunRadius: number, moonRadius: number): boolean {
  const s = unit(sunDirection), m = unit(moonDirection);
  const angle = separation(s, m);
  if (diskOverlap(sunRadius, moonRadius, angle).kind === 'none') return false;
  const cs = Math.cos(sunRadius), cm = Math.cos(moonRadius);
  const zenith = { x: 0, y: 0, z: 1 };
  if (s.z >= cs && m.z >= cm) return true;
  function upperLimb(center: Vec3, radius: number): Vec3 {
    if (Math.asin(clamp(center.z, -1, 1)) + radius >= Math.PI / 2) return zenith;
    if (center.z <= -1 + 1e-15) return { x: Math.sin(radius), y: 0, z: -Math.cos(radius) };
    return add(scale(center, Math.cos(radius)), scale(unit(sub(zenith, scale(center, center.z))), Math.sin(radius)));
  }
  const a = upperLimb(s, sunRadius), b = upperLimb(m, moonRadius);
  if (a.z > 0 && dot(a, m) >= cm || b.z > 0 && dot(b, s) >= cs) return true;
  if (angle < 1e-12) return false;
  // Maximize zenith height over the intersection of two spherical caps.
  // If neither upper limb is inside the other cap, the maximum is at one
  // of their two circumference intersections.
  const normal = unit(cross(s, m)), towardMoon = cross(normal, s);
  const base = add(scale(s, cs), scale(towardMoon, (cm - dot(s, m) * cs) / Math.sin(angle)));
  const remaining = 1 - dot(base, base);
  if (remaining < 0) return false;
  return base.z + Math.abs(normal.z) * Math.sqrt(remaining) > 0;
}
export function mapToSite(x: number, y: number) {
  return { latitude: 90 - clamp(y, 0, 1) * 180, longitude: clamp(x, 0, 1) * 360 - 180 };
}
export function siteToMap(latitude: number, longitude: number) {
  return { x: (longitude + 180) / 360, y: (90 - latitude) / 180 };
}

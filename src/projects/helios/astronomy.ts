import {
  AstroTime, Body, Equator, GeoMoon, HelioVector, Horizon, KM_PER_AU, MoonPhase, Observer,
  ObserverVector, PlanetOrbitalPeriod, RotateVector, Rotation_EQJ_ECL, Rotation_EQJ_HOR,
  RotationAxis, SearchMoonPhase, Vector,
} from 'astronomy-engine';
import { BODIES, bodyData } from './data';
import type { BodyName, Site } from './data';
import { add, angularRadius, cross, DEG, diskOverlap, dot, length, overlapAboveHorizon, scale, separation, skyBasis, sub, unit, wrap } from './math';
import type { DiskOverlap, Vec3 } from './math';
import { validTime } from './time';

export { KM_PER_AU };
// The local shadow/contact code uses the mean lunar radius. The library's own
// reported obscuration instead uses 1736 km; HELIOS does not mix those disks.
export const SUN_RADIUS_KM = 695700;
export const MOON_RADIUS_KM = 1737.4;
export const ENGINE_BODIES: Record<BodyName, Body> = {
  Sun: Body.Sun, Mercury: Body.Mercury, Venus: Body.Venus, Earth: Body.Earth, Mars: Body.Mars,
  Jupiter: Body.Jupiter, Saturn: Body.Saturn, Uranus: Body.Uranus, Neptune: Body.Neptune, Moon: Body.Moon,
};
const plain = (v: Vec3): Vec3 => ({ x: v.x, y: v.y, z: v.z });
const astroVector = (v: Vec3, time: AstroTime) => new Vector(v.x, v.y, v.z, time);
export function observer(site: Site): Observer {
  if (!Number.isFinite(site.latitude) || Math.abs(site.latitude) > 90 ||
      !Number.isFinite(site.longitude) || Math.abs(site.longitude) > 180 ||
      !Number.isFinite(site.elevation) || site.elevation < -500 || site.elevation > 10000)
    throw new RangeError('Latitude: -90 to 90; longitude: -180 to 180; elevation: -500 to 10,000 m.');
  return new Observer(site.latitude, site.longitude, site.elevation);
}
export interface Frame { prime: Vec3; east: Vec3; north: Vec3 }
export function bodyFrame(name: BodyName, ms: number): Frame {
  const t = new AstroTime(new Date(ms));
  if (name === 'Earth') {
    const prime = unit(ObserverVector(t, new Observer(0, 0, 0), false));
    const east = unit(ObserverVector(t, new Observer(0, 90, 0), false));
    return { prime, east, north: unit(cross(prime, east)) };
  }
  const axis = RotationAxis(ENGINE_BODIES[name], t);
  const north = unit(axis.north);
  const node = { x: -Math.sin(axis.ra * 15 * DEG), y: Math.cos(axis.ra * 15 * DEG), z: 0 };
  const prime = add(scale(node, Math.cos(axis.spin * DEG)), scale(cross(north, node), Math.sin(axis.spin * DEG)));
  return { prime: unit(prime), east: unit(cross(north, prime)), north };
}
export function eqjToEcliptic(v: Vec3, ms: number): Vec3 {
  return plain(RotateVector(Rotation_EQJ_ECL(), astroVector(v, new AstroTime(new Date(ms)))));
}
// Right-handed Three.js axes: ECL x -> x, ECL z -> y, ECL y -> -z.
export const eclipticToScene = (v: Vec3): Vec3 => ({ x: v.x, y: v.z, z: -v.y });
export function eqjToScene(v: Vec3, ms: number): Vec3 { return eclipticToScene(eqjToEcliptic(v, ms)); }
export interface BodyPosition { name: BodyName; eqjAu: Vec3; eclipticAu: Vec3; distanceAu: number; frame: Frame }
export function systemAt(ms: number): BodyPosition[] {
  validTime(ms);
  const time = new Date(ms);
  return BODIES.map(({ name }) => {
    const eqjAu = plain(HelioVector(ENGINE_BODIES[name], time));
    return { name, eqjAu, eclipticAu: eqjToEcliptic(eqjAu, ms), distanceAu: length(eqjAu), frame: bodyFrame(name, ms) };
  });
}
export function displayPosition(body: BodyPosition, earth?: BodyPosition): Vec3 {
  if (body.name === 'Sun') return { x: 0, y: 0, z: 0 };
  if (body.name === 'Moon') {
    if (!earth) throw new RangeError('The overview Moon requires Earth as its display origin.');
    return add(displayPosition(earth), scale(eclipticToScene(sub(body.eclipticAu, earth.eclipticAu)), 1050));
  }
  return scale(eclipticToScene(unit(body.eclipticAu)), 12 * Math.log1p(2 * body.distanceAu));
}
export function orbitSamples(name: BodyName, ms: number, count = 160): Vec3[] {
  if (!Number.isInteger(count) || count < 16 || count > 512) throw new RangeError('Orbit sample count must be 16–512.');
  if (name === 'Sun') return [];
  const days = name === 'Moon' ? 27.321661 : PlanetOrbitalPeriod(ENGINE_BODIES[name]);
  return Array.from({ length: count + 1 }, (_, i) => {
    const at = ms + (i / count - 0.5) * days * 86400000;
    const eqj = name === 'Moon' ? GeoMoon(new Date(at)) : HelioVector(ENGINE_BODIES[name], new Date(at));
    const ecl = eqjToEcliptic(eqj, at);
    if (name === 'Moon') return scale(eclipticToScene(ecl), 1050);
    return scale(eclipticToScene(unit(ecl)), 12 * Math.log1p(2 * length(ecl)));
  });
}
export interface SkyBody {
  eqjAu: Vec3; horizon: Vec3; distanceKm: number; radius: number;
  altitude: number; azimuth: number; raHours: number; declination: number; visibility: 'above' | 'horizon' | 'below';
}
export interface Observation {
  time: number; site: Site; sun: SkyBody; moon: SkyBody;
  phase: { angle: number; fraction: number; elongation: number; longitude: number; waxing: boolean; name: string;
    limbAngle: number | null; lightHorizon: Vec3; frameHorizon: Frame };
  eclipse: DiskOverlap & { visible: boolean; visibility: 'above' | 'horizon' | 'below' };
}
export function observe(ms: number, site: Site): Observation {
  validTime(ms);
  const t = new AstroTime(new Date(ms)), obs = observer(site);
  const rotation = Rotation_EQJ_HOR(t, obs);
  const toHorizon = (v: Vec3) => plain(RotateVector(rotation, astroVector(v, t)));
  function target(body: Body, radiusKm: number): SkyBody {
    const eqj = Equator(body, t, obs, false, true);
    const eqd = Equator(body, t, obs, true, true);
    const hor = Horizon(t, obs, eqd.ra, eqd.dec); // No refraction.
    const distanceKm = eqj.dist * KM_PER_AU;
    const radius = angularRadius(radiusKm, distanceKm);
    const visibility = hor.altitude + radius / DEG <= 0 ? 'below' : hor.altitude - radius / DEG <= 0 ? 'horizon' : 'above';
    return { eqjAu: plain(eqj.vec), horizon: unit(toHorizon(eqj.vec)), distanceKm, radius,
      altitude: hor.altitude, azimuth: hor.azimuth, raHours: eqd.ra, declination: eqd.dec, visibility };
  }
  const sun = target(Body.Sun, SUN_RADIUS_KM), moon = target(Body.Moon, MOON_RADIUS_KM);
  const moonToSun = sub(sun.eqjAu, moon.eqjAu);
  const angle = separation(moonToSun, scale(moon.eqjAu, -1));
  const lightHorizon = unit(toHorizon(moonToSun));
  const basis = skyBasis(moon.azimuth, moon.altitude);
  const lightX = dot(lightHorizon, basis.right), lightY = dot(lightHorizon, basis.up);
  const longitude = MoonPhase(t), waxing = longitude < 180;
  const fraction = (1 + Math.cos(angle)) / 2;
  const phaseName = fraction < 0.002 ? 'New Moon' : fraction > 0.998 ? 'Full Moon' :
    `${waxing ? 'Waxing' : 'Waning'} ${Math.abs(fraction - 0.5) < 0.015 ? 'quarter' : fraction < 0.5 ? 'crescent' : 'gibbous'}`;
  const frame = bodyFrame('Moon', ms);
  const eclipse = diskOverlap(sun.radius, moon.radius, separation(sun.eqjAu, moon.eqjAu));
  return { time: ms, site: { ...site }, sun, moon,
    phase: { angle: angle / DEG, fraction, longitude, waxing, name: phaseName,
      elongation: separation(sun.eqjAu, moon.eqjAu) / DEG,
      limbAngle: Math.hypot(lightX, lightY) < 1e-8 ? null : wrap(Math.atan2(lightX, lightY) / DEG),
      lightHorizon, frameHorizon: { prime: toHorizon(frame.prime), east: toHorizon(frame.east), north: toHorizon(frame.north) } },
    eclipse: { ...eclipse, visible: overlapAboveHorizon(sun.horizon, moon.horizon, sun.radius, moon.radius), visibility: sun.visibility } };
}
export function nextPhase(ms: number, angle: 0 | 90 | 180 | 270, direction: 1 | -1): number {
  const result = SearchMoonPhase(angle, new Date(validTime(ms) + direction * 60000), direction * 35);
  if (!result) throw new Error('No requested Moon phase found within 35 days.');
  return validTime(result.date.getTime());
}
export function sunAngularDiameterFrom(name: BodyName, ms: number): number | null {
  if (name === 'Sun') return null;
  const r = length(HelioVector(ENGINE_BODIES[name], new Date(validTime(ms)))) * KM_PER_AU;
  return 2 * angularRadius(bodyData('Sun').radiusKm, r) / DEG;
}

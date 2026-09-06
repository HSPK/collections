import { expect, test } from '@playwright/test';
import referenceData from '../fixtures/helios-events.json' with { type: 'json' };
import {
  Body, Equator, GeoMoon, GeoVector, HelioVector, Horizon, Observer, ObserverVector, RotateVector,
  Rotation_EQJ_HOR,
} from 'astronomy-engine';
import {
  bodyFrame, displayPosition, eqjToScene, KM_PER_AU, MOON_RADIUS_KM, nextPhase,
  observe, observer, orbitSamples, SUN_RADIUS_KM, sunAngularDiameterFrom, systemAt,
} from '../../src/projects/helios/astronomy';
import { BODIES, PLANETS, SITES } from '../../src/projects/helios/data';
import { currentEvent, nextEvent } from '../../src/projects/helios/eclipse';
import {
  add, angularRadius, cross, DEG, diskOverlap, dot, horizonDirection, length, mapToSite, overlapAboveHorizon, scale, separation,
  siteToMap, skyBasis, sub, unit,
} from '../../src/projects/helios/math';
import { observationRecord } from '../../src/projects/helios/interchange';
import {
  cloneState, decodeStudy, encodeStudy, initialState, shareURL, stateFromHash, StudyHistory, validateState,
} from '../../src/projects/helios/state';
import { dayStart, MAX_TIME, MIN_TIME, parseUTC, utcDay, utcInput, validTime } from '../../src/projects/helios/time';

const instant = parseUTC('2024-04-08T18:17:31.519Z');
const nazas = SITES[0], dallas = SITES[1], albuquerque = SITES[2], nyc = SITES[3], sydney = SITES[6];
const distance = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => length(sub(a, b));
// Shared independent references are test-only; city elevations and all runtime
// geometry remain separate from these reference expectations.
const REFERENCES = referenceData.events.map(fixture => ({
  ...fixture,
  site: { name: fixture.id, latitude: fixture.latitude, longitude: fixture.longitude,
    elevation: referenceData.conventions.observerHeightMeters },
}));

test.describe('HELIOS deterministic astronomy', () => {
  test('strict UTC parsing is timezone invariant and rejects nonexistent dates and nonfinite/range inputs', () => {
    const previous = process.env.TZ;
    try {
      for (const zone of ['UTC', 'Pacific/Honolulu', 'Asia/Tokyo', 'America/New_York']) {
        process.env.TZ = zone;
        expect(parseUTC('2024-04-08T18:17:31.519')).toBe(instant);
        expect(utcInput(instant)).toBe('2024-04-08T18:17:31');
        expect(utcDay(instant)).toBe('2024-04-08');
        expect(dayStart('2024-04-08')).toBe(Date.UTC(2024, 3, 8));
      }
    } finally {
      if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
    }
    for (const value of ['2024-02-30T12:00', '2024-13-01T12:00', '2024-04-08', '2024-04-08T18:00-06:00', 'hello'])
      expect(() => parseUTC(value)).toThrow();
    for (const value of [NaN, Infinity, MIN_TIME - 1, MAX_TIME + 1]) expect(() => validTime(value)).toThrow();
    expect(parseUTC('2024-02-29T23:59:59Z')).toBe(Date.UTC(2024, 1, 29, 23, 59, 59));
  });

  test('all eight planets and the Moon use real date-dependent heliocentric vectors within physical distance ranges', () => {
    const ranges = [[.30, .47], [.71, .73], [.98, 1.02], [1.38, 1.67], [4.94, 5.47], [9.02, 10.1], [18.2, 20.2], [29.7, 30.4]];
    for (const date of ['2024-04-08T18:00:00Z', '2030-01-01T00:00:00Z', '2040-08-01T00:00:00Z']) {
      const time = parseUTC(date), positions = systemAt(time);
      expect(positions).toHaveLength(10);
      for (const [index, planet] of PLANETS.entries()) {
        const body = positions.find(position => position.name === planet)!;
        expect(body.distanceAu).toBeGreaterThan(ranges[index][0]);
        expect(body.distanceAu).toBeLessThan(ranges[index][1]);
        expect(distance(body.eqjAu, HelioVector(Body[planet], new Date(time)))).toBeLessThan(1e-13);
      }
      const earth = positions.find(body => body.name === 'Earth')!;
      const moon = positions.find(body => body.name === 'Moon')!;
      expect(distance(sub(moon.eqjAu, earth.eqjAu), GeoMoon(new Date(time)))).toBeLessThan(1e-13);
    }
    const a = systemAt(instant), b = systemAt(instant + 30 * 86400000);
    for (const planet of PLANETS) expect(distance(a.find(p => p.name === planet)!.eqjAu, b.find(p => p.name === planet)!.eqjAu)).toBeGreaterThan(.01);
    expect(a[0].eqjAu).toEqual({ x: 0, y: 0, z: 0 });
  });

  test('J2000 body frames, Earth geodetic axes, and scene rotations remain orthonormal and right handed', () => {
    for (const body of BODIES) {
      const frame = bodyFrame(body.name, instant);
      for (const v of [frame.prime, frame.east, frame.north]) expect(length(v)).toBeCloseTo(1, 12);
      expect(dot(frame.prime, frame.east)).toBeCloseTo(0, 12);
      expect(distance(cross(frame.prime, frame.east), frame.north)).toBeLessThan(1e-12);
      const p = eqjToScene(frame.prime, instant), e = eqjToScene(frame.east, instant), n = eqjToScene(frame.north, instant);
      expect(distance(cross(p, e), n)).toBeLessThan(1e-12);
    }
    const frame = bodyFrame('Earth', instant);
    const prime = unit(ObserverVector(new Date(instant), new Observer(0, 0, 0), false));
    const east = unit(ObserverVector(new Date(instant), new Observer(0, 90, 0), false));
    expect(distance(frame.prime, prime)).toBeLessThan(1e-13);
    expect(distance(frame.east, east)).toBeLessThan(1e-13);
    const equator = ObserverVector(new Date(instant), new Observer(0, 0, 0), false);
    const pole = ObserverVector(new Date(instant), new Observer(90, 0, 0), false);
    expect(length(equator) * KM_PER_AU).toBeGreaterThan(6378);
    expect(length(pole) * KM_PER_AU).toBeLessThan(6357);
  });

  test('local horizontal directions use true-of-date RA hours and agree with an EQJ horizon rotation', () => {
    for (const site of [nazas, sydney, { name: 'Polar', latitude: 89.99, longitude: 45, elevation: 100 }]) {
      const result = observe(instant, site), obs = observer(site), date = new Date(instant);
      for (const [name, target] of [[Body.Sun, result.sun], [Body.Moon, result.moon]] as const) {
        const eqd = Equator(name, date, obs, true, true);
        const hor = Horizon(date, obs, eqd.ra, eqd.dec);
        expect(target.altitude).toBeCloseTo(hor.altitude, 10);
        expect(target.azimuth).toBeCloseTo(hor.azimuth, 10);
        const eqj = Equator(name, date, obs, false, true);
        expect(distance(target.horizon, unit(RotateVector(Rotation_EQJ_HOR(date, obs), eqj.vec)))).toBeLessThan(1e-12);
        expect(Math.asin(target.horizon.z) / DEG).toBeCloseTo(hor.altitude, 8);
      }
    }
    const obs = observer(nazas);
    const sun = Equator(Body.Sun, new Date(instant), obs, true, true);
    const wrongHours = Horizon(new Date(instant), obs, sun.ra * 15, sun.dec);
    expect(Math.abs(wrongHours.altitude - observe(instant, nazas).sun.altitude)).toBeGreaterThan(5);
  });

  test('the Moon retains observer parallax; geocentric alignment cannot manufacture local totality', () => {
    const local = observe(instant, nazas), other = observe(instant, nyc);
    const geocentric = GeoMoon(new Date(instant));
    const earthObserver = ObserverVector(new Date(instant), observer(nazas), false);
    expect(distance(add(local.moon.eqjAu, earthObserver), geocentric)).toBeLessThan(1e-12);
    expect(separation(local.moon.eqjAu, geocentric) / DEG).toBeGreaterThan(.1);
    expect(separation(local.moon.eqjAu, other.moon.eqjAu) / DEG).toBeGreaterThan(.2);
    expect(local.eclipse.kind).toBe('total');
    expect(other.eclipse.kind).not.toBe('total');
    const raised = observe(instant, { ...nazas, elevation: 10000 });
    expect(Math.abs(raised.moon.distanceKm - local.moon.distanceKm)).toBeGreaterThan(5);
    for (const site of [{ ...nazas, latitude: 91 }, { ...nazas, elevation: 10001 }, { ...nazas, longitude: NaN }])
      expect(() => observe(instant, site)).toThrow();
  });

  test('physical angular radii, robust separation, and circle overlap cover containment and finite edge cases', () => {
    const result = observe(instant, nazas);
    expect(result.sun.radius).toBeCloseTo(Math.asin(SUN_RADIUS_KM / result.sun.distanceKm), 14);
    expect(result.moon.radius).toBeCloseTo(Math.asin(MOON_RADIUS_KM / result.moon.distanceKm), 14);
    expect(result.sun.radius / DEG).toBeGreaterThan(.26);
    expect(result.moon.radius / DEG).toBeGreaterThan(result.sun.radius / DEG);
    expect(separation({ x: 1, y: 0, z: 0 }, { x: 1, y: 1e-12, z: 0 })).toBeCloseTo(1e-12, 20);
    expect(separation({ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 })).toBe(Math.PI);
    expect(diskOverlap(1, 2, 0)).toMatchObject({ kind: 'total', obscuration: 1 });
    expect(diskOverlap(2, 1, 0)).toMatchObject({ kind: 'annular', obscuration: .25 });
    expect(diskOverlap(1, 1, 0)).toMatchObject({ kind: 'total', obscuration: 1 });
    expect(diskOverlap(1, 1, 2)).toMatchObject({ kind: 'none', obscuration: 0 });
    expect(diskOverlap(1, 1, 1).obscuration).toBeCloseTo(2 / 3 - Math.sqrt(3) / (2 * Math.PI), 14);
    for (const d of [1e-14, .2, .9, 1, 1.999999999]) {
      const a = diskOverlap(1, 1, d);
      expect(a.kind).toBe('partial'); expect(a.obscuration).toBeGreaterThanOrEqual(0); expect(a.obscuration).toBeLessThanOrEqual(1);
    }
    for (const args of [[0, 1, 0], [1, -1, 0], [1, 1, -1], [1, NaN, 0], [1, 1, Infinity]])
      expect(() => diskOverlap(args[0], args[1], args[2])).toThrow();
    expect(() => angularRadius(1, 1)).toThrow();
    expect(() => separation({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toThrow();
  });

  test('lunar illumination is the Sun-Moon-observer angle, separate from elongation', () => {
    const date = parseUTC('2024-04-17T18:00:00Z');
    const result = observe(date, SITES[7]);
    const angle = separation(sub(result.sun.eqjAu, result.moon.eqjAu), scale(result.moon.eqjAu, -1));
    expect(result.phase.angle).toBeCloseTo(angle / DEG, 11);
    expect(result.phase.fraction).toBeCloseTo((1 + Math.cos(angle)) / 2, 12);
    expect(result.phase.fraction).toBeGreaterThan(.6);
    expect(result.phase.fraction).toBeLessThan(.8);
    expect(result.phase.waxing).toBe(true);
    expect(Math.abs(result.phase.angle - result.phase.elongation)).toBeGreaterThan(20);
    const full = observe(nextPhase(date, 180, 1), SITES[7]);
    const newMoon = observe(nextPhase(date, 0, 1), SITES[7]);
    expect(full.phase.fraction).toBeGreaterThan(.998);
    expect(newMoon.phase.fraction).toBeLessThan(.002);
    expect(observe(nextPhase(date, 270, 1), SITES[7]).phase.waxing).toBe(false);
    expect(nextPhase(date, 90, -1)).toBeLessThan(date);
    expect(() => nextPhase(MAX_TIME, 0, 1)).toThrow();
  });

  test('northern/southern observers see different lit-limb orientation from one physical light vector', () => {
    const date = parseUTC('2024-04-17T18:00:00Z');
    const north = observe(date, SITES[5]), south = observe(date, SITES[7]);
    expect(north.moon.visibility).toBe('above');
    expect(south.moon.visibility).toBe('above');
    expect(Math.abs(north.phase.fraction - south.phase.fraction)).toBeLessThan(.015);
    const difference = Math.abs(north.phase.limbAngle! - south.phase.limbAngle!);
    expect(Math.min(difference, 360 - difference)).toBeGreaterThan(60);
    for (const result of [north, south]) {
      const basis = skyBasis(result.moon.azimuth, result.moon.altitude);
      const angle = Math.atan2(dot(result.phase.lightHorizon, basis.right), dot(result.phase.lightHorizon, basis.up)) / DEG;
      expect(result.phase.limbAngle).toBeCloseTo((angle + 360) % 360, 10);
      expect(dot(result.phase.lightHorizon, scale(result.moon.horizon, -1))).toBeCloseTo(Math.cos(result.phase.angle * DEG), 12);
    }
  });

  test('known 2024 total eclipse observers have ordered contacts and independently total peak disks', () => {
    for (const [site, approximatePeak, centralMin, centralMax] of [
      [nazas, '2024-04-08T18:17:31Z', 270, 273],
      [dallas, '2024-04-08T18:42:37Z', 233, 239],
    ] as const) {
      const event = currentEvent(instant, site)!;
      expect(event).not.toBeNull(); expect(event.kind).toBe('total');
      expect(Math.abs(event.peak - parseUTC(approximatePeak))).toBeLessThan(3000);
      expect(event.centralDuration).toBeGreaterThan(centralMin); expect(event.centralDuration).toBeLessThan(centralMax);
      expect(event.contacts.map(contact => contact.label)).toEqual(['C1', 'C2', 'Peak', 'C3', 'C4']);
      for (let i = 1; i < event.contacts.length; i++) expect(event.contacts[i].time).toBeGreaterThan(event.contacts[i - 1].time);
      expect(observe(event.peak, site).eclipse).toMatchObject({ kind: 'total', visible: true, obscuration: 1 });
      expect(observe(event.contacts[0].time - 60000, site).eclipse.kind).toBe('none');
      expect(observe(event.contacts[4].time + 60000, site).eclipse.kind).toBe('none');
      for (const contact of event.contacts) expect(contact.altitude).toBeCloseTo(observe(contact.time, site).sun.altitude, 12);
    }
  });

  test('Albuquerque 2023 is annular while New York 2024 is partial; library obscuration does not drive live disks', () => {
    const ring = currentEvent(parseUTC('2023-10-14T16:00:00Z'), albuquerque)!;
    expect(ring.kind).toBe('annular'); expect(ring.centralDuration).toBeGreaterThan(280);
    expect(Math.abs(ring.peak - parseUTC('2023-10-14T16:36:52Z'))).toBeLessThan(3000);
    const annular = observe(ring.peak, albuquerque);
    expect(annular.eclipse.kind).toBe('annular');
    expect(annular.eclipse.obscuration).toBeGreaterThan(.89); expect(annular.eclipse.obscuration).toBeLessThan(.91);
    expect(annular.moon.radius).toBeLessThan(annular.sun.radius);
    expect(annular.eclipse.obscuration).not.toBe(ring.engineObscuration);
    const partial = currentEvent(instant, nyc)!;
    expect(partial.kind).toBe('partial'); expect(partial.contacts).toHaveLength(3);
    expect(partial.centralDuration).toBeNull();
    expect(observe(partial.peak, nyc).eclipse.kind).toBe('partial');
  });

  test('primary-source height-zero total, annular, and partial fixtures agree without forcing USNO seconds', () => {
    expect(SUN_RADIUS_KM).toBe(referenceData.conventions.engineSolarRadiusKm);
    expect(MOON_RADIUS_KM).toBe(referenceData.conventions.engineContactLunarRadiusKm);
    for (const fixture of REFERENCES) {
      const event = currentEvent(dayStart(fixture.date), fixture.site);
      if (fixture.expectedKind === 'not-visible') {
        expect(event, fixture.site.name).toBeNull();
        if (!fixture.comparisonTimeUTC) throw new Error(`Missing comparison instant for ${fixture.id}.`);
        const sky = observe(parseUTC(fixture.comparisonTimeUTC), fixture.site);
        expect(sky.sun.altitude < 0).toBe(fixture.sunBelowHorizonAtComparison);
        expect(sky.eclipse.visible).toBe(false);
        continue;
      }
      expect(event, fixture.site.name).not.toBeNull();
      if (!event || !fixture.referencePeakUT1) throw new Error(`Missing event or reference peak for ${fixture.id}.`);
      expect(event.kind).toBe(fixture.expectedKind);
      expect(Math.abs(event.peak - parseUTC(fixture.referencePeakUT1)))
        .toBeLessThan(referenceData.conventions.timingToleranceSeconds * 1000);
      const sky = observe(event.peak, fixture.site);
      expect(sky.eclipse.kind).toBe(fixture.expectedKind);
      expect(sky.eclipse.visible).toBe(true);
      if (fixture.id === 'san-francisco-2024') {
        expect(sky.eclipse.obscuration).toBeGreaterThan(.32);
        expect(sky.eclipse.obscuration).toBeLessThan(.36);
      }
    }
    const referenceNazas = REFERENCES.find(fixture => fixture.id === 'nazas-2024');
    expect(referenceNazas).toBeDefined();
    expect(referenceNazas?.site.longitude).not.toBe(nazas.longitude);
    expect(nazas.elevation).toBe(1250);
  });

  test('mean-radius contact residuals stay below 0.23 arcsecond while polar-radius obscuration remains distinct', () => {
    for (const fixture of REFERENCES.filter(fixture => fixture.expectedKind !== 'not-visible')) {
      const event = currentEvent(dayStart(fixture.date), fixture.site)!;
      for (const contact of event.contacts) {
        if (contact.label === 'Peak') continue;
        const sky = observe(contact.time, fixture.site);
        const tangency = contact.label === 'C1' || contact.label === 'C4' ?
          sky.sun.radius + sky.moon.radius : Math.abs(sky.moon.radius - sky.sun.radius);
        const residualArcsec = Math.abs(sky.eclipse.separation - tangency) / DEG * 3600;
        expect(residualArcsec, `${fixture.site.name} ${contact.label}`).toBeLessThan(.23);
      }
      if (fixture.expectedKind === 'annular') {
        const sky = observe(event.peak, fixture.site);
        expect(event.engineObscuration).toBeCloseTo(.895998, 5);
        expect(sky.eclipse.obscuration).toBeCloseTo(.897444, 5);
        const polarMoon = angularRadius(referenceData.conventions.engineObscurationLunarRadiusKm, sky.moon.distanceKm);
        expect(diskOverlap(sky.sun.radius, polarMoon, sky.eclipse.separation).obscuration).toBeCloseTo(event.engineObscuration, 8);
        expect(sky.moon.radius).toBeCloseTo(angularRadius(referenceData.conventions.engineContactLunarRadiusKm, sky.moon.distanceKm), 14);
      }
    }
  });

  test('Dallas reference totality requires parallax and Tokyo remains a nighttime negative site', () => {
    const dallasReference = REFERENCES.find(fixture => fixture.id === 'dallas-2024');
    const tokyoReference = REFERENCES.find(fixture => fixture.id === 'tokyo-2024');
    if (!dallasReference || !tokyoReference) throw new Error('Dallas and Tokyo reference fixtures are required.');
    const site = dallasReference.site, event = currentEvent(dayStart(dallasReference.date), site)!;
    const topocentric = observe(event.peak, site), time = new Date(event.peak);
    const sun = GeoVector(Body.Sun, time, true), moon = GeoMoon(time);
    const geocentricSeparation = separation(sun, moon);
    expect(topocentric.eclipse.separation / DEG).toBeCloseTo(.00697, 4);
    expect(geocentricSeparation / DEG).toBeCloseTo(.42670, 4);
    expect(topocentric.eclipse.kind).toBe('total');
    expect(diskOverlap(angularRadius(SUN_RADIUS_KM, length(sun) * KM_PER_AU),
      angularRadius(MOON_RADIUS_KM, length(moon) * KM_PER_AU), geocentricSeparation).kind).toBe('partial');
    const tokyo = tokyoReference.site;
    expect(currentEvent(event.peak, tokyo)).toBeNull();
    const night = observe(event.peak, tokyo);
    expect(night.sun.altitude).toBeGreaterThan(-21);
    expect(night.sun.altitude).toBeLessThan(-17);
    expect(night.eclipse.visible).toBe(false);
  });

  test('date-locked circumstances never show a later event; nighttime geometry stays below ground', () => {
    expect(currentEvent(instant, sydney)).toBeNull();
    expect(currentEvent(parseUTC('2024-04-17T18:00:00Z'), nazas)).toBeNull();
    const sky = observe(instant, sydney);
    expect(sky.sun.altitude).toBeLessThan(-20); expect(sky.sun.visibility).toBe('below');
    expect(sky.eclipse.visible).toBe(false);
    expect(sky.sun.horizon.z).toBeLessThan(0);
    const next = nextEvent(instant, nazas);
    expect(next.day).not.toBe('2024-04-08'); expect(next.peak).toBeGreaterThan(instant);
    expect(next.peak).toBeLessThan(instant + 5 * 366 * 86400000);
  });

  test('next eclipse advances past a local peak on the preceding UTC day even when new Moon is later', () => {
    const time = parseUTC('2013-05-09T12:00:00Z');
    const current = currentEvent(time, sydney)!;
    expect(current.day).toBe('2013-05-09');
    const next = nextEvent(time, sydney);
    expect(next.day).toBe('2014-04-29');
    expect(Math.abs(next.peak - parseUTC('2014-04-29T07:15:03Z'))).toBeLessThan(60000);
    expect(nextEvent(current.peak, sydney).day).toBe(next.day);
    expect(() => nextEvent(next.peak, sydney)).toThrow(/within the next five years/);
    expect(() => nextEvent(MAX_TIME, sydney)).toThrow(/outside the supported date range/);
  });

  test('next eclipse retains a next-day local peak whose geocentric new Moon precedes UTC midnight', () => {
    const time = parseUTC('2012-05-20T12:00:00Z');
    const next = nextEvent(time, albuquerque);
    expect(next.day).toBe('2012-05-21');
    expect(next.kind).toBe('annular');
    expect(Math.abs(next.peak - parseUTC('2012-05-21T01:35:53Z'))).toBeLessThan(60000);
    expect(observe(next.peak, albuquerque).eclipse).toMatchObject({ kind: 'annular', visible: true });
    expect(currentEvent(next.peak, albuquerque)?.peak).toBeCloseTo(next.peak, -3);
    expect(nextEvent(next.peak, albuquerque).peak).toBeGreaterThan(dayStart(next.day) + 86400000);
  });

  test('an eclipse intersection can be invisible even when both disks individually cross the horizon', () => {
    const radius = .3 * DEG;
    const sun = horizonDirection(0, -.25), moon = horizonDirection(.5, -.25);
    expect(diskOverlap(radius, radius, separation(sun, moon)).kind).toBe('partial');
    expect(Math.asin(sun.z) / DEG + .3).toBeGreaterThan(0);
    expect(Math.asin(moon.z) / DEG + .3).toBeGreaterThan(0);
    expect(overlapAboveHorizon(sun, moon, radius, radius)).toBe(false);
    expect(overlapAboveHorizon(horizonDirection(0, 0), horizonDirection(.5, 0), radius, radius)).toBe(true);
    expect(overlapAboveHorizon(horizonDirection(0, 30), horizonDirection(0, 30), radius, radius * 1.1)).toBe(true);
    expect(overlapAboveHorizon(horizonDirection(0, -30), horizonDirection(0, -30), radius, radius * 1.1)).toBe(false);
  });

  test('compressed displays and cached trace inputs never alter physical observation geometry', () => {
    const before = observe(instant, nazas), positions = systemAt(instant);
    const saved = structuredClone(positions), earth = positions.find(body => body.name === 'Earth')!;
    const neptune = positions.find(body => body.name === 'Neptune')!;
    expect(length(displayPosition(neptune)) / length(displayPosition(earth))).toBeLessThan(5);
    expect(neptune.distanceAu / earth.distanceAu).toBeGreaterThan(29);
    for (const body of positions) {
      const p = displayPosition(body, earth);
      expect(Number.isFinite(length(p))).toBe(true);
      const trace = orbitSamples(body.name, instant, 32);
      expect(trace).toHaveLength(body.name === 'Sun' ? 0 : 33);
      for (const v of trace) expect(Number.isFinite(length(v))).toBe(true);
    }
    expect(positions).toEqual(saved); expect(observe(instant, nazas)).toEqual(before);
    expect(sunAngularDiameterFrom('Neptune', instant)).toBeLessThan(.02);
    expect(sunAngularDiameterFrom('Mercury', instant)).toBeGreaterThan(1);
  });

  test('geodetic map axes round-trip all quadrants, poles, and antimeridian', () => {
    for (const [lat, lon] of [[0, 0], [90, -180], [-90, 180], [25.288, -104.015], [-33.9, 151.2], [54.1, 121]]) {
      const point = siteToMap(lat, lon);
      const result = mapToSite(point.x, point.y);
      expect(result.latitude).toBeCloseTo(lat, 10); expect(result.longitude).toBeCloseTo(lon, 10);
    }
    expect(mapToSite(.75, .25)).toEqual({ latitude: 45, longitude: 90 });
    expect(mapToSite(-1, 2)).toEqual({ latitude: -90, longitude: -180 });
  });
});

test.describe('HELIOS interchange and ownership', () => {
  test('versioned JSON and escaped share links restore exactly; derived data is not trusted', () => {
    const state = { ...initialState(), time: instant, site: { ...nazas, name: 'Nazas / field notebook' } };
    expect(decodeStudy(encodeStudy(state))).toEqual(state);
    const url = shareURL('https://example.org/collections/projects/helios/', state);
    expect(new URL(url).pathname).toBe('/collections/projects/helios/');
    expect(stateFromHash(new URL(url).hash)).toEqual(state);
    const snapshot = observe(state.time, state.site);
    const record = observationRecord(state, snapshot, currentEvent(state.time, state.site));
    expect(decodeStudy(record)).toEqual(state);
    expect(record.length).toBeLessThan(32000);
    const poisoned: Record<string, unknown> = JSON.parse(record);
    poisoned.computed = { eclipse: { kind: 'total', obscuration: 1 } };
    expect(decodeStudy(JSON.stringify(poisoned))).toEqual(state);
    expect(() => observationRecord({ ...state, time: instant + 1000 }, snapshot, null)).toThrow(/different observation/);
  });
  test('invalid imports reject atomically and bounded history/reset never share mutable baselines', () => {
    const original = initialState(), history = new StudyHistory(original);
    original.site.latitude = 0;
    const state = history.state; state.site.longitude = 0;
    expect(history.state.site).toEqual(nazas);
    history.commit({ ...history.state, site: { ...sydney }, time: instant });
    expect(history.canUndo).toBe(true);
    const before = history.state;
    for (const value of [
      { ...before, time: NaN }, { ...before, fov: 0 }, { ...before, orbitZoom: 1e30 },
      { ...before, site: { ...nazas, latitude: 99 } }, { ...before, view: 'fiction' },
    ]) expect(() => validateState(value)).toThrow();
    expect(history.state).toEqual(before);
    expect(() => decodeStudy('{"format":"helios-observation","version":2,"state":{}}')).toThrow();
    expect(() => decodeStudy('x'.repeat(32001))).toThrow();
    expect(() => decodeStudy('{')).toThrow();
    history.reset(); expect(history.state).toEqual(initialState());
    history.undo(); expect(history.state).toEqual(before);
    expect(cloneState(history.state)).toEqual(before);
  });
  test('imports and searches are owned in initiation order, including edits, reset, and teardown', async () => {
    const history = new StudyHistory(initialState());
    const first = history.claim(), second = history.claim();
    expect(history.owns(first)).toBe(false); expect(history.owns(second)).toBe(true);
    history.commit({ ...history.state, site: { ...sydney } });
    expect(history.owns(second)).toBe(false);
    const third = history.claim(); history.reset(); expect(history.owns(third)).toBe(false);
    let release: (value: string) => void = () => { throw new Error('Promise not installed.'); };
    const slowFile = new Promise<string>(resolve => { release = resolve; });
    const old = history.claim();
    const pending = slowFile.then(text => { if (history.owns(old)) history.commit(decodeStudy(text)); });
    history.commit({ ...history.state, site: { ...dallas } });
    release(encodeStudy({ ...history.state, site: { ...sydney } }));
    await pending;
    expect(history.state.site).toEqual(dallas);
    const last = history.claim(); history.dispose();
    expect(history.owns(last)).toBe(false);
    expect(() => history.commit(initialState())).toThrow(/closed/);
  });
});

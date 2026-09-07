import type { Observation } from './astronomy';
import type { LocalEvent } from './eclipse';
import { validateState } from './state';
import type { StudyState } from './state';
import type { ClockMode } from './clock';
import { utcDay } from './time';
export function observationRecord(state: StudyState, observation: Observation, event: LocalEvent | null, clockMode: ClockMode = 'manual'): string {
  if (state.time !== observation.time || state.site.latitude !== observation.site.latitude ||
      state.site.longitude !== observation.site.longitude || state.site.elevation !== observation.site.elevation)
    throw new Error('Cannot export readouts from a different observation snapshot.');
  if (event && (event.day !== utcDay(state.time) || event.site.latitude !== state.site.latitude ||
      event.site.longitude !== state.site.longitude || event.site.elevation !== state.site.elevation))
    throw new Error('Cannot export eclipse contacts from a different observer or UTC date.');
  return JSON.stringify({
    format: 'helios-observation', version: 1, state: validateState(state),
    clock: { capturedMode: clockMode, restoreMode: 'manual', note: 'Live and playback are runtime modes; this file keeps one UTC instant.' },
    conventions: {
      engine: 'Astronomy Engine 2.1.19', time: 'UTC; UT1 approximated as UTC; default engine Delta T',
      position: 'EQJ/J2000, AU; geometric heliocentric overview',
      observer: 'geodetic degrees north/east, meters above mean sea level',
      horizon: 'geometric altitude/azimuth degrees; azimuth north through east; no refraction or horizon dip',
      rightAscension: 'true equator/equinox of date, sidereal hours',
      angularRadii: 'radians; Sun 695700 km, Moon mean radius 1737.4 km',
      phase: 'Sun-Moon-observer angle in degrees; topocentric illuminated fraction',
      surfaceArt: 'Illustrative surface/photometry; Earth geography is Natural Earth v5.1.2, 1:50m generalized public-domain land',
    },
    computed: observation,
    localEvent: event,
    restore: 'Only validated state is restored. Computed values are recomputed, never trusted as input.',
  }, null, 2);
}

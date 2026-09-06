import type { Observation } from './astronomy';
import type { LocalEvent } from './eclipse';
import { validateState } from './state';
import type { StudyState } from './state';
export function observationRecord(state: StudyState, observation: Observation, event: LocalEvent | null): string {
  if (state.time !== observation.time || state.site.latitude !== observation.site.latitude ||
      state.site.longitude !== observation.site.longitude || state.site.elevation !== observation.site.elevation)
    throw new Error('Cannot export readouts from a different observation snapshot.');
  return JSON.stringify({
    format: 'helios-observation', version: 1, state: validateState(state),
    conventions: {
      engine: 'Astronomy Engine 2.1.19', time: 'UTC; UT1 approximated as UTC; default engine Delta T',
      position: 'EQJ/J2000, AU; geometric heliocentric overview',
      observer: 'geodetic degrees north/east, meters above mean sea level',
      horizon: 'geometric altitude/azimuth degrees; azimuth north through east; no refraction or horizon dip',
      rightAscension: 'true equator/equinox of date, sidereal hours',
      angularRadii: 'radians; Sun 695700 km, Moon mean radius 1737.4 km',
      phase: 'Sun-Moon-observer angle in degrees; topocentric illuminated fraction',
      surfaceArt: 'Original illustrative artwork, not measured maps',
    },
    computed: observation,
    localEvent: event,
    restore: 'Only validated state is restored. Computed values are recomputed, never trusted as input.',
  }, null, 2);
}

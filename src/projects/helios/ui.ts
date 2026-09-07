import { BODIES, SITES, STUDIES } from './data';
import { TIME_SPANS } from './timeline';
import { siteUrl } from '../../core/urls';

export function markup(): string {
  return `
  <header class="h-masthead">
    <div class="h-wordmark"><svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="10"/><circle cx="24" cy="24" r="20" stroke-dasharray="1 7"/><path d="M24 0v9m0 30v9M0 24h9m30 0h9"/></svg><h1 id="helios-title">HELIOS<span>Independent observatory</span></h1></div>
    <nav class="h-tabs" aria-label="Observatory views"><button type="button" data-h-view="system" aria-pressed="false">System</button><button type="button" data-h-view="planet" aria-pressed="false">Planet</button><button type="button" data-h-view="sky" aria-pressed="true">Sky</button></nav>
    <div class="h-header-actions"><button type="button" data-h-action="notes" aria-label="About the model">?</button><button type="button" data-h-action="keep" class="h-gold-button" aria-label="Keep observation">Keep ↗</button></div>
  </header>
  <main class="h-observatory" data-project-preview aria-label="HELIOS observatory">
    <div class="h-command-bar">
      <div class="h-sky-quick"><label class="h-sr-only" for="h-site">Location preset</label><select id="h-site"><option value="custom">Custom observer</option>${SITES.map((site, i) => `<option value="${i}">${site.name}</option>`).join('')}</select><label class="h-sr-only" for="h-track-select">Track sky body</label><select id="h-track-select"><option value="Sun">Track Sun</option><option value="Moon">Track Moon</option><option value="horizon">Horizon</option></select></div>
      <div class="h-world-quick" hidden><label class="h-sr-only" for="h-body">Selected body</label><select id="h-body">${BODIES.map(body => `<option>${body.name}</option>`).join('')}</select><label class="h-sr-only" for="h-camera-select">Planet camera</label><select id="h-camera-select"><option value="orbit">Local orbit</option><option value="ride">Follow in system</option></select></div>
      <div class="h-instrument-launchers" aria-label="Open instruments"><button type="button" data-h-open="observer" data-h-action="observe-pane">Observe</button><button type="button" data-h-open="eclipse">Eclipse</button><button type="button" data-h-open="moon">Moon</button><button type="button" data-h-open="journeys">History</button></div>
    </div>
    <div class="h-workspace">
      <section class="h-stage" aria-label="Celestial view">
        <div class="h-canvas-host" data-h-host></div>
        <div class="h-view-heading"><p class="h-eyebrow" data-h-kicker>True angular sky</p><h2 data-h-title hidden></h2><div class="h-instant" data-h-sky-summary><h2 data-h-instant>Computing…</h2><p data-h-instant-detail></p></div></div>
        <svg class="h-label-leaders" data-h-leaders aria-hidden="true">${BODIES.map(body => `<line data-h-leader="${body.name}" stroke="${body.color}"/>`).join('')}</svg>
        <div class="h-body-labels">${BODIES.map(body => `<button type="button" data-h-body-label="${body.name}" style="--body-color:${body.color}">${body.name}</button>`).join('')}</div>
        <div class="h-optics" data-h-optics aria-hidden="true"><div class="h-crosshair h-crosshair-top"></div><div class="h-crosshair h-crosshair-bottom"></div><div class="h-crosshair h-crosshair-left"></div><div class="h-crosshair h-crosshair-right"></div><div class="h-vertical-label">LOCAL UP ↑</div><div class="h-scale"><span></span><b data-h-scale>10′</b></div></div>
        <div class="h-view-bottom"><div class="h-view-tools"><button type="button" data-h-action="zoom-in" aria-label="Zoom in">+</button><button type="button" data-h-action="zoom-out" aria-label="Zoom out">−</button><button type="button" data-h-action="center" aria-label="Recenter view">⌖</button></div></div>
        <div class="h-measure-strip">
          <dl class="h-altitudes" data-h-sky-altitudes aria-label="Altitude above the geometric horizon">
            <div data-h-altitude="Sun"><dt>Sun altitude</dt><dd><strong data-h-sun-altitude></strong><span data-h-sun-visibility></span></dd></div>
            <div data-h-altitude="Moon"><dt>Moon altitude</dt><dd><strong data-h-moon-altitude></strong><span data-h-moon-visibility></span></dd></div>
          </dl>
          <div class="h-world-measures" data-h-world-measures hidden><span data-h-measure-one></span><span data-h-measure-two></span></div>
        </div>
      </section>
      <dialog class="h-dock" data-h-dock aria-labelledby="h-dock-title">
        <div class="h-dock-heading"><h2 id="h-dock-title">Observing desk</h2><button type="button" data-h-action="close-dock" aria-label="Close observing desk">Done</button></div>
        <nav class="h-dock-tabs" aria-label="Instrument panels"><button type="button" data-h-panel="observer" aria-pressed="false">Place</button><button type="button" data-h-panel="eclipse" aria-pressed="true">Eclipse</button><button type="button" data-h-panel="moon" aria-pressed="false">Moon</button><button type="button" data-h-panel="journeys" aria-pressed="false">History</button></nav>
        <div class="h-dock-content">
          <section class="h-panel" data-h-instrument="observer" hidden aria-label="Observer and optical controls">
            <div class="h-sky-controls">
              <div class="h-section-title"><h3>Choose your place</h3><span>°N / °E / meters</span></div>
              <div class="h-map" data-h-map></div>
              <div class="h-map-tools"><button type="button" data-h-action="map-in" aria-label="Zoom map in">+</button><button type="button" data-h-action="map-out" aria-label="Zoom map out">−</button><button type="button" data-h-action="map-reset">World</button><span>Drag to pan · tap to place</span></div>
              <p class="h-map-credit">Equirectangular · <a href="${siteUrl('helios/attribution.txt')}" target="_blank" rel="noopener noreferrer">Natural Earth / public domain</a></p>
              <form data-h-location-form><div class="h-coordinate-fields"><label>Latitude °N<input id="h-latitude" type="number" min="-90" max="90" step="any" required></label><label>Longitude °E<input id="h-longitude" type="number" min="-180" max="180" step="any" required></label><label>Height m<input id="h-elevation" type="number" min="-500" max="10000" step="any" required></label></div><button type="submit" class="h-wide-button">Apply observer & view sky ↗</button></form>
              <details class="h-optics-fields"><summary>Optical pointing & field of view</summary><p class="h-small-note">Altitude is measured from the horizon: 0° is level, positive is above, negative is below. Disk visibility includes its upper and lower edges; no refraction or terrain is modeled.</p><p class="h-angular-sizes" data-h-azimuth-reading></p>
              <div class="h-fov-row"><label for="h-fov">Vertical field of view</label><div><input id="h-fov" type="number" min=".65" max="110" step="any" aria-label="Field of view in degrees"><span>°</span></div></div>
              <input id="h-fov-range" type="range" min="0" max="1000" step="1" aria-label="Optical field of view">
              <p class="h-angular-sizes" data-h-angular-sizes></p>
              <div class="h-horizon-fields" data-h-horizon-fields hidden><label>Azimuth °<input id="h-azimuth" type="number" min="0" max="360" step="any"></label><label>Altitude °<input id="h-altitude" type="number" min="-90" max="90" step="any"></label><button type="button" data-h-action="point">Point & view sky</button></div>
              </details>
            </div>
            <div class="h-planet-controls" hidden><h3>About this world</h3><p class="h-body-deck" data-h-body-deck></p><div class="h-planet-stat"><span>Apparent Sun diameter</span><strong data-h-planet-sun></strong></div><button type="button" class="h-wide-button" data-h-action="earth-surface">Stand on Earth ↗</button><p class="h-reference" data-h-reference></p></div>
          </section>
          <section class="h-panel h-event-desk" data-h-instrument="eclipse" aria-label="Local eclipse circumstances">
            <div class="h-section-title"><h3>Local circumstances</h3><span data-h-event-day></span></div>
            <div class="h-event-summary"><strong data-h-event-kind>Computing…</strong><p data-h-event-description></p></div>
            <div class="h-contacts" data-h-contacts></div><input id="h-event-scrub" type="range" min="0" max="1" step="1000" value="0" disabled aria-label="Eclipse contact timeline">
            <div class="h-event-actions"><button type="button" data-h-action="peak">Go to local peak</button><button type="button" data-h-action="next-eclipse">Next local eclipse →</button></div>
            <p class="h-small-note">Date-locked contacts. Only “Next” advances events; live disks independently determine the visible geometry.</p>
          </section>
          <section class="h-panel h-moon-desk" data-h-instrument="moon" hidden aria-label="Moon phase instruments">
            <h3>The Moon, from here</h3><p class="h-phase-observer" data-h-phase-observer></p><div class="h-phase-heading"><strong data-h-phase-name></strong><span data-h-phase-fraction></span></div><p class="h-moon-distance" data-h-moon-distance></p>
            <div class="h-phase-measures"><div><span>Phase angle</span><strong data-h-phase-angle></strong></div><div><span>Elongation</span><strong data-h-elongation></strong></div><div><span>Limb ↻ from up</span><strong data-h-limb-angle></strong></div></div>
            <div class="h-phase-navigation"><label class="h-sr-only" for="h-phase">Lunar phase to find</label><select id="h-phase"><option value="0">New Moon</option><option value="90" selected>First quarter</option><option value="180">Full Moon</option><option value="270">Last quarter</option></select><button type="button" data-h-action="phase-back" aria-label="Previous selected Moon phase">←</button><button type="button" data-h-action="phase-next" aria-label="Next selected Moon phase">→</button></div>
            <button type="button" class="h-wide-button" data-h-action="moon-study">Observe an evening Moon ↗</button>
            <p class="h-small-note">Phase search uses geocentric longitude quarters. The illuminated disk, fraction, and horizon remain topocentric.</p>
          </section>
          <section class="h-panel h-studies" data-h-instrument="journeys" hidden aria-label="Historical observation anchors">
            <h3>Anchors in time</h3><p class="h-small-note">Each anchor computes its own local peak.</p><div class="h-study-list">${STUDIES.map(study => `<button type="button" data-h-study="${study.id}"><strong>${study.title}</strong><span>${study.detail}</span></button>`).join('')}</div>
          </section>
        </div>
      </dialog>
    </div>
    <section class="h-time-dock" aria-label="UTC clock and timeline">
      <div class="h-time-head">
        <button type="button" class="h-time-readout" data-h-open-time aria-label="Edit observation UTC"><span data-h-clock-mode>MANUAL / UTC</span><time data-h-utc-display><span data-h-clock-date></span><b data-h-clock-time></b></time></button>
        <div class="h-clock-actions"><button type="button" data-h-action="now" title="Set this instant once from the device clock">Now</button><button type="button" data-h-action="live" aria-pressed="false" aria-label="Synchronize with device time">● Live</button></div>
        <div class="h-transport"><button type="button" data-h-action="step-back" aria-label="Step backward">−</button><button type="button" class="h-play" data-h-action="play" aria-label="Run time">▶ Run</button><button type="button" data-h-action="step-forward" aria-label="Step forward">+</button><button type="button" data-h-open-time data-h-transport-settings aria-label="Time entry and playback settings"><span data-h-step-display>1m</span><span class="h-settings-full"> · settings</span></button></div>
        <label class="h-span-label"><span>Axis span</span><select id="h-timespan" aria-label="UTC timeline span">${TIME_SPANS.map(span => `<option value="${span.id}">${span.label}</option>`).join('')}</select></label>
      </div>
      <div class="h-time-axis-wrap" data-h-axis-host>
        <div class="h-time-axis" data-h-time-axis role="slider" tabindex="0" aria-label="General UTC timeline" aria-orientation="horizontal"><div class="h-axis-ticks" data-h-time-ticks aria-hidden="true"></div><div class="h-time-cursor" data-h-time-cursor aria-hidden="true"></div><div class="h-axis-now" data-h-axis-now aria-hidden="true">NOW</div></div>
        <button type="button" class="h-axis-history" data-h-axis-history title="Computed Nazas 2024 peak UTC; your observer stays in place">Nazas ’24</button>
        <div class="h-axis-extents"><span data-h-axis-start></span><span data-h-axis-end></span></div>
      </div>
    </section>
    <div class="h-status-line"><p role="status" data-h-status>Solving the initial observation…</p></div>
  </main>
  <footer class="h-footline">Simulation only. Never view the real Sun without certified protection, especially through optics.</footer>
  <dialog class="h-dialog h-time-dialog" data-h-time-dialog aria-labelledby="h-time-title"><form method="dialog" class="h-dialog-top"><h2 id="h-time-title">Time & transport</h2><button aria-label="Close time settings">Done</button></form><p>UTC, independent of browser timezone. Set, step, drag, and event/phase navigation leave Live synchronization. “Now” captures once; “Live” follows the device clock.</p><div class="h-date-control"><label for="h-utc">Exact observation UTC</label><input id="h-utc" type="datetime-local" step="1" min="1900-01-01T00:00" max="2100-12-31T23:59:59"><button type="button" data-h-action="set-time">Set UTC & observe</button></div><div class="h-time-settings"><label>Step size<select id="h-step" aria-label="Time step"><option value="1">1 second</option><option value="60" selected>1 minute</option><option value="3600">1 hour</option><option value="86400">1 day</option></select></label><label>Playback rate<select id="h-rate"><option value="1">1 second / s</option><option value="30">30 seconds / s</option><option value="300">5 minutes / s</option><option value="3600">1 hour / s</option><option value="86400">1 day / s</option><option value="864000">10 days / s</option></select></label></div><div class="h-history"><button type="button" data-h-action="undo">Undo observation</button><button type="button" data-h-action="reset">Reset to Nazas</button></div></dialog>
  <dialog class="h-dialog" data-h-keep-dialog aria-labelledby="h-keep-title">
    <form method="dialog" class="h-dialog-top"><span class="h-eyebrow">OBSERVATION RECORD / V1</span><button aria-label="Close observation record">×</button></form><h2 id="h-keep-title">Keep this point of view.</h2><p>This record captures one exact UTC instant, even in Live mode. Restoring a JSON file or share link always starts in Manual; device-clock synchronization is an explicit opt-in.</p><div class="h-dialog-actions"><button type="button" class="h-gold-button" data-h-action="download">Download JSON</button><label class="h-file-button">Open JSON<input id="h-file" type="file" accept=".json,application/json"></label></div><label for="h-record">Versioned observation JSON</label><textarea id="h-record" spellcheck="false" rows="7"></textarea><button type="button" data-h-action="restore-text">Restore this JSON</button><label for="h-share">Self-contained observation link</label><textarea id="h-share" readonly rows="2"></textarea><button type="button" data-h-action="copy">Copy link</button><p role="status" data-h-record-status></p>
  </dialog>
  ${notesMarkup()}`;
}

function notesMarkup(): string {
  return `<dialog class="h-dialog h-notes-dialog" data-h-notes-dialog aria-labelledby="h-notes-title">
    <form method="dialog" class="h-dialog-top"><span class="h-eyebrow">MODEL / SOURCES / LIMITS</span><button aria-label="Close field notes">×</button></form>
    <h2 id="h-notes-title">The instrument behind the image.</h2>
    <p>City presets are reference points, not surveyed observing sites. Beijing and Shanghai start at a 0 m reference height; enter your actual observing height in the Place instrument.</p>
    <h3>A clock, not an animation pretending to be now</h3><p>Live samples the device’s Date.now clock directly. It does not add frame deltas and cannot validate whether your device clock is correct. Hidden tabs stop work and resynchronize on return. Observer and camera edits preserve Live; explicit time edits, scrubbing, playback, phase/event navigation, undo, and reset return to Manual. The general UTC axis supports 6 hours through 10 years; its end labels are absolute UTC instants, not elapsed animation time.</p>
    <h3>Two scales, never mixed</h3><p>System distances use a logarithmic radial display, with enlarged bodies and a separately expanded Earth–Moon separation. Local orbit uses a mean-radius sphere and a body-centered camera. Earth sky traces rectilinear rays through physically sized topocentric Sun and Moon disks. Field of view is vertical; local zenith is up.</p>
    <h3>Time, place, and frames</h3><p>All input is UTC, 1900–2100. Astronomy Engine approximates UT1 as UTC and estimates TT with its default Espenak–Meeus ΔT model. The observer accepts north-positive geodetic latitude, east-positive longitude, and elevation in meters above mean sea level. The physical observer uses a rotating oblate Earth; no terrain, geoid survey, horizon dip, or atmospheric refraction is applied.</p><p>Heliocentric positions are geometric EQJ/J2000 vectors in AU, rotated to the J2000 ecliptic. Earth sky uses Equator with the actual observer, then EQD right ascension in hours / declination in degrees for Horizon. HOR axes are north, west, zenith. The apparent Sun includes light-time and aberration; the engine’s Moon branch uses GeoMoon directly. Earth observer parallax is retained for both.</p>
    <h3>Phases and eclipses</h3><p>Moon phase is the Sun–Moon–observer angle, not elongation. The sphere receives light from that physical vector even when overview distances are enlarged. Disks use spherical radii of 695,700 km (Sun) and 1,737.4 km (Moon). Obscuration is angular-circle overlap, not brightness.</p><p>Library contacts use a shadow cone and mean Moon radius. Its obscuration uses a 1,736 km polar Moon radius; that number is retained only in exported event records. Live contacts/containment can differ by seconds near boundaries. The library skips fully nighttime events. Current-date searches never substitute a future event; Next searches use a one-day lookback and bound local peak time, including events crossing UTC midnight. Workers have a 12-second wall-time limit; Next has a five-year/date-range bound.</p><p>A one-second numerical contact tolerance is not one-second physical accuracy. Astronomy Engine advertises roughly ±1 arcminute positional accuracy, not navigation-grade precision. Its event-kind helper includes a 14 m umbra-sign bias; the live disk geometry does not. Library visibility checks refracted Sun-center altitude at C1 or C4; this instrument separately clips unrefracted disk intersections.</p><p>Independent fixtures use 0 m elevation, not city elevations. Albuquerque’s height-zero annular peak is about 89.5998% obscured with the library’s polar-radius convention versus 89.7444% with mean-radius disks. <a href="https://aa.usno.navy.mil/data/Eclipse2024#notes" target="_blank" rel="noopener noreferrer">USNO uses different solar-radius and ΔT conventions</a>; comparisons within a minute are meaningful, not second-exact agreement.</p>
    <h3>Geography and illustrative art</h3><p>The map and Earth globe share bundled <a href="${siteUrl('helios/attribution.txt')}" target="_blank" rel="noopener noreferrer">Natural Earth 1:50 million land geometry, public domain</a>. Equirectangular (plate carrée) longitude/latitude: north up, east right, wrapped at ±180°. Drag pans; tap picks through the current transform. Arrow keys move one degree (Shift: 0.1°); + / − zoom; 0 returns to the world. Coastlines are generalized cartography, not surveyed terrain or navigation data.</p><p>Other surface textures, clouds, lunar markings, stars, fill light, and corona are illustrative. The corona appears only during geometric totality with the full Sun above the horizon. No Baily’s beads, terrain, weather, optical inversion, lunar-eclipse shading, or observatory-grade accuracy is claimed. Giant planets have cloud-top/reference spheres, not solid ground. IAU body orientations do not turn generic orbital views into calibrated non-Earth surface observations.</p>
    <h3>Sources & safety</h3><p><a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noopener noreferrer">Astronomy Engine / official repository</a> · 2.1.19, MIT, Don Cross. <a href="${siteUrl('third-party/astronomy-engine-LICENSE.txt')}" target="_blank" rel="noopener noreferrer" data-h-license>Read the full MIT license</a>. <a href="https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2024Apr08Tpath.html" target="_blank" rel="noopener noreferrer">NASA 2024 eclipse path</a> · <a href="https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2023Oct14Apath.html" target="_blank" rel="noopener noreferrer">NASA 2023 annular path</a>.</p><p>This is a simulation. Never look at the real Sun without appropriate certified protection, especially through optics. No hardware, sensor, or location permission is needed.</p>
  </dialog>`;
}

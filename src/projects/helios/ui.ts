import { BODIES, SITES, STUDIES } from './data';
import { landPath } from './atlas';
import { siteUrl } from '../../core/urls';
export function markup(): string {
  return `
  <header class="h-masthead">
    <a class="h-wordmark" href="#helios-title" aria-label="Helios observatory">
      <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="10"/><circle cx="24" cy="24" r="20" stroke-dasharray="1 7"/><path d="M24 0v9m0 30v9M0 24h9m30 0h9"/></svg>
      <h1 id="helios-title">HELIOS<span>Independent observatory</span></h1>
    </a>
    <p class="h-header-note">Ten worlds. One point of view.<br><span>Solar system & Earth sky / 071</span></p>
    <div class="h-header-actions"><button type="button" data-h-action="notes" aria-label="About the model">Field notes</button><button type="button" class="h-gold-button" data-h-action="keep" aria-label="Keep observation"><span class="h-keep-full">Keep observation</span><span class="h-keep-short">Keep</span> <span aria-hidden="true">↗</span></button></div>
  </header>
  <main class="h-observatory" data-project-preview aria-label="HELIOS observatory">
    <nav class="h-tabs" aria-label="Observatory panes">
      <button type="button" data-h-view="system" aria-pressed="false"><span>01</span> System</button>
      <button type="button" data-h-view="planet" aria-pressed="false"><span>02</span> Planet</button>
      <button type="button" data-h-view="sky" aria-pressed="true"><span>03</span> Sky</button>
      <button type="button" data-h-action="observe-pane" class="h-observe-tab" aria-pressed="false"><span>04</span> Observe</button>
      <span class="h-instrument-label"><i></i> <span data-h-mode-label>Earth surface / optical instrument</span></span>
    </nav>
    <div class="h-workspace">
      <section class="h-stage" aria-label="Celestial view">
        <div class="h-canvas-host" data-h-host></div>
        <div class="h-view-heading"><p class="h-eyebrow" data-h-kicker>THE LOCAL SKY / GEODETIC EARTH OBSERVER</p><h2 data-h-title>Nazas, Mexico</h2><p data-h-subtitle>The Moon’s shadow, seen from where you stand.</p></div>
        <div class="h-frame-label" data-h-frame-label>TRUE ANGULAR SCALE</div>
        <svg class="h-label-leaders" data-h-leaders aria-hidden="true">${BODIES.map(body => `<line data-h-leader="${body.name}" stroke="${body.color}"/>`).join('')}</svg>
        <div class="h-body-labels" data-h-labels>${BODIES.map(body => `<button type="button" data-h-body-label="${body.name}" style="--body-color:${body.color}">${body.name}</button>`).join('')}</div>
        <div class="h-optics" data-h-optics aria-hidden="true">
          <div class="h-crosshair h-crosshair-top"></div><div class="h-crosshair h-crosshair-bottom"></div>
          <div class="h-crosshair h-crosshair-left"></div><div class="h-crosshair h-crosshair-right"></div>
          <div class="h-vertical-label">LOCAL UP ↑</div>
          <div class="h-scale"><span></span><b data-h-scale>10′</b></div>
        </div>
        <div class="h-view-bottom">
          <div class="h-instant"><span class="h-eyebrow" data-h-instant-label>INSTANTANEOUS ALIGNMENT</span><strong data-h-instant>Total eclipse</strong><span data-h-instant-detail>Computing the topocentric disks…</span></div>
          <div class="h-view-tools"><button type="button" data-h-action="zoom-in" aria-label="Zoom in">+</button><button type="button" data-h-action="zoom-out" aria-label="Zoom out">−</button><button type="button" data-h-action="center" aria-label="Recenter view">⌖</button></div>
        </div>
        <div class="h-measure-strip"><span data-h-measure-one>Sun altitude —</span><span data-h-measure-two>Azimuth —</span><span data-h-measure-three>Moon distance —</span></div>
      </section>
      <aside class="h-rail" aria-label="Observation controls">
        <div class="h-rail-heading"><span class="h-eyebrow">OBSERVING DESK</span><span class="h-live-label" data-h-live-label>TIME HELD</span></div>
        <section class="h-panel h-sky-controls" aria-label="Earth surface controls">
          <div class="h-section-title"><h3>Your place on Earth</h3><span>GEODETIC</span></div>
          <label class="h-sr-only" for="h-site">Location preset</label>
          <select id="h-site"><option value="custom">Custom coordinates</option>${SITES.map((site, i) => `<option value="${i}">${site.name}</option>`).join('')}</select>
          <div class="h-map" data-h-map tabindex="0" role="img" aria-label="Earth location picker. North is up, east is right. Click to choose; arrow keys move one degree. Numeric fields follow.">
            <svg viewBox="0 0 360 180" preserveAspectRatio="none" aria-hidden="true">
              <defs><pattern id="h-map-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="#66827c" stroke-opacity=".18" stroke-width=".5"/></pattern></defs>
              <rect width="360" height="180" fill="#101e22"/><rect width="360" height="180" fill="url(#h-map-grid)"/>
              <path d="${landPath(360, 180)}" fill="#36524f" stroke="#759080" stroke-width=".4"/>
              <path d="M0 90H360M180 0V180" stroke="#a5a084" stroke-opacity=".25" stroke-width=".6" stroke-dasharray="3 4"/>
              <g data-h-map-marker><circle r="7" fill="none" stroke="#ebc783" stroke-width=".7"/><circle r="2.5" fill="#ffe0a0"/><path d="M-12 0h5m14 0h5M0-12v5m0 14v5" stroke="#ffe0a0" stroke-width=".7"/></g>
              <text x="7" y="13" fill="#a3b5ac" font-size="8">90° N</text><text x="7" y="174" fill="#a3b5ac" font-size="8">90° S</text>
            </svg>
          </div>
          <form data-h-location-form>
            <div class="h-coordinate-fields"><label>Latitude °N<input id="h-latitude" type="number" min="-90" max="90" step="any" required></label><label>Longitude °E<input id="h-longitude" type="number" min="-180" max="180" step="any" required></label><label>Elevation m<input id="h-elevation" type="number" min="-500" max="10000" step="any" required></label></div>
            <button type="submit" class="h-wide-button">Apply observer <span aria-hidden="true">↗</span></button>
          </form>
          <div class="h-section-title h-spaced"><h3>Point the instrument</h3><span>HORIZON-UP</span></div>
          <div class="h-segment" aria-label="Sky tracking"><button type="button" data-h-track="Sun" aria-pressed="true">Sun</button><button type="button" data-h-track="Moon" aria-pressed="false">Moon</button><button type="button" data-h-track="horizon" aria-pressed="false">Horizon</button></div>
          <div class="h-fov-row"><label for="h-fov">Vertical field of view</label><div><input id="h-fov" type="number" min=".65" max="110" step="any" aria-label="Field of view in degrees"><span>°</span></div></div>
          <input id="h-fov-range" type="range" min="0" max="1000" step="1" aria-label="Optical field of view">
          <div class="h-range-labels"><span>Optical · 0.65°</span><span>Wide sky · 110°</span></div>
          <p class="h-angular-sizes" data-h-angular-sizes></p>
          <div class="h-horizon-fields" data-h-horizon-fields hidden><label>Look azimuth °<input id="h-azimuth" type="number" min="0" max="360" step="any"></label><label>Look altitude °<input id="h-altitude" type="number" min="-90" max="90" step="any"></label><button type="button" data-h-action="point">Point</button></div>
        </section>
        <section class="h-panel h-planet-controls" aria-label="Planet controls" hidden>
          <div class="h-section-title"><h3>Choose a world</h3><span>HELIOCENTRIC</span></div>
          <label class="h-sr-only" for="h-body">Selected body</label><select id="h-body">${BODIES.map(body => `<option>${body.name}</option>`).join('')}</select>
          <p class="h-body-deck" data-h-body-deck></p>
          <div class="h-planet-stat"><span>Distance from Sun</span><strong data-h-planet-distance></strong></div>
          <div class="h-planet-stat"><span>Mean radius</span><strong data-h-planet-radius></strong></div>
          <div class="h-planet-stat"><span>Sun diameter here</span><strong data-h-planet-sun></strong></div>
          <div class="h-section-title h-spaced"><h3>Travel with this body</h3></div>
          <div class="h-camera-options"><button type="button" data-h-camera="orbit" aria-pressed="true"><strong>Local orbit</strong><span>Body-centered floating origin</span></button><button type="button" data-h-camera="ride" aria-pressed="false"><strong>Follow in system</strong><span>Moving camera / compressed surroundings</span></button></div>
          <button type="button" class="h-wide-button" data-h-action="earth-surface">Stand on Earth <span aria-hidden="true">↗</span></button>
          <p class="h-reference" data-h-reference></p>
          <p class="h-reference">Drag or use arrow keys to orbit. + / − changes the viewing distance. No camera motion runs by itself.</p>
        </section>
      </aside>
    </div>
    <section class="h-timebar" aria-label="UTC time controls">
      <div class="h-date-control"><label for="h-utc">OBSERVATION / UTC</label><input id="h-utc" type="datetime-local" step="1" min="1900-01-01T00:00" max="2100-12-31T23:59:59"><button type="button" data-h-action="set-time">Set UTC</button></div>
      <div class="h-transport"><button type="button" data-h-action="step-back" aria-label="Step backward">−</button><button type="button" class="h-play" data-h-action="play" aria-label="Run time">▶ Run</button><button type="button" data-h-action="step-forward" aria-label="Step forward">+</button><label class="h-sr-only" for="h-step">Time step</label><select id="h-step" aria-label="Time step"><option value="1">1 second</option><option value="60" selected>1 minute</option><option value="3600">1 hour</option><option value="86400">1 day</option></select></div>
      <div class="h-rate"><label for="h-rate">RATE</label><select id="h-rate"><option value="1">1 second / s</option><option value="30">30 seconds / s</option><option value="300">5 minutes / s</option><option value="3600">1 hour / s</option><option value="86400">1 day / s</option><option value="864000">10 days / s</option></select></div>
      <div class="h-history"><button type="button" data-h-action="undo">Undo</button><button type="button" data-h-action="reset">Reset</button></div>
    </section>
    <div class="h-status-line"><p role="status" data-h-status>Solving the initial observation…</p><span>All times UTC · no refraction</span></div>
  </main>
  <div class="h-lower">
    <section class="h-event-desk" aria-label="Local eclipse circumstances">
      <div class="h-section-title"><div><p class="h-eyebrow">01 / FOLLOW THE SHADOW</p><h2>Local eclipse circumstances</h2></div><span data-h-event-day>08 APR 2024</span></div>
      <div class="h-event-summary"><strong data-h-event-kind>Computing…</strong><p data-h-event-description>Contacts are solved for this observer and this UTC date.</p></div>
      <div class="h-contacts" data-h-contacts></div>
      <label class="h-sr-only" for="h-event-scrub">Eclipse contact timeline</label><input id="h-event-scrub" type="range" min="0" max="1" step="1000" value="0" disabled aria-label="Eclipse contact timeline">
      <div class="h-event-actions"><button type="button" data-h-action="peak">Go to local peak</button><button type="button" data-h-action="next-eclipse">Next local eclipse <span aria-hidden="true">→</span></button></div>
      <p class="h-small-note">Current circumstances stay on the date above. “Next” alone advances to a future event. Contact times use Astronomy Engine’s shadow model; the live disk geometry is calculated independently.</p>
    </section>
    <section class="h-moon-desk" aria-label="Moon phase instruments">
      <p class="h-eyebrow">02 / READ THE LIGHT</p><h2>The Moon, from here</h2>
      <p class="h-phase-observer" data-h-phase-observer></p>
      <div class="h-phase-heading"><strong data-h-phase-name>New Moon</strong><span data-h-phase-fraction>0.0% lit</span></div>
      <div class="h-phase-measures"><div><span>Phase angle</span><strong data-h-phase-angle></strong></div><div><span>Elongation</span><strong data-h-elongation></strong></div><div><span>Bright limb ↻ from up</span><strong data-h-limb-angle></strong></div></div>
      <div class="h-phase-navigation"><label class="h-sr-only" for="h-phase">Lunar phase to find</label><select id="h-phase"><option value="0">New Moon</option><option value="90" selected>First quarter</option><option value="180">Full Moon</option><option value="270">Last quarter</option></select><button type="button" data-h-action="phase-back" aria-label="Previous selected Moon phase">←</button><button type="button" data-h-action="phase-next" aria-label="Next selected Moon phase">→</button></div>
      <button type="button" class="h-wide-button" data-h-action="moon-study">Observe an evening Moon <span aria-hidden="true">↗</span></button>
      <p class="h-small-note">A sunlit sphere, not a phase icon. The terminator and bright-limb angle follow your actual local vertical. Fraction is topocentric; phase navigation finds geocentric ecliptic-longitude quarters.</p>
    </section>
  </div>
  <section class="h-studies" aria-label="Guided observation studies">
    <div><p class="h-eyebrow">THE OBSERVATION BOOK</p><h2>One event. Many places.</h2><p>Move the observer, not the eclipse. Each study solves its own circumstances.</p></div>
    <div class="h-study-list">${STUDIES.map(study => `<button type="button" data-h-study="${study.id}"><strong>${study.title}</strong><span>${study.detail}</span><i aria-hidden="true">↗</i></button>`).join('')}</div>
  </section>
  <footer class="h-footer"><p><strong>Look here, not at the real Sun.</strong> This is a simulation. Never look at the real Sun without appropriate certified solar protection, especially through optics. No hardware or sensor access is needed.</p><button type="button" data-h-action="notes-footer">Model & sources</button><span>COMPUTED LOCALLY<br>ASTRONOMY ENGINE 2.1.19</span></footer>
  <dialog class="h-dialog" data-h-keep-dialog aria-labelledby="h-keep-title">
    <form method="dialog" class="h-dialog-top"><span class="h-eyebrow">OBSERVATION RECORD / V1</span><button aria-label="Close observation record">×</button></form>
    <h2 id="h-keep-title">Keep this point of view.</h2><p>The UTC instant, observer, camera, and physical readouts travel together. Restored observations always start paused and recompute their geometry.</p>
    <div class="h-dialog-actions"><button type="button" class="h-gold-button" data-h-action="download">Download JSON</button><label class="h-file-button">Open JSON<input id="h-file" type="file" accept=".json,application/json"></label></div>
    <label for="h-record">Versioned observation JSON</label><textarea id="h-record" spellcheck="false" rows="7"></textarea><button type="button" data-h-action="restore-text">Restore this JSON</button>
    <label for="h-share">Self-contained observation link</label><textarea id="h-share" readonly rows="2"></textarea><button type="button" data-h-action="copy">Copy link</button><p role="status" data-h-record-status></p>
  </dialog>
  <dialog class="h-dialog h-notes-dialog" data-h-notes-dialog aria-labelledby="h-notes-title">
    <form method="dialog" class="h-dialog-top"><span class="h-eyebrow">MODEL / SOURCES / LIMITS</span><button aria-label="Close field notes">×</button></form>
    <h2 id="h-notes-title">The instrument behind the image.</h2>
    <h3>Two scales, never mixed</h3><p>System distances use a logarithmic radial display, with enlarged bodies and a separately expanded Earth–Moon separation. Local orbit uses a mean-radius sphere and a body-centered camera. The Earth sky instead traces rectilinear rays through physically sized topocentric Sun and Moon disks. Field of view is vertical; local zenith is up.</p>
    <h3>Time, place, and frames</h3><p>All input is UTC, 1900–2100. Astronomy Engine approximates UT1 as UTC and estimates TT with its default Espenak–Meeus ΔT model. The engine observer accepts north-positive geodetic latitude, east-positive longitude, and elevation in meters above mean sea level. It uses a rotating oblate Earth; no terrain, geoid survey, horizon dip, or atmospheric refraction is applied here.</p>
    <p>Heliocentric positions are geometric EQJ/J2000 vectors in AU, rotated to the J2000 ecliptic. Earth sky uses Equator with the actual observer, then EQD right ascension in hours / declination in degrees for Horizon. HOR axes are north, west, zenith. The apparent Sun includes light-time and aberration; the engine’s Moon branch uses GeoMoon directly. Earth observer parallax is retained for both.</p>
    <h3>Phases and eclipses</h3><p>Moon phase is the Sun–Moon–observer angle, not elongation. The sphere receives light from that physical vector even when overview distances are enlarged. Disks use spherical radii of 695,700 km (Sun) and 1,737.4 km (Moon). Obscuration is angular-circle overlap, not a brightness prediction.</p>
    <p>Library contacts use a shadow cone and mean Moon radius. Its own obscuration uses a 1,736 km polar Moon radius; that library number is retained only in the exported event record. Live contacts/containment can differ by seconds near boundaries. The library skips fully nighttime eclipses; HELIOS does not replace an unavailable current event with a later one. Searches run in a terminable worker, with a 12-second wall-time budget and a five-year limit for “Next”.</p>
    <p>The contact solver’s one-second numerical tolerance is not one-second physical accuracy. Astronomy Engine advertises roughly ±1 arcminute positional accuracy, not navigation-grade precision. Its event-kind helper includes a 14 m umbra-sign bias; the live disk geometry does not. The library checks refracted Sun-center visibility at C1 or C4, while this instrument separately clips unrefracted disks against your horizon.</p>
    <p>Independent reference fixtures use 0 m elevation, not the city presets’ elevations. At Albuquerque’s height-zero annular peak, library obscuration is about 89.5998%, versus 89.7444% for these mean-radius disks. <a href="https://aa.usno.navy.mil/data/Eclipse2024#notes" target="_blank" rel="noopener noreferrer">USNO uses different solar-radius and ΔT conventions</a>; comparison within a minute is meaningful, not second-exact agreement.</p>
    <h3>Art, not extra precision</h3><p>Planet surfaces, cloud bands, lunar markings, background stars, faint fill light, and the totality corona are original illustrative artwork, not maps or calibrated photometry. The corona appears only during geometric totality with the full Sun above the horizon. No Baily’s beads, terrain, weather, optical inversion, lunar-eclipse shading, or observatory-grade accuracy is claimed. Giant planets have cloud-top/reference spheres, not solid ground.</p>
    <p>Body poles and rotations use the engine’s IAU orientation model. Non-Earth views are orbital reference views, not calibrated alien surface observations. The Earth globe shares the picker’s schematic geography; only the local Earth sky is a geodetic observing instrument.</p>
    <h3>Primary sources</h3><p><a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noopener noreferrer">Astronomy Engine / official repository</a> · MIT, Don Cross. <a href="${siteUrl('third-party/astronomy-engine-LICENSE.txt')}" target="_blank" rel="noopener noreferrer" data-h-license>Read the full MIT license</a>. This project uses the installed 2.1.19 typed API and ESM implementation. <a href="https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2024Apr08Tpath.html" target="_blank" rel="noopener noreferrer">NASA / 8 April 2024 eclipse path</a>. <a href="https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2023Oct14Apath.html" target="_blank" rel="noopener noreferrer">NASA / 14 October 2023 annular path</a>.</p>
  </dialog>`;
}

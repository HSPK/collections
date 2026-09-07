import { escapeMarkup } from '../../core/page';
import { elements } from './mechanics';
import type { Flight, Prediction } from './flight';
import { MISSIONS } from './missions';
import type { Mission } from './missions';

export const number = (value: number, digits = 1) => value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const signed = (value: number, digits = 4) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
export function clock(seconds: number): string {
  const rounded = Math.max(0, Math.floor(seconds + 1e-7));
  return `${String(Math.floor(rounded / 3600)).padStart(2, '0')}:${String(Math.floor(rounded / 60) % 60).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}
export const duration = (seconds: number) => seconds >= 3600 ? `${number(seconds / 3600, 2)} h` : `${number(seconds / 60, 1)} min`;

export function deskMarkup(id: string): string {
  return `
    <div class="apsis-desk">
      <header class="apsis-masthead">
        <div class="apsis-brand">
          <svg class="apsis-mark" viewBox="0 0 52 52" fill="none" aria-hidden="true"><path d="M8 43 26 7l18 36M15 31h22" stroke="currentColor" stroke-width="2"/><ellipse cx="27" cy="28" rx="23" ry="9" transform="rotate(-28 27 28)" stroke="currentColor"/><circle cx="46" cy="17" r="3" fill="currentColor"/></svg>
          <h1 id="${id}-title">apsis<span class="apsis-brand-dot">.</span></h1>
          <div class="apsis-brand-caption">ORBITAL<br>FLIGHT DESK</div>
        </div>
        <div class="apsis-masthead-right"><span class="apsis-edition">EARTH OPERATIONS / 001</span><button type="button" data-apsis-notes>Field notes <span aria-hidden="true">↗</span></button><button type="button" data-apsis-export>Export flight <span aria-hidden="true">↓</span></button></div>
      </header>

      <div class="apsis-program-bar">
        <div class="apsis-program-select"><label for="${id}-mission">FLIGHT PROGRAM</label><select id="${id}-mission" data-apsis-mission>${MISSIONS.map((mission) => `<option value="${mission.id}">${mission.code} / ${mission.title}</option>`).join('')}</select></div>
        <p class="apsis-program-description" data-apsis-program-description></p>
        <span class="apsis-model-tag"><i aria-hidden="true"></i> TWO-BODY SIMULATION</span>
      </div>

      <div class="apsis-workbench" data-project-preview>
        <div class="apsis-flight-bay">
          <section class="apsis-scene" data-apsis-scene aria-label="Earth orbital scene">
            <div class="apsis-scene-heading"><span class="apsis-eyebrow">01 / ORBITAL FRAME</span><span class="apsis-frame-tag">ECI · +Z NORTH</span></div>
            <div class="apsis-altitude"><span>LIVE ALTITUDE</span><div><output data-apsis-altitude>400.0</output><span>km</span></div><p><output data-apsis-speed>7.6726</output> km/s <span>VELOCITY</span></p></div>
            <div class="apsis-flight-state" data-apsis-flight-state>PAUSED</div>
            <div class="apsis-scale"><span class="apsis-scale-rule" data-apsis-scale-rule aria-hidden="true"></span><span>DISTANCE REFERENCE</span><strong><output data-apsis-scale-distance>2,000</output> <small>km</small></strong><span>AT EARTH CENTER</span></div>
            <div class="apsis-scene-tools">
              <div class="apsis-view-buttons" aria-label="Camera view"><button type="button" data-apsis-view="oblique" aria-pressed="true">Oblique</button><button type="button" data-apsis-view="north" aria-pressed="false">Polar</button><button type="button" data-apsis-view="edge" aria-pressed="false">Edge</button></div>
              <div class="apsis-zoom-buttons"><button type="button" data-apsis-zoom="in" aria-label="Zoom in">+</button><button type="button" data-apsis-zoom="out" aria-label="Zoom out">−</button><button type="button" data-apsis-fit>Fit</button></div>
            </div>
            <p class="apsis-camera-hint">DRAG TO ORBIT · SCROLL TO ZOOM</p>
          </section>
          <div class="apsis-scene-caption"><div class="apsis-legend" aria-label="Orbit legend"><span><i class="apsis-key-live"></i>Osculating orbit</span><span><i class="apsis-key-plan"></i>Planned flight</span><span><i class="apsis-key-target"></i>Target orbit</span></div><span class="apsis-caption-note">Solid Earth occludes far-side arcs.</span></div>
          <div class="apsis-transport">
            <div class="apsis-clock"><span>MISSION ELAPSED / SIM TIME</span><output data-apsis-clock>T+00:00:00</output></div>
            <div class="apsis-playback"><button class="apsis-run" type="button" data-apsis-run aria-label="Resume simulation"><span aria-hidden="true" data-apsis-run-icon>▶</span><span data-apsis-run-text>Run</span></button><button type="button" data-apsis-step>+60 s</button></div>
            <div class="apsis-warp"><label for="${id}-warp">Time warp</label><select id="${id}-warp" data-apsis-warp><option value="1">1×</option><option value="60">60×</option><option value="300" selected>300×</option><option value="600">600×</option></select></div>
            <div class="apsis-history"><button type="button" data-apsis-undo disabled>Undo</button><button type="button" data-apsis-reset>Reset</button></div>
          </div>
          <p class="apsis-time-note" data-apsis-time-note>300 simulation seconds per real second, at most. Slows under load; hidden tabs do not advance.</p>
        </div>

        <aside class="apsis-director" aria-label="Mission planning and maneuver timeline">
          <section class="apsis-brief">
            <div class="apsis-section-line"><span class="apsis-eyebrow">02 / FLIGHT DIRECTOR</span><span class="apsis-mission-code" data-apsis-code>01</span></div>
            <h2 data-apsis-mission-title>First light</h2>
            <p data-apsis-mission-description></p>
            <dl class="apsis-targets"><div><dt>Target Pe</dt><dd data-apsis-target-pe></dd></div><div><dt>Target Ap</dt><dd data-apsis-target-ap></dd></div><div><dt>Inclination</dt><dd data-apsis-target-inc></dd></div></dl>
            <div class="apsis-goal" data-apsis-goal><span class="apsis-goal-mark" aria-hidden="true">○</span><div><strong data-apsis-goal-text>Target orbit not yet acquired</strong><span data-apsis-goal-error></span></div></div>
          </section>

          <section class="apsis-planner">
            <div class="apsis-section-line"><h3>Transfer solution</h3><span class="apsis-small-label" data-apsis-planner-type>HOHMANN</span></div>
            <div class="apsis-planner-input" data-apsis-target-field><label for="${id}-target">Circular target altitude <span>km</span></label><input id="${id}-target" data-apsis-plan-altitude type="number" min="160" max="50000" step="10" value="2000" inputmode="decimal"></div>
            <div class="apsis-plan-numbers"><div><span>REQUIRED Δv</span><strong><output data-apsis-plan-cost>—</output> <small>km/s</small></strong></div><div><span>TIME TO FINAL BURN</span><strong><output data-apsis-plan-duration>—</output></strong></div></div>
            <button type="button" class="apsis-primary" data-apsis-build>Build transfer <span aria-hidden="true">↗</span></button>
            <p class="apsis-plan-hint" data-apsis-plan-hint>Two impulses. One transfer ellipse.</p>
          </section>

          <section class="apsis-timeline">
            <div class="apsis-section-line"><h3>Maneuver timeline</h3><span class="apsis-small-label" data-apsis-burn-count>00 QUEUED</span></div>
            <ol class="apsis-burn-list" data-apsis-timeline></ol>
            <button type="button" class="apsis-execute" data-apsis-execute disabled>Execute next burn <span aria-hidden="true">→</span></button>
            <p class="apsis-execute-note">Coasts to the exact event, applies its impulse, then pauses. Run also executes queued burns.</p>
          </section>
        </aside>
      </div>
      <div class="apsis-status-strip"><span class="apsis-status-indicator" aria-hidden="true"></span><p role="status" aria-live="polite" data-apsis-status>Paused at launch. Build the transfer to plot your first flight.</p><span data-apsis-reduced hidden>REDUCED MOTION · MANUAL START</span></div>

      <div class="apsis-analysis-grid">
        <section class="apsis-prediction-panel" aria-labelledby="${id}-prediction-title">
          <div class="apsis-section-line"><div><span class="apsis-eyebrow">03 / LOOK AHEAD</span><h2 id="${id}-prediction-title">Before the burn.</h2></div><span class="apsis-small-label">ALTITUDE / SIM TIME</span></div>
          <div class="apsis-chart" data-apsis-chart></div>
          <div class="apsis-inspect-heading"><label for="${id}-inspect">Inspect projected flight</label><output data-apsis-inspect-time>LIVE</output></div>
          <input id="${id}-inspect" data-apsis-inspect type="range" min="0" max="6000" step="1" value="0" aria-describedby="${id}-inspect-help">
          <div class="apsis-inspector-readings"><span><b data-apsis-inspect-altitude>400.0</b> km altitude</span><span><b data-apsis-inspect-speed>7.6726</b> km/s</span><span><b data-apsis-inspect-budget>1.2000</b> km/s remaining</span><button type="button" data-apsis-live>Return to live</button></div>
          <p id="${id}-inspect-help" class="apsis-hint">Preview only: the diamond marks a possible future, not the live spacecraft. Scrubbing pauses the clock; it never spends fuel.</p>
        </section>
        <section class="apsis-telemetry" aria-labelledby="${id}-telemetry-title">
          <div class="apsis-section-line"><h2 id="${id}-telemetry-title">State of flight</h2><span class="apsis-small-label">LIVE / ECI</span></div>
          <dl class="apsis-metrics">
            <div><dt>Periapsis altitude</dt><dd data-apsis-metric="periapsis"></dd></div>
            <div><dt>Apoapsis altitude</dt><dd data-apsis-metric="apoapsis"></dd></div>
            <div><dt>Inclination</dt><dd data-apsis-metric="inclination"></dd></div>
            <div><dt>Orbital period</dt><dd data-apsis-metric="period"></dd></div>
            <div><dt>Eccentricity</dt><dd data-apsis-metric="eccentricity"></dd></div>
            <div><dt>Specific energy</dt><dd data-apsis-metric="energy"></dd></div>
          </dl>
          <div class="apsis-budget"><div><span>Δv remaining</span><strong><output data-apsis-budget>1.2000</output> km/s</strong></div><meter data-apsis-budget-meter min="0" max="1.2" value="1.2" aria-label="Remaining delta-v budget"></meter><p><output data-apsis-reserved>0.0000</output> km/s reserved by the plan</p></div>
          <details class="apsis-vector-details"><summary>Cartesian state &amp; orbital angles</summary><pre data-apsis-state-vectors></pre></details>
        </section>

        <section class="apsis-burn-editor" aria-labelledby="${id}-burn-title">
          <div class="apsis-section-line"><div><span class="apsis-eyebrow">04 / MANUAL FLIGHT</span><h2 id="${id}-burn-title" data-apsis-editor-title>Write an impulse.</h2></div><span class="apsis-small-label">ORTHONORMAL RTN FRAME</span></div>
          <p>Shape the orbit yourself. Positive T accelerates along-track, R points away from Earth, and N tips the orbital plane.</p>
          <form data-apsis-burn-form novalidate>
            <div class="apsis-burn-fields">
              <div><label for="${id}-delay">From live time <span>s</span></label><input id="${id}-delay" data-apsis-delay type="number" min="0" max="21600" step="1" value="120" inputmode="decimal"></div>
              <div class="apsis-axis-t"><label for="${id}-prograde">Prograde · T <span>km/s</span></label><input id="${id}-prograde" data-apsis-prograde type="number" step="0.001" value="0.050" inputmode="decimal"></div>
              <div class="apsis-axis-r"><label for="${id}-radial">Radial · R <span>km/s</span></label><input id="${id}-radial" data-apsis-radial type="number" step="0.001" value="0" inputmode="decimal"></div>
              <div class="apsis-axis-n"><label for="${id}-normal">Normal · N <span>km/s</span></label><input id="${id}-normal" data-apsis-normal type="number" step="0.001" value="0" inputmode="decimal"></div>
            </div>
            <div class="apsis-editor-actions"><span>Impulse magnitude <strong data-apsis-draft-cost>0.0500 km/s</strong></span><button type="button" data-apsis-cancel-edit hidden>Cancel edit</button><button type="submit" data-apsis-queue>Queue impulse <span aria-hidden="true">+</span></button></div>
            <p class="apsis-editor-error" data-apsis-editor-error role="alert" hidden></p>
          </form>
          <p class="apsis-hint">Inputs are km/s, not m/s. 0.050 km/s = 50 m/s. The frame is evaluated at execution, not when you write the burn. Up to eight queued impulses; six-hour horizon.</p>
        </section>
        <section class="apsis-checklist" aria-labelledby="${id}-checklist-title">
          <span class="apsis-eyebrow">YOUR FIRST FLIGHT</span><h2 id="${id}-checklist-title">Three deliberate moves.</h2>
          <ol><li><span>01</span><div><strong>Plot the solution</strong><p>Build a plan. Coral is the flight you have not flown yet.</p></div></li><li><span>02</span><div><strong>Read the trajectory</strong><p>Scrub the altitude trace. Edit an impulse to see what changes.</p></div></li><li><span>03</span><div><strong>Commit, then coast</strong><p>Execute each burn, or run the clock. Match both apsides within 5 km and the plane within 0.1°.</p></div></li></ol>
        </section>
      </div>

      <section class="apsis-library" aria-labelledby="${id}-library-title">
        <div class="apsis-section-line"><div><span class="apsis-eyebrow">FLIGHT PROGRAMS</span><h2 id="${id}-library-title">Same gravity. Different problems.</h2></div><span class="apsis-small-label">3 MISSIONS / NO SCRIPTED OUTCOMES</span></div>
        <div class="apsis-mission-library">${MISSIONS.map((mission) => `<button type="button" class="apsis-mission-option" data-apsis-load="${mission.id}"><span>${mission.code} / ${mission.subtitle}</span><strong>${mission.title} <b aria-hidden="true">↗</b></strong><p>${mission.description}</p><em>${number(mission.periapsis, 0)} × ${number(mission.apoapsis, 0)} km · ${number(mission.inclination)}° · Δv ${number(mission.budget, 1)} km/s</em></button>`).join('')}</div>
      </section>

      <details class="apsis-notes" data-apsis-model-notes>
        <summary><span>Field notes</span><span>The model, its coordinates &amp; its limits <b aria-hidden="true">+</b></span></summary>
        <div class="apsis-notes-grid">
          <section><h3>One planet. One point mass.</h3><p>Earth is a sphere of radius 6,371 km with gravitational parameter μ = 398,600.4418 km³/s². The spacecraft has negligible mass. All physics uses kilometers, seconds, and km/s in an Earth-centered inertial frame. +Z is north; +X is the initial ascending-node direction.</p><p>Universal-variable Kepler propagation solves the two-body motion with at most 60-second substeps for event detection. Surface crossings stop at the impact time. Unbound, outward-moving craft stop at a 200,000 km radius. That boundary is a sandbox limit, not Earth’s sphere of influence.</p><p>There is no atmosphere, drag, oblateness (J2), Moon, Sun gravity, thrust duration, spacecraft attitude, or fuel mass. Delta-v is a finite ideal impulse budget, not propellant mass. This is a learning instrument, not a navigation system.</p></section>
          <section><h3>A burn follows the spacecraft.</h3><p>R = r / |r|, N = (r × v) / |r × v|, T = N × R. These three unit vectors form an orthonormal moving frame. “Prograde” here means transverse, along-track T. Away from an apsis, it is not exactly parallel to velocity. The budget pays √(T² + R² + N²) for each impulse.</p><p>Specific orbital energy is ε = |v|² / 2 − μ / |r| in km²/s². A bound ellipse has ε &lt; 0 and period 2π√(a³/μ). Unbound orbits have no apoapsis or period; radial trajectories have no orbital plane. Circular periapsis direction and equatorial ascending nodes are undefined, not silently set to zero.</p><p>The target is a reference orbit, not a moving vehicle. Completion requires both apsis altitudes within 5 km and the full orbital-plane normals within 0.1°. An elliptical goal also requires the periapsis direction within 0.2°, so a rotated ellipse does not count. This does not certify phasing, arrival position, or a rendezvous.</p></section>
          <section><h3>Read the drawing.</h3><p>Ice blue is the instantaneous osculating orbit, which assumes no future burns. Dashed sage is the mission’s target orbit. Coral follows the queued sequence, with diamonds at impulses. The pale diamond is the scrubbed prediction. Earth hides the far side of every arc; rotate the view to inspect it.</p><p>Geometry uses true relative distances, with enlarged spacecraft and maneuver markers for visibility. Coastlines are schematic and generated locally; the fixed sunlight and the 86,164-second Earth spin are visual references, not an ephemeris.</p><p>The altitude chart is a sampled projection; impulses execute at their exact scheduled times even between chart samples. Changing the Hohmann target does not change the selected mission’s completion criteria.</p></section>
          <section><h3>You control the clock.</h3><p>Mission elapsed time is simulation time. Time warp is a maximum rate: 300× requests 300 simulation seconds per real second. Work is capped, so the clock slows under heavy rendering load and pauses in hidden tabs. Rendering never advances the model by itself.</p><p>Flights always open paused. Enabling reduced motion pauses a running flight, without moving the camera. Run is an explicit opt-in. Scrub, edit, step, execute, and undo pause the clock. Reset restores the selected mission and its entire budget.</p><p>Keyboard: Tab to every control. On the scene, arrows orbit, +/− zoom, Home fits. Range-slider arrows inspect the future. Export downloads the full-precision live state, remaining budget, scheduled/executed impulses, assumptions, and the last 200 flight events as JSON. It is a log, not an importable save format.</p></section>
        </div>
      </details>
      <details class="apsis-log"><summary>Flight recorder <span data-apsis-log-count>1 event</span></summary><div data-apsis-log></div></details>
      <footer class="apsis-footer"><strong>APSIS / THE POINT WHERE AN ORBIT TURNS.</strong><span>Local computation. No network assets. No autopilot mythology.</span></footer>
    </div>`;
}

export function timelineMarkup(flight: Flight): string {
  if (!flight.maneuvers.length) return '<li class="apsis-timeline-empty"><span aria-hidden="true">＋</span><p>No impulses queued.<br>Build a solution or use the Manual pane.</p></li>';
  return flight.maneuvers.slice(-10).map((maneuver, index) => {
    const executed = maneuver.status === 'executed';
    return `<li class="apsis-burn ${executed ? 'apsis-burn-executed' : ''}" data-apsis-burn="${maneuver.id}">
      <span class="apsis-burn-index">${executed ? '✓' : String(index + 1).padStart(2, '0')}</span>
      <div class="apsis-burn-content"><div><strong>${escapeMarkup(maneuver.label)}</strong><time title="${maneuver.time.toFixed(4)} simulation seconds">T+${clock(maneuver.time)}</time></div>
      <p>T ${signed(maneuver.burn.prograde, 4)} <span>R ${signed(maneuver.burn.radial, 3)} · N ${signed(maneuver.burn.normal, 3)} km/s</span></p>
      ${executed ? '<span class="apsis-small-label">IMPULSE EXECUTED</span>' : `<div class="apsis-burn-actions"><button type="button" data-apsis-edit="${maneuver.id}" aria-label="Edit burn ${index + 1}: ${escapeMarkup(maneuver.label)}">Edit</button><button type="button" data-apsis-remove="${maneuver.id}" aria-label="Remove burn ${index + 1}: ${escapeMarkup(maneuver.label)}">Remove</button></div>`}
      </div></li>`;
  }).join('');
}

export function chartMarkup(prediction: Prediction, mission: Mission, hasPlan: boolean, liveTime: number, availableWidth = 800): string {
  const width = Math.max(240, availableWidth), height = 188, left = 57, right = 18, top = 18, bottom = 32;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const highest = Math.max(mission.targetApoapsis, ...prediction.points.map((point) => elements(point.state).altitude), 500);
  const maximum = Math.ceil(highest * 1.15 / 100) * 100;
  const timeTicks = width < 480 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
  const x = (time: number) => left + (time - liveTime) / prediction.duration * plotWidth;
  const y = (altitude: number) => top + (1 - altitude / maximum) * plotHeight;
  const path = prediction.points.map((point, index) => `${index ? 'L' : 'M'}${x(point.time).toFixed(2)},${y(elements(point.state).altitude).toFixed(2)}`).join(' ');
  return `<svg viewBox="0 0 ${width} ${height}" data-apsis-chart-max="${maximum}" role="img" aria-label="Predicted altitude over the next ${duration(prediction.duration)}. ${hasPlan ? 'Includes all queued burns.' : 'Unpowered coast.'}">
    ${[0, 0.5, 1].map((fraction) => `<line x1="${left}" y1="${y(maximum * fraction)}" x2="${width - right}" y2="${y(maximum * fraction)}" class="apsis-chart-grid"/><text x="${left - 9}" y="${y(maximum * fraction) + 4}" text-anchor="end">${number(maximum * fraction, 0)}</text>`).join('')}
    <rect x="${left}" y="${y(mission.targetApoapsis)}" width="${plotWidth}" height="${Math.max(1, y(mission.targetPeriapsis) - y(mission.targetApoapsis))}" class="apsis-chart-target"/>
    <path d="${path}" class="apsis-chart-path ${hasPlan ? 'apsis-chart-planned' : ''}" data-apsis-chart-path/>
    <line x1="${left}" x2="${left}" y1="${top}" y2="${height - bottom}" class="apsis-chart-cursor" data-apsis-chart-cursor/>
    <circle cx="${left}" cy="${y(elements(prediction.points[0].state).altitude)}" r="4" class="apsis-chart-dot" data-apsis-chart-dot/>
    ${timeTicks.map((fraction) => `<text data-apsis-time-tick x="${left + fraction * plotWidth}" y="${height - 8}" text-anchor="${fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'}">+${number(prediction.duration * fraction / 60, 0)} min</text>`).join('')}
    <text x="7" y="13">km</text>
    <text x="${width - right}" y="${Math.max(12, y(mission.targetApoapsis) - 6)}" text-anchor="end" class="apsis-chart-target-label">TARGET ${mission.targetPeriapsis === mission.targetApoapsis ? 'ALTITUDE' : 'APSIS BAND'}</text>
  </svg>`;
}

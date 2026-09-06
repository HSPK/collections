import { JOINTS, RAD } from './arm';
import { PRESETS } from './state';
import type { Trajectory } from './planner';
import { sampleTrajectory } from './planner';

export function markup(id: string): string {
  return `
    <div class="morrow-mast">
      <div class="morrow-wordmark"><span class="morrow-symbol" aria-hidden="true">m.</span><div><h1 id="${id}-title">MORROW</h1><p>Motion has to fit the world.</p></div></div>
      <div class="morrow-edition"><span>SPATIAL ROBOTICS ATELIER</span><b>M–06 / STUDY 068</b></div>
    </div>
    <nav class="morrow-mobile-views" aria-label="Workbench views">
      <button type="button" data-morrow-view="cell" aria-pressed="true">Workcell</button>
      <button type="button" data-morrow-view="inspector" aria-pressed="false">Inspector</button>
      <button type="button" data-morrow-view="motion" aria-pressed="false">Motion</button>
    </nav>
    <div class="morrow-workspace">
      <section class="morrow-workcell" aria-label="Interactive robot workcell">
        <div class="morrow-scene" data-morrow-scene data-project-preview>
          <div class="morrow-scene-top"><span><i></i> LOCAL SIMULATION</span><span>Y ↑ &nbsp; 1 UNIT = 1 M</span></div>
          <div class="morrow-scene-bottom"><span data-morrow-live-label>LIVE / AT REST</span><span>100 MM GRID</span></div>
        </div>
        <div class="morrow-camera-bar">
          <label>Interact <select data-morrow-mode aria-label="Workcell interaction mode">
            <option value="camera">Camera / orbit</option><option value="xz">Target / XZ plane</option>
            <option value="xy">Target / XY plane</option><option value="yz">Target / YZ plane</option>
            <option value="x">Target / X axis</option><option value="y">Target / Y axis</option><option value="z">Target / Z axis</option>
          </select></label>
          <button type="button" data-morrow-fit>Fit view</button>
          <label class="morrow-check"><input type="checkbox" data-morrow-frames> Frames</label>
        </div>
        <p class="morrow-interaction-hint" data-morrow-mode-hint>Drag to orbit. Scroll to zoom. Focus the scene and use arrow keys. Home fits the workcell.</p>
        <div class="morrow-live-strip">
          <div><span>TOOL / WORLD M</span><output data-morrow-tool>0.000 / 0.000 / 0.000</output></div>
          <div><span>CLEARANCE ABOVE 12 MM MARGIN</span><output data-morrow-clearance>—</output></div>
          <div><span>GRIPPER</span><output data-morrow-payload>OPEN / NO PAYLOAD</output></div>
        </div>
      </section>
      <aside class="morrow-desk" aria-label="Motion inspector">
        <div class="morrow-task-heading"><span class="morrow-eyebrow">WORKCELL STUDY</span>
          <select data-morrow-preset aria-label="Workcell study">${PRESETS.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
          <h2 data-morrow-task-title>A small part. A considered path.</h2><p data-morrow-task-description></p>
        </div>
        <div class="morrow-tabs" role="tablist" aria-label="Inspector panes">
          <button type="button" id="${id}-pose-tab" role="tab" aria-selected="true" aria-controls="${id}-pose" data-morrow-tab="pose">Pose</button>
          <button type="button" id="${id}-joints-tab" role="tab" aria-selected="false" aria-controls="${id}-joints" tabindex="-1" data-morrow-tab="joints">Joints</button>
          <button type="button" id="${id}-program-tab" role="tab" aria-selected="false" aria-controls="${id}-program" tabindex="-1" data-morrow-tab="program">Program</button>
        </div>
        <section id="${id}-pose" role="tabpanel" aria-labelledby="${id}-pose-tab" data-morrow-pane="pose">
          <div class="morrow-inspector-heading"><h3>Tool target</h3><span>WORLD FRAME</span></div>
          <div class="morrow-fields">
            ${['X', 'Y', 'Z'].map(axis => `<label>${axis} <span>m</span><input type="number" aria-label="Target ${axis} in metres" data-morrow-pose="${axis.toLowerCase()}" step="0.001" min="-3" max="3"></label>`).join('')}
          </div>
          <div class="morrow-fields">
            ${['RX', 'RY', 'RZ'].map(axis => `<label>${axis} <span>°</span><input type="number" aria-label="Target ${axis} in degrees" data-morrow-pose="${axis.toLowerCase()}" step="0.1" min="-180" max="180"></label>`).join('')}
          </div>
          <p class="morrow-note">Intrinsic XYZ angles · stored as a quaternion.<br>Ghost = proposed pose, never executed motion.</p>
          <div class="morrow-shortcuts"><button type="button" data-morrow-source>Source</button><button type="button" data-morrow-receiver>Receiver</button><button type="button" data-morrow-current>Live pose</button></div>
        </section>
        <section id="${id}-joints" role="tabpanel" aria-labelledby="${id}-joints-tab" data-morrow-pane="joints" hidden>
          <div class="morrow-inspector-heading"><h3>Joint target</h3><span>PREVIEW ONLY</span></div>
          <div class="morrow-joints">${JOINTS.map((j, i) => `
            <label><span>J${i + 1} <b>${j.name}</b></span><input type="number" data-morrow-joint="${i}" aria-label="Joint ${i + 1} target in degrees" min="${Math.round(j.min / RAD)}" max="${Math.round(j.max / RAD)}" step="0.1"><span>°</span></label>`).join('')}</div>
          <p class="morrow-note">Edits change the ghost and target, not the live arm. The same limits apply to IK and every planned edge.</p>
        </section>
        <section id="${id}-program" role="tabpanel" aria-labelledby="${id}-program-tab" data-morrow-pane="program" hidden>
          <div class="morrow-inspector-heading"><h3>Waypoint queue</h3><span data-morrow-queue-count>0 / 6</span></div>
          <ol class="morrow-queue" data-morrow-queue></ol>
          <div class="morrow-shortcuts"><button type="button" data-morrow-queue-add>Queue target +</button><button type="button" data-morrow-queue-clear>Clear queue</button></div>
          <p class="morrow-note">Queued poses run in order, then the current target. A failed segment rejects the entire plan.</p>
          <label class="morrow-seed">Search seed<input type="number" min="0" max="999999" step="1" data-morrow-seed value="68"></label>
        </section>
        <div class="morrow-diagnostics">
          <div><span>KINEMATICS</span><b data-morrow-ik-state>Ready</b></div>
          <div class="morrow-residuals"><span>Position <output data-morrow-position-error>—</output></span><span>Angle <output data-morrow-angle-error>—</output></span></div>
          <div><span>TARGET COLLISION</span><b data-morrow-target-clearance>Not evaluated</b></div>
          <div><span>MOTION PLAN</span><b data-morrow-plan-state>Not planned</b></div>
        </div>
        <div class="morrow-main-actions"><button type="button" class="morrow-secondary" data-morrow-solve>Solve pose</button><button type="button" class="morrow-primary" data-morrow-plan>Plan motion <span aria-hidden="true">↗</span></button></div>
        <div class="morrow-grip-actions"><button type="button" data-morrow-grip>Grip coupon</button><button type="button" data-morrow-release disabled>Release at receiver</button></div>
      </aside>
    </div>
    <section class="morrow-execution" aria-label="Execution and joint trace">
      <div class="morrow-execution-heading"><div><span class="morrow-eyebrow">INSPECTABLE EXECUTION</span><h2>A path, not a promise.</h2></div><span class="morrow-motion-state" data-morrow-motion-state>WAITING FOR A PLAN</span></div>
      <div class="morrow-transport">
        <button type="button" class="morrow-primary" data-morrow-run disabled>Run motion</button>
        <button type="button" data-morrow-step disabled>Step +0.1s</button>
        <button type="button" data-morrow-reverse disabled>Reverse to start</button>
        <button type="button" data-morrow-live disabled>Return to live</button>
        <button type="button" data-morrow-reset>Reset study</button>
        <output data-morrow-time>0.00 / 0.00 s</output>
      </div>
      <label class="morrow-scrub-label">Inspect certified motion<input type="range" min="0" max="1" step="0.001" value="0" data-morrow-scrub disabled aria-label="Certified trajectory time"></label>
      <div class="morrow-trace" data-morrow-trace><p>Plan a route to reveal six joint traces and a speed-limited timeline.</p></div>
      <div class="morrow-trace-legend">${JOINTS.map((_, i) => `<span class="morrow-trace-j${i}">J${i + 1}</span>`).join('')}<span>Cubic timing · stops at nodes · seconds / radians</span></div>
      <div class="morrow-joint-readout" aria-label="Displayed joint angles">${JOINTS.map((_, i) => `<span>J${i + 1}<output data-morrow-live-joint="${i}">0.0°</output></span>`).join('')}</div>
    </section>
    <p class="morrow-status" role="status" aria-live="polite" data-morrow-status>Choose a target. Solve the pose, then plan a collision-checked motion.</p>
    <footer class="morrow-footer">
      <div class="morrow-file-actions"><button type="button" data-morrow-undo disabled>Undo edit</button><button type="button" data-morrow-redo disabled>Redo</button><button type="button" data-morrow-save>Save project</button><button type="button" data-morrow-load>Load project</button><button type="button" data-morrow-export disabled>Export path JSON</button><input type="file" accept=".json,application/json" data-morrow-file hidden></div>
      <details><summary>Model, limits &amp; keyboard guide</summary><div class="morrow-guide">
        <p><b>One model, all the way through.</b> Right-handed world: +Y up; X/Z on the table. Metres and radians internally. Each joint translates in its parent frame, then rotates about its local axis. Axis sequence: Y, Z, Z, X, Z, X. The tool points along local +X. Link offsets in metres: (0,.24,0), (0,.18,0), (.42,0,0), (.36,0,0), (.12,0,0), (.12,0,0), tool (.14,0,0).</p>
        <p><b>Bounded, not omniscient.</b> Damped Jacobian IK: 4 starts × 160 iterations; 1.5 mm / 0.69° convergence. Seeded RRT-connect: 900 iterations, 1,800 nodes, 6,000 edge attempts per segment. Capsule/box collision geometry includes self-collision and a 12 mm margin. Adjacent links and designated gripper/part contact are exempt. Each edge is conservatively certified with adaptive displacement bounds, up to 2,048 samples. Budget failure is not proof of impossibility.</p>
        <p><b>Interaction.</b> Camera and target modes are separate. In a target plane, Left/Right moves its first axis and Up/Down its second. In an axis mode, arrows move only that axis. Each press is 10 mm; Shift is 1 mm. Drag anywhere in the scene to move on the explicit plane without snapping. Inputs provide the same controls without a pointer.</p>
        <p><b>Simulation only.</b> A held coupon uses the actual tool transform and is included in clearance tests. Grasp within 25 mm / 11.5°; release in the receiver. Fixtures support static parts; no gravity or contact dynamics. Cubic timing respects joint speeds, not acceleration, torque, dynamics or industrial safety certification. Scrubbing is inspection, not real-time playback. No hardware connection.</p>
      </div></details>
      <p>MORROW / An original six-axis workcell. Local files only. No hardware interface.</p>
    </footer>`;
}

export function traceMarkup(trajectory: Trajectory): string {
  const colors = ['#d97742', '#657f57', '#4b7b8c', '#9b7469', '#a08a43', '#71729b'];
  const paths = JOINTS.map((_, joint) => {
    const points = Array.from({ length: 121 }, (_, i) => {
      const q = sampleTrajectory(trajectory, trajectory.duration * i / 120);
      return `${i === 0 ? 'M' : 'L'}${(12 + i / 120 * 956).toFixed(2)},${(57 - q[joint] / Math.PI * 42).toFixed(2)}`;
    }).join(' ');
    return `<path d="${points}" stroke="${colors[joint]}"/>`;
  }).join('');
  return `<svg viewBox="0 0 980 116" role="img" aria-label="Six joint angle traces along the certified trajectory, horizontal axis seconds, vertical axis radians">
    <path d="M12 15H968M12 57H968M12 99H968" class="morrow-trace-grid"/>
    <g fill="none" stroke-width="1.8">${paths}</g>
    <line x1="12" y1="6" x2="12" y2="108" data-morrow-trace-cursor class="morrow-trace-cursor"/>
  </svg>`;
}

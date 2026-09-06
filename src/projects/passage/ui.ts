import { escapeMarkup } from '../../core/page';
import { PRESETS, PROFILES } from './presets';
import type { Layout } from './world';
import { floorOf } from './world';
import type { Route } from './route';

export function workbenchMarkup(id: string): string {
  return `
    <header class="passage-masthead">
      <div class="passage-wordmark"><span class="passage-kicker">SPATIAL FIELDNOTES / 067</span><h1 id="${id}-title">Passage<span aria-hidden="true">↗</span></h1></div>
      <div class="passage-deck"><p>A building, understood.</p><span>Interior navigation &amp; layout atlas</span></div>
      <div class="passage-history"><button data-passage-undo disabled>Undo</button><button data-passage-redo disabled>Redo</button><button data-passage-reset>Reset</button></div>
    </header>
    <div class="passage-building-line"><div><strong data-passage-building-name>The Meridian Library</strong><span data-passage-building-note>Three levels around a fern court. A fictional place; a real spatial problem.</span></div>
      <label>Layout study<select data-passage-preset aria-label="Layout study">${PRESETS.map((preset) => `<option value="${preset.id}">${preset.name}</option>`).join('')}<option value="custom" disabled>Custom / edited study</option></select></label>
    </div>
    <div class="passage-journey">
      <label><span class="passage-endpoint-a">A</span> From<select data-passage-start aria-label="Start landmark"></select></label>
      <button class="passage-swap" data-passage-swap aria-label="Swap start and destination">⇄</button>
      <label><span class="passage-endpoint-b">B</span> To<select data-passage-end aria-label="Destination landmark"></select></label>
      <label>Mobility<select data-passage-profile aria-label="Mobility profile">${PROFILES.map((profile) => `<option value="${profile.id}">${profile.name}</option>`).join('')}<option value="custom">Custom profile</option></select></label>
    </div>
    <div class="passage-viewbar">
      <nav class="passage-pane-nav" aria-label="Workbench panes">
        <button data-passage-pane="space" aria-pressed="true">Space</button><button data-passage-pane="plan" aria-pressed="false">Plan</button><button data-passage-pane="route" aria-pressed="false">Route</button><button data-passage-pane="edit" aria-pressed="false">Edit</button>
      </nav>
      <label>Level<select data-passage-floor aria-label="Displayed floor"></select></label>
      <label>Pointer<select data-passage-interaction aria-label="Pointer interaction"><option value="camera">Camera / inspect</option><option value="start">Pick start A</option><option value="end">Pick destination B</option></select></label>
    </div>
    <div class="passage-workbench" data-passage-workbench data-pane="space" data-project-preview>
      <section class="passage-pane passage-space-pane" aria-label="Building space" data-passage-panel="space">
        <div class="passage-panel-heading"><span><b>01</b> THE BUILDING</span><div><button data-passage-explode aria-pressed="true">Exploded</button><button data-passage-home aria-label="Reset building camera">Fit view</button></div></div>
        <div class="passage-space" data-passage-space></div>
        <div class="passage-space-footer"><span class="passage-north">N ↑</span><p data-passage-space-note>Exploded axonometric · vertical spacing ×1.8<br>All measurements use physical building coordinates.</p><span class="passage-scale" data-passage-building-scale>26 × 20 m / 3 LEVELS</span></div>
      </section>
      <section class="passage-pane passage-plan-pane" aria-label="Floor plan" data-passage-panel="plan">
        <div class="passage-panel-heading"><span><b>02</b> THE PLAN</span><label class="passage-check"><input data-passage-clearance type="checkbox"> Clearance</label></div>
        <div class="passage-plan" data-passage-plan tabindex="0" role="group" aria-label="Interactive floor plan. Select Pick start or Pick destination, use arrow keys to position the cursor, then Enter."></div>
        <div class="passage-plan-key"><span><i class="passage-key-path"></i>Route</span><span><i class="passage-key-open"></i>Open door</span><span><i class="passage-key-solid"></i>Occupied</span><span>0.5 m grid · N ↑</span></div>
        <div class="passage-plan-tools"><span>Plan zoom <output data-passage-plan-zoom>1×</output></span><button data-passage-zoom-out aria-label="Zoom out floor plan">−</button><button data-passage-zoom-in aria-label="Zoom in floor plan">+</button><button data-passage-plan-fit>Fit plan</button></div>
        <p class="passage-pick-hint" data-passage-pick-hint>Choose a picking mode, then click open floor space. Keyboard: focus the plan, arrows to move, Enter to place.</p>
      </section>
      <section class="passage-pane passage-route-pane" aria-label="Route inspector" data-passage-panel="route">
        <div class="passage-panel-heading"><span><b>03</b> THE JOURNEY</span><span data-passage-route-badge>No route yet</span></div>
        <div class="passage-metrics"><div><strong data-passage-distance>—</strong><span>metres travelled</span></div><div><strong data-passage-duration>—</strong><span>estimated seconds</span></div><div><strong data-passage-cost>—</strong><span data-passage-cost-label>cost / m-eq</span></div></div>
        <div class="passage-walk-controls"><button class="passage-primary" data-passage-walk disabled>Walk route</button><button data-passage-step disabled>Step +1 s</button><button data-passage-rewind disabled aria-label="Rewind route walk">↤</button><label>Speed<select data-passage-speed aria-label="Walk playback speed"><option value="1">1×</option><option value="4">4×</option></select></label></div>
        <label class="passage-scrub-label">Distance along route <output data-passage-walk-readout>0.0 m / 0.0 s</output><input type="range" min="0" max="1" step=".01" value="0" data-passage-scrub aria-label="Distance along route" disabled></label>
        <output class="passage-pose-readout" data-passage-pose-readout></output>
        <p class="passage-current-step" data-passage-current-step>Choose a journey to inspect its turns and floor changes.</p>
        <details class="passage-directions"><summary>Turn-by-turn &amp; floor changes <span data-passage-instruction-count></span></summary><ol data-passage-instructions></ol></details>
        <div class="passage-no-route" data-passage-no-route hidden><strong>No route is being drawn.</strong><p>Try a reversible change. The model will not invent a connection.</p><button data-passage-open-doors>Open all doors</button><button data-passage-open-portals>Restore connectors</button></div>
      </section>
      <section class="passage-pane passage-edit-pane" aria-label="Layout editor" data-passage-panel="edit">
        <div class="passage-panel-heading"><span><b>04</b> THE CONSTRAINTS</span><span>Every edit reroutes</span></div>
        <div class="passage-editor-scroll">
          <fieldset><legend>Body &amp; route preference</legend><div class="passage-field-pair"><label>Body diameter / m<input data-passage-diameter type="number" min=".4" max="1.5" step=".05" value=".5"></label><label>Safety margin / m<input data-passage-margin type="number" min="0" max=".2" step=".025" value=".05"></label></div>
            <label class="passage-check"><input type="checkbox" data-passage-stepfree> Step-free only · no stairs</label>
            <label>Search objective<select data-passage-objective><option value="comfort">Lowest comfort cost</option><option value="distance">Lowest graph distance</option></select></label>
            <p class="passage-help" data-passage-profile-note></p>
          </fieldset>
          <fieldset><legend>Doors on this level</legend><p class="passage-help">A checked door is open. Width changes the actual wall opening.</p><div data-passage-doors class="passage-door-list"></div></fieldset>
          <fieldset><legend>Vertical connections</legend><div data-passage-portals class="passage-portal-list"></div></fieldset>
          <fieldset><legend>Move the architecture</legend><label>Solid object<select data-passage-object></select></label><p class="passage-help">Move or resize a cabinet, table, or temporary wall in metres. These are solid geometry, not decorative overlays.</p>
            <div class="passage-field-pair"><label>X / m<input data-passage-object-x type="number" min="0" max="39" step=".25"></label><label>Z / m<input data-passage-object-z type="number" min="0" max="39" step=".25"></label><label>Width / m<input data-passage-object-w type="number" min=".25" max="12" step=".25"></label><label>Depth / m<input data-passage-object-d type="number" min=".25" max="12" step=".25"></label></div>
            <div class="passage-button-row"><button class="passage-primary" data-passage-apply-object>Apply geometry</button><button data-passage-add-object>Add partition</button><button data-passage-remove-object>Remove</button></div>
          </fieldset>
          <p class="passage-help">Moving an object into an endpoint or landing is allowed as a layout experiment. The resulting route error is explicit. Undo restores the previous geometry.</p>
        </div>
      </section>
    </div>
    <div class="passage-search-strip"><div><span class="passage-status-dot" aria-hidden="true"></span><p role="status" aria-live="polite" data-passage-status>Building the clearance graph…</p></div><div class="passage-search-actions"><span data-passage-progress></span><button data-passage-cancel>Cancel search</button><button data-passage-recompute hidden>Recompute</button></div></div>
    <div class="passage-bottom">
      <section><h2>Keep this study.</h2><p>Layouts retain geometry, openings, connectors, and mobility. Imported routes are always recomputed.</p><div class="passage-button-row"><button data-passage-save>Save snapshot</button><button data-passage-restore>Restore snapshot</button><button data-passage-export>Export JSON</button><button data-passage-import>Import JSON</button><button data-passage-svg>Export plan SVG</button></div><input type="file" accept=".json,application/json" data-passage-file hidden></section>
      <details class="passage-method"><summary>What this model knows</summary><p>One metre is one world unit. Y points up; X and Z form each floor. A 0.5 m grid tests a circular body plus clearance against every wall, door, object, and opening. Diagonal corner cutting is forbidden. Stairs and lifts use explicit 3D connectors; no route is substituted when search fails.</p><p>A* minimizes the selected graph cost. Default comfort cost = distance + stair distance × 0.65 + lift wait × 0.2 m/s. Travel time is separate: profile walking speed, 0.65 m/s on stairs for Walking, 1.1 m/s in the lift, and 8 seconds waiting per lift hop. Imports may change the profile and waits; Edit displays those values. Clearance overlays illustrate the body exclusion envelope.</p><p>Idealizations: walls are drawn cut to 0.85 m; stair motion follows flight centerlines rather than footfalls. Lift hops include an exit, re-entry, and fixed wait at each level, not a scheduling simulation. Grid resolution can reject very narrow but physically possible passages. No headroom, door swing sweep, fire code, evacuation certification, or crowd simulation is claimed.</p></details>
    </div>`;
}
export function roomOptions(layout: Layout, endpoint: 'start' | 'end') {
  const current = layout[endpoint], e = escapeMarkup;
  const room = layout.world.rooms.find((room) => room.point.floor === current.floor && room.point.x === current.x && room.point.z === current.z);
  return { value: room?.id ?? 'picked', html: `${!room ? `<option value="picked">Picked point / ${e(current.floor.toUpperCase())} / ${current.x.toFixed(2)}, ${current.z.toFixed(2)} m</option>` : ''}` +
    layout.world.floors.map((floor) => `<optgroup label="${e(floor.name)}">${layout.world.rooms.filter((room) => room.floor === floor.id)
      .map((room) => `<option value="${room.id}">${e(room.name)}</option>`).join('')}</optgroup>`).join('') };
}
export function instructionMarkup(route: Route | null, layout: Layout): string {
  return route?.instructions.map((instruction, i) => `<li><button data-passage-instruction="${i}"><span>${instruction.distance.toFixed(1)} m · ${escapeMarkup(floorOf(layout.world, instruction.floor).name)}</span>${escapeMarkup(instruction.text)}</button></li>`).join('') ?? '';
}

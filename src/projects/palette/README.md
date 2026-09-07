# Palette Kitchen

A standalone color recipe laboratory at `/projects/palette/`. Start with one of
six original recipes or submit a three/six-digit hex color. Five color-wheel
harmonies, companion saturation ("spice") and paper warmth generate a practical
base, companion, accent, paper and ink palette.

Select a pigment to edit, copy or pin it. Direct edits of generated pigments pin
them; pins survive recipe and slider changes. The base always stays exactly the
color supplied. Black/white comparisons, a type specimen, large-text proof and
the 25-pair contrast table use actual WCAG 2 sRGB relative luminance. Grayscale
proof is visual only, not a different contrast calculation.

Keep a CSS file with five colors and readable foreground tokens, or a
self-contained SVG recipe card including ink ratios. The pantry stores up to
eight explicitly saved snapshots in local storage, including pins. Storage
failures are visible and do not claim a successful save; there is no account,
network service or implicit autosave.

## Extension points

- `data.ts`: add intentional recipe presets, role descriptions and harmony copy.
- `engine.ts`: pure color conversion, recipe generation, edits, validation and
  unrounded WCAG calculations. Add harmony offsets with the matching type and
  `data.ts` description. Hue generation uses HSL; contrast uses linear sRGB.
- `export.ts`: safe SVG serialization and CSS variables. SVG titles are escaped;
  colors are normalized hex. No fonts or assets are fetched.
- `index.ts`: local UI state and signal-scoped event wiring. All controls belong
  to the site; native workspace tabs retain the selected pigment and all input
  state while switching views.
- `style.css`: scoped paper/paint visual identity and narrow-screen layouts.
- `tests/projects/palette.spec.ts`: known contrast cases, generation and pin
  semantics, saved-data validation, export escaping and focused interactions.

All primary controls are native keyboard-operable buttons, fields and selectors.
Copy buttons use the browser clipboard with explicit failure feedback; the CSS
textarea is also selectable. Downloads do not depend on clipboard permission.

## One-screen kitchen

The live five-color palette stays above the **Mix**, **Pigment**, **Taste**, and
**Keep** tabs. The workspace uses the remaining viewport height, including on
320×640 phones and short landscape screens; the document does not scroll.
Tap a swatch to open its pigment editor. Small screens show readable pigment
names on the compact swatches and the exact hex in the selected pigment field.

**Recipes** opens the six-recipe notebook without changing the selected pigment.
**Notes** holds the original explanations, current harmony/pigment notes,
grayscale caveat and WCAG guide. Taste opens the full contrast table in a native
dialog; choosing a cell returns to the specimen. Keep provides save/download
actions, with separate **Open pantry** and **View / copy CSS** dialogs.
Dialogs can scroll long material, support Escape and return focus on close.
Status feedback stays on the counter and is repeated inside an open dialog.
Failed storage writes leave the saved shelf unchanged and show an explicit
unsaved error; the live recipe is never discarded. Invalid colors and recipe
names open a visible error dialog instead of stretching the controls off-screen.

`data-project-preview` marks the mixing counter so collection covers capture
the colors and real controls. The floating collection menu remains available.

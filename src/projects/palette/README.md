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
  to the site; navigation anchors are safe on standalone project pages.
- `style.css`: scoped paper/paint visual identity and narrow-screen layouts.
- `tests/projects/palette.spec.ts`: known contrast cases, generation and pin
  semantics, saved-data validation, export escaping and focused interactions.

All primary controls are native keyboard-operable buttons, fields and selectors.
Copy buttons use the browser clipboard with explicit failure feedback; the CSS
textarea is also selectable. Downloads do not depend on clipboard permission.

The compact header leads directly to the palette. `data-project-preview` marks
the mixing counter so collection covers capture the colors and real controls.

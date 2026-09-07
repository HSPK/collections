# Patchwork Vision

A local, fixed-feature vision-language teaching bench at
`/projects/patchwork-vision/`. It does not load a model, make API calls,
upload images, or infer open-ended semantics.

## What works

- Edit any of sixteen synthetic 28 x 28 pixel patches. Change its palette
  color or centered silhouette, erase it, undo up to 32 image changes,
  flip the arrangement, or restore an original scene.
- Inspect actual raster-derived seven-dimensional features, normalized
  visual and text vectors, patch cosine, pooling weight, and contribution.
- Type a limited color/shape descriptor or use the keyboard-friendly
  vocabulary builder. Unsupported words, multiple colors/shapes,
  negation, and spatial descriptions produce an explanation and no score.
- Compare uniform mean and text-guided attention pooling. Adjust the
  latter's temperature, inspect all sixteen rows in the computation
  ledger, and compare the three original scenes. The comparison cards
  always score the original scenes, not the currently edited image.
- Export inputs, feature definitions, vectors, weights, and scores as a
  local JSON snapshot using the core download helper.

## Exact model

The four color features count red, blue, gold, and teal foreground pixels,
divided by foreground count. Only the declared opaque palette and
background are accepted. Empty patches have the zero vector.

Each shape affinity compares the raster's binary foreground mask with a
fixed circle, square, or triangle mask:

```text
IoU = intersection / union
affinity = exp(-12 * (1 - IoU))
shape_features = affinity / L2_norm(affinity)
visual_unit = L2_normalize([color_fractions, shape_features])
text_unit = L2_normalize(one_hot_color + one_hot_shape)
patch_cosine = visual_unit dot text_unit
```

The text mapping is an explicit dictionary, not an embedding learned from
language. A color-only or shape-only descriptor is supported. Shape masks
are centered and fixed-size; their affinities are not learned recognition.
Off-center or rescaled shapes would not be invariant under this method.

Uniform pooling weights every nonempty patch equally. Attention uses
`softmax(patch_cosine / temperature)`, subtracting the maximum before
exponentiation. Empty patches receive exactly zero weight. The UI bounds
temperature to 0.05-1. The image score normalizes the weighted sum of
visual unit vectors before taking its cosine with the text vector; it is
not the weighted mean of patch cosines. Both quantities are exposed.
All-empty images have no defined cosine, not an invented zero match.
Softmax weights are allocation shares, not object confidence.

There are no positional features, so permuting patches preserves scores.
Nonnegative features restrict this model's cosines to 0-1, although the
general cosine range is -1 to 1. All arithmetic is JavaScript Float64.
Tiny softmax weights can underflow to zero; outputs remain normalized.

## Extension map

- `types.ts`: explicit patch, feature, descriptor, and output types.
- `data.ts`: original scenes, palette, vocabulary, and constants.
- `engine.ts`: pure rasterization, extraction, parsing, stable
  normalization/softmax, and pooling. The extractor consumes pixels; it
  does not inspect the supplied shape/color labels.
- `visuals.ts`: pixel-faithful canvas and SVG previews.
- `view.ts`, `index.ts`: markup, input handling, and local state.
- `style.css`: fully scoped responsive presentation.

To add a feature dimension, update the tuple, palette/template extraction,
dictionary mapping, inspectable vector labels, and engine cases together.
Do not relabel handcrafted features as learned intelligence. Adding
learned alignment would require actual fitted parameters, inspectable
training data/loss, and a separate explanation.

The page has no playback loop. All listeners use `page.signal`; its single
canvas resize observer is disposed by `page.onCleanup`. Patch buttons
support arrow keys and Home/End, and select controls are equivalent to
pointer editing. No storage or persistence is implicit.

## Viewport controls

The inspector reserves a 64px right-side clearance plus the safe-area inset.
This keeps descriptor buttons and pane controls clear of the collection
launcher without reducing the visible image or adding a footer.

The root is a fixed-height workspace. The square mosaic, scene/reset controls,
paint selectors, and current image cosine stay together at desktop and phone
sizes. The inspector sits beside the mosaic or in a lower dock. **Match** holds
the descriptor, vocabulary builder, pooling and temperature controls, and score
details. **Image** keeps Undo, Flip, Clear, overlays, and JSON export. **Token**
contains the actual selected features and full patch ledger; **Scenes** retains
all comparison cards, and **Notes** preserves the assumptions and experiments.
Each pane scrolls independently without scrolling the page. Left/Right/Home/End
operate tabs; the existing patch-grid keyboard shortcuts are unchanged.

`workspace.ts` moves existing regions into wrapper panels without replacing
their interactive nodes or named-region semantics. Extend that composition for
new inspectors. The image frame uses both available dimensions to size a square;
the existing canvas resize observer redraws it, and the HTML patch grid shares
the same bounds, so pointer and keyboard selection stay aligned after resize.
No positive fixed stage minimum or body overflow suppression is used.

Focused cases live in `tests/series/patchwork-vision.spec.ts`:

```sh
npm test -- tests/series/patchwork-vision.spec.ts
```

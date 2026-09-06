import type { Experiment } from './model';

export interface Preset {
  id: string;
  name: string;
  topic: string;
  title: string;
  description: string;
  steps: { title: string; detail: string }[];
  scene: Experiment;
}

const dispersion: Experiment = {
  version: 1,
  title: 'White light, taken apart',
  notes: '',
  elements: [
    { id: 'source-1', label: 'S1 / White light', kind: 'emitter', x: 125, y: 310, rotation: -15, spectrum: 'white', wavelength: 540, rays: 3, aperture: 8, spread: 0, power: 1 },
    { id: 'prism-1', label: 'P1 / Dispersing prism', kind: 'prism', x: 470, y: 300, rotation: 15, size: 250, material: 'flint' },
    { id: 'detector-1', label: 'D1 / Spectral screen', kind: 'detector', x: 845, y: 460, rotation: 90, length: 230 },
  ],
};

export const PRESETS: Preset[] = [
  {
    id: 'dispersion', name: 'Prism study', topic: 'Dispersion', title: 'One beam. Seven wavelengths.',
    description: 'A prism turns a difference in refractive index into a difference in direction. Follow the colors all the way to the screen.',
    steps: [
      { title: 'Change the glass', detail: 'Select the prism. Switch dense flint to crown glass and compare the measured red-to-violet separation below the bench.' },
      { title: 'Find the critical angle', detail: 'Rotate the prism a few degrees at a time. If the transmitted beam disappears, inspect the surface log for total internal reflection.' },
      { title: 'Move the screen', detail: 'Drag D1 farther from the prism. Does the separation grow? Record a reading, then undo to compare.' },
    ],
    scene: dispersion,
  },
  {
    id: 'focus', name: 'Lens & caustic', topic: 'Focusing', title: 'Find the narrowest waist.',
    description: 'This is a thick, spherical biconvex lens, traced at both curved interfaces. Off-axis rays do not share a perfect focus.',
    steps: [
      { title: 'Find the focal region', detail: 'Move the detector horizontally through the converging beam. Watch RMS spot width (in mm) reach a minimum.' },
      { title: 'Reveal spherical aberration', detail: 'Select the emitter and widen its aperture. Marginal rays meet sooner than paraxial rays: a real geometric caustic.' },
      { title: 'Compare colors', detail: 'Change the source to seven-band white light. Chromatic aberration separates the focal positions; a thinner lens changes them again.' },
    ],
    scene: {
      version: 1, title: 'The shape of a focus', notes: '',
      elements: [
        { id: 'source-1', label: 'S1 / Parallel bundle', kind: 'emitter', x: 120, y: 300, rotation: 0, spectrum: 'mono', wavelength: 540, rays: 15, aperture: 165, spread: 0, power: 1 },
        { id: 'lens-1', label: 'L1 / Crown lens', kind: 'lens', x: 420, y: 300, rotation: 0, diameter: 240, thickness: 65, material: 'crown' },
        { id: 'detector-1', label: 'D1 / Focal screen', kind: 'detector', x: 650, y: 300, rotation: 90, length: 240 },
      ],
    },
  },
  {
    id: 'mirrors', name: 'Folded path', topic: 'Reflection', title: 'Take the light around a corner.',
    description: 'Two double-sided mirrors fold the optical path. Each reflection obeys equal angles and loses the energy you specify.',
    steps: [
      { title: 'Trace the two turns', detail: 'The first mirror sends the beam down; the second sends it right. Set either angle to 40 degrees and see why alignment matters.' },
      { title: 'Account for every milliwatt', detail: 'Set both reflectivities to 0.9. With full capture, the detector should collect 0.81 mW of the 1 mW input.' },
      { title: 'Make a third turn', detail: 'Add a mirror, move it into the last leg, and aim it at a repositioned detector. All edits can be undone.' },
    ],
    scene: {
      version: 1, title: 'A longer way to the same light', notes: '',
      elements: [
        { id: 'source-1', label: 'S1 / Red reference', kind: 'emitter', x: 140, y: 160, rotation: 0, spectrum: 'mono', wavelength: 620, rays: 3, aperture: 18, spread: 0, power: 1 },
        { id: 'mirror-1', label: 'M1 / First turn', kind: 'mirror', x: 430, y: 160, rotation: 45, length: 150, reflectivity: 0.96 },
        { id: 'mirror-2', label: 'M2 / Second turn', kind: 'mirror', x: 430, y: 430, rotation: 45, length: 150, reflectivity: 0.96 },
        { id: 'detector-1', label: 'D1 / Return screen', kind: 'detector', x: 840, y: 430, rotation: 90, length: 170 },
      ],
    },
  },
  {
    id: 'spectrometer', name: 'Spectral gate', topic: 'Spectrometry', title: 'Let one color through.',
    description: 'A narrow detector samples only part of a dispersed beam. Scan its position to build a spectrum from measured, not invented, hits.',
    steps: [
      { title: 'Scan the spectrum', detail: 'Move the detector up and down in 2 mm steps using its Y control or the arrow keys. Different wavelengths enter its 12 mm aperture.' },
      { title: 'Trade resolution for power', detail: 'Increase detector length. More bands arrive, but the instrument is less selective.' },
      { title: 'Keep the experiment', detail: 'Record readings in this notebook. Save the JSON to retain the geometry and notes, or export an editable SVG of the bench.' },
    ],
    scene: {
      ...dispersion, title: 'A window into the spectrum',
      elements: dispersion.elements.map((element) => element.kind === 'emitter' ? { ...element, rays: 1, aperture: 0 }
        : element.kind === 'detector' ? { ...element, label: 'D1 / Scanning aperture', y: 480, length: 12 } : { ...element }),
    },
  },
];

export function presetScene(id: string): Experiment {
  const preset = PRESETS.find((entry) => entry.id === id);
  if (!preset) throw new RangeError(`Unknown preset: ${id}`);
  return { ...preset.scene, elements: preset.scene.elements.map((element) => ({ ...element })) };
}

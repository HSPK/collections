export type Vector3Tuple = readonly [number, number, number];

export interface CameraPart {
  id: string;
  number: string;
  name: string;
  material: string;
  description: string;
  assembled: Vector3Tuple;
  exploded: Vector3Tuple;
  rotation: Vector3Tuple;
  start: number;
  end: number;
}

export const DURATION = 22;
export const EXPLODED_FRAME = 0.055;

export const PARTS = [
  {
    id: 'frame', number: '01', name: 'Frame', material: 'Satin aluminium',
    description: 'An open, rounded skeleton with two bright film rails. It gives the floating pieces a visual centre before the enamel arrives.',
    assembled: [0, 0, 0], exploded: [0, -0.16, 0], rotation: [0, 0, -0.045],
    start: 0.04, end: 0.16,
  },
  {
    id: 'film', number: '02', name: 'Film pack', material: 'Matte cartridge · paper',
    description: 'A dark cassette, a small pull tab, and a stack of pale edges. This imagined pack is a sculptural suggestion, not a working film system.',
    assembled: [0, 0, -0.28], exploded: [0.05, 0.1, -1.75], rotation: [0.04, -0.08, 0],
    start: 0.14, end: 0.3,
  },
  {
    id: 'housing', number: '03', name: 'Housing', material: 'Saffron enamel',
    description: 'A continuous, soft-cornered sleeve in warm yellow. Its glossy skin catches the long studio reflections; the open ends reveal a darker interior.',
    assembled: [0, 0, 0], exploded: [-0.65, 2.35, -0.55], rotation: [-0.07, -0.12, -0.1],
    start: 0.25, end: 0.43,
  },
  {
    id: 'back', number: '04', name: 'Backing', material: 'Enamel · textured inset',
    description: 'The reverse has its own composition: a recessed grip, a tiny viewing window, and a pair of rounded hinges. Try the rear view to see it.',
    assembled: [0, 0, -0.7], exploded: [0, 0.25, -3.1], rotation: [0.03, 0.12, 0],
    start: 0.32, end: 0.48,
  },
  {
    id: 'face', number: '05', name: 'Faceplate', material: 'Warm porcelain enamel',
    description: 'An off-centre eye, a ribbed thumb rest, and a fine dark print slot interrupt the cream face. Small asymmetries make this an original object.',
    assembled: [0, 0, 0.63], exploded: [0, 0, 1.55], rotation: [0, -0.04, 0.035],
    start: 0.4, end: 0.56,
  },
  {
    id: 'barrel', number: '06', name: 'Barrel', material: 'Anodised metal · silver',
    description: 'A stepped, hollow barrel wears seven fine grooves and a ring of saffron index marks. The bright rims read differently from the softer enamel.',
    assembled: [-0.46, 0.1, 0.77], exploded: [-0.46, 0.1, 2.65], rotation: [0, 0.08, 0],
    start: 0.51, end: 0.68,
  },
  {
    id: 'shutter', number: '07', name: 'Shutter', material: 'Overlapping satin leaves',
    description: 'Seven curved leaves turn into a small dark aperture. Their choreography is a graphic invention, not an accurate shutter mechanism.',
    assembled: [-0.46, 0.1, 1.15], exploded: [-0.46, 0.1, 3.55], rotation: [0, 0, -0.18],
    start: 0.61, end: 0.77,
  },
  {
    id: 'glass', number: '08', name: 'Glass', material: 'Tinted optical sculpture',
    description: 'A shallow, teal-tinted lens catches the softboxes inside a silver retaining ring. Transparency, curvature, and reflections give the eye its depth.',
    assembled: [-0.46, 0.1, 1.4], exploded: [-0.46, 0.1, 4.45], rotation: [0.05, 0.1, 0.12],
    start: 0.71, end: 0.85,
  },
  {
    id: 'controls', number: '09', name: 'Controls', material: 'Teal enamel · ribbed glass',
    description: 'A knurled teal dial, a cream shutter button, a wide flash, and a little viewfinder are the finishing gestures. None of these controls operates a real camera.',
    assembled: [0, 0, 0], exploded: [0.55, 1.7, 0.6], rotation: [0, 0.15, 0.08],
    start: 0.79, end: 0.91,
  },
] as const satisfies readonly CameraPart[];

export type PartId = typeof PARTS[number]['id'];

export const CHAPTERS = [
  { name: 'Skeleton', title: 'A skeleton, first.', start: 0, end: 0.25, seek: 0.14, note: 'The frame and film pack find their places.' },
  { name: 'Body', title: 'A colour takes shape.', start: 0.25, end: 0.51, seek: 0.4, note: 'Saffron housing, backing, then the cream face.' },
  { name: 'Lens', title: 'Build the eye.', start: 0.51, end: 0.79, seek: 0.67, note: 'Grooved metal, curved leaves, and a teal lens.' },
  { name: 'Details', title: 'Small signatures.', start: 0.79, end: 0.91, seek: 0.85, note: 'The dial, flash, and viewfinder settle in.' },
  { name: 'Print', title: 'Keep a little light.', start: 0.91, end: 1, seek: 1, note: 'An original, locally drawn picture leaves the slot.' },
] as const;

export const VIEWS = [
  { id: 'study', name: 'Three-quarter', position: [8.6, 5.1, 10.1] },
  { id: 'front', name: 'Front', position: [0, 2.2, 13.4] },
  { id: 'rear', name: 'Rear', position: [-7.7, 4.2, -10.5] },
  { id: 'top', name: 'Top', position: [0.2, 13.6, 2.9] },
] as const;

export type ViewId = typeof VIEWS[number]['id'];

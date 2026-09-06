export type Viewpoint = 'aligned' | 'side' | 'above' | 'free';
export type Point3 = readonly [number, number, number];

export const canonicalEye: Point3 = [13, 18, 13];
export const focalPoint: Point3 = [1, 4.6, -1];
export const cameraFov = 31;

export const viewpoints: { id: Exclude<Viewpoint, 'free'>; label: string; eye: Point3; note: string }[] = [
  {
    id: 'aligned',
    label: 'Find the viewpoint',
    eye: canonicalEye,
    note: 'The three cut ends share sightlines. A continuous triangle appears; the gaps are still there.',
  },
  {
    id: 'side',
    label: 'Side elevation',
    eye: [-16, 10, 15],
    note: 'From the west, the continuous loop becomes three disconnected architectural fragments.',
  },
  {
    id: 'above',
    label: 'Above the joints',
    eye: [10, 29, 5],
    note: 'Look between the piers. Each beam occupies a different depth, on its own foundations.',
  },
];

export const beamNames = ['Low traverse', 'Upright passage', 'Upper return'] as const;
export const defaultSun = 38;

export const fieldNotes = [
  {
    number: '01',
    title: 'The eye is the joint.',
    text: 'Three closed, tapered stone beams stand on separate piers. Their mitered ends are cut to meet in the image, not in the world.',
  },
  {
    number: '02',
    title: 'Distance does the work.',
    text: 'Moving a point along the ray from your eye leaves its image position unchanged. Each whole beam is scaled about the viewing point to place it at a different depth.',
  },
  {
    number: '03',
    title: 'A small move is enough.',
    text: 'Orbit even a few degrees and the coincident corners separate. The guides are real lines through space; there is no picture hiding in front of the camera.',
  },
];

export interface Magnet {
  id: string;
  x: number;
  y: number;
  angle: number;
  polarity: 1 | -1;
}

export interface Pole {
  x: number;
  y: number;
  charge: number;
}

export interface FieldSample {
  x: number;
  y: number;
  strength: number;
  gradientX: number;
  gradientY: number;
}

export const HALF_POLE_SPACING = 54;
export const SOFTENING = 24;
export const POLE_STRENGTH = 15_500;
export const MAX_FIELD = 24;
export const MAX_GRADIENT = 2.5;

export function polesFor(magnets: readonly Magnet[]): Pole[] {
  return magnets.flatMap((magnet) => {
    const dx = Math.cos(magnet.angle) * HALF_POLE_SPACING;
    const dy = Math.sin(magnet.angle) * HALF_POLE_SPACING;
    const charge = magnet.polarity * POLE_STRENGTH;
    return [
      { x: magnet.x + dx, y: magnet.y + dy, charge },
      { x: magnet.x - dx, y: magnet.y - dy, charge: -charge },
    ];
  });
}

export function emptySample(): FieldSample {
  return { x: 0, y: 0, strength: 0, gradientX: 0, gradientY: 0 };
}

export function sampleField(
  x: number,
  y: number,
  poles: readonly Pole[],
  result: FieldSample = emptySample(),
): FieldSample {
  let bx = 0;
  let by = 0;
  let dxx = 0;
  let dxy = 0;
  let dyy = 0;

  for (const pole of poles) {
    const dx = x - pole.x;
    const dy = y - pole.y;
    const inverse = 1 / Math.sqrt(dx * dx + dy * dy + SOFTENING * SOFTENING);
    const inverse3 = inverse * inverse * inverse * pole.charge;
    const inverse5 = 3 * inverse3 * inverse * inverse;
    bx += dx * inverse3;
    by += dy * inverse3;
    dxx += inverse3 - dx * dx * inverse5;
    dxy -= dx * dy * inverse5;
    dyy += inverse3 - dy * dy * inverse5;
  }

  // Half the gradient of |B|², before either display safety limit is applied.
  let gx = bx * dxx + by * dxy;
  let gy = bx * dxy + by * dyy;
  const gradientLength = Math.hypot(gx, gy);
  if (gradientLength > MAX_GRADIENT) {
    gx *= MAX_GRADIENT / gradientLength;
    gy *= MAX_GRADIENT / gradientLength;
  }
  const strength = Math.hypot(bx, by);
  if (strength > MAX_FIELD) {
    bx *= MAX_FIELD / strength;
    by *= MAX_FIELD / strength;
  }
  result.x = bx;
  result.y = by;
  result.strength = Math.min(strength, MAX_FIELD);
  result.gradientX = gx;
  result.gradientY = gy;
  return result;
}

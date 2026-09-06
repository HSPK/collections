import { expect, test } from '@playwright/test';
import { Vector3 } from 'three';
import { destination, inDestination } from '../../src/projects/morrow/state';

test('Morrow placement tolerance follows the drawn receiver frame', () => {
  const localInside = new Vector3(.055, 0, .055);
  const inside = {
    position: localInside.clone().applyQuaternion(destination.orientation).add(destination.position),
    orientation: destination.orientation.clone(),
  };
  expect(inDestination(inside)).toBe(true);

  const worldCorner = destination.position.clone().add(new Vector3(.055, 0, .055));
  const localCorner = worldCorner.clone().sub(destination.position).applyQuaternion(destination.orientation.clone().invert());
  expect(Math.max(Math.abs(localCorner.x), Math.abs(localCorner.z))).toBeGreaterThan(.06);
  expect(inDestination({ position: worldCorner, orientation: destination.orientation.clone() })).toBe(false);
});

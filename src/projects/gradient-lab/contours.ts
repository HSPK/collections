import { lerp } from '../../core/math';
import type { Objective, Point } from './engine';

export interface Contour {
  level: number;
  segments: [Point, Point][];
}

export interface Terrain {
  columns: number;
  rows: number;
  values: Float64Array;
  contours: Contour[];
  minimum: number;
  maximum: number;
}

export function sampleTerrain(objective: Objective, levels: readonly number[], columns = 96, rows = 80): Terrain {
  const { bounds } = objective;
  const values = new Float64Array((columns + 1) * (rows + 1));
  const pointAt = (column: number, row: number): Point => ({
    x: lerp(bounds.xMin, bounds.xMax, column / columns),
    y: lerp(bounds.yMin, bounds.yMax, row / rows),
  });
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const value = objective.value(pointAt(column, row));
      values[row * (columns + 1) + column] = value;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
  }

  const contours = levels.map((level): Contour => ({ level, segments: [] }));
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const positions = [
        pointAt(column, row), pointAt(column + 1, row),
        pointAt(column + 1, row + 1), pointAt(column, row + 1),
      ];
      const indices = [
        row * (columns + 1) + column, row * (columns + 1) + column + 1,
        (row + 1) * (columns + 1) + column + 1, (row + 1) * (columns + 1) + column,
      ];
      const corners = indices.map((index) => values[index]);
      for (const contour of contours) {
        const intersections: Point[] = [];
        for (let edge = 0; edge < 4; edge++) {
          const next = (edge + 1) % 4;
          if ((corners[edge] < contour.level) === (corners[next] < contour.level)) continue;
          const fraction = (contour.level - corners[edge]) / (corners[next] - corners[edge]);
          intersections.push({
            x: lerp(positions[edge].x, positions[next].x, fraction),
            y: lerp(positions[edge].y, positions[next].y, fraction),
          });
        }
        if (intersections.length === 2) {
          contour.segments.push([intersections[0], intersections[1]]);
        } else if (intersections.length === 4) {
          // Resolve the ambiguous saddle cell with the actual function at its center.
          const center = objective.value(pointAt(column + 0.5, row + 0.5));
          if ((corners[0] < contour.level) === (center < contour.level)) {
            contour.segments.push([intersections[0], intersections[1]], [intersections[2], intersections[3]]);
          } else {
            contour.segments.push([intersections[0], intersections[3]], [intersections[1], intersections[2]]);
          }
        }
      }
    }
  }
  return { columns, rows, values, contours, minimum, maximum };
}

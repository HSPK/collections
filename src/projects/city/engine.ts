import { TILE_IDS, presetLegend, tileById } from './data';
import type { CityPreset, RecipeRule, TileId } from './data';

export const MAX_PLAN_SIZE = 16;
export const MAX_NAME_LENGTH = 60;
export const HISTORY_LIMIT = 80;

export class PlanInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanInputError';
  }
}

export interface CityPlan {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly cells: readonly TileId[];
}

export interface CityHistory {
  readonly past: readonly CityPlan[];
  readonly present: CityPlan;
  readonly future: readonly CityPlan[];
}

export interface CityMetrics {
  readonly counts: Readonly<Record<TileId, number>>;
  readonly roadCount: number;
  readonly roadEdges: number;
  readonly roadGroups: readonly (readonly number[])[];
  readonly groupByCell: readonly number[];
  readonly largestRoadGroup: number;
  readonly buildingCount: number;
  readonly buildingsWithFrontage: number;
  readonly unfrontedBuildings: readonly number[];
  readonly greenCount: number;
  readonly buildingsBesideGreen: number;
  readonly occupiedCount: number;
}

export function isTileId(value: unknown): value is TileId {
  return typeof value === 'string' && TILE_IDS.some((id) => id === value);
}

export function createPlan(
  name: string,
  width: number,
  height: number,
  cells: readonly TileId[],
): CityPlan {
  if (![width, height].every((size) => Number.isInteger(size) && size >= 1 && size <= MAX_PLAN_SIZE)) {
    throw new PlanInputError(`Plan dimensions must be whole numbers from 1 to ${MAX_PLAN_SIZE}.`);
  }
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > MAX_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(cleanName)) {
    throw new PlanInputError(`Give the neighborhood a readable name of 1–${MAX_NAME_LENGTH} characters.`);
  }
  if (cells.length !== width * height || !cells.every(isTileId)) {
    throw new PlanInputError('Every plot must contain a known tile, with exactly one tile per grid cell.');
  }
  return Object.freeze({ name: cleanName, width, height, cells: Object.freeze([...cells]) });
}

export function planFromPreset(preset: CityPreset): CityPlan {
  const width = preset.rows[0]?.length ?? 0;
  if (!preset.rows.every((row) => row.length === width)) {
    throw new Error(`The rows in “${preset.name}” must have equal lengths.`);
  }
  const cells = preset.rows.flatMap((row) => [...row].map((symbol) => {
    const tile = presetLegend[symbol];
    if (!tile) throw new Error(`Unknown tile symbol “${symbol}” in “${preset.name}”.`);
    return tile;
  }));
  return createPlan(preset.name, width, preset.rows.length, cells);
}

function assertIndex(plan: CityPlan, index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= plan.cells.length) {
    throw new RangeError('That address is outside the neighborhood.');
  }
}

export function addressOf(plan: CityPlan, index: number): string {
  assertIndex(plan, index);
  return `${String.fromCharCode(65 + index % plan.width)}${Math.floor(index / plan.width) + 1}`;
}

export function neighborIndices(plan: CityPlan, index: number): number[] {
  assertIndex(plan, index);
  const column = index % plan.width;
  const row = Math.floor(index / plan.width);
  const neighbors: number[] = [];
  if (row > 0) neighbors.push(index - plan.width);
  if (column < plan.width - 1) neighbors.push(index + 1);
  if (row < plan.height - 1) neighbors.push(index + plan.width);
  if (column > 0) neighbors.push(index - 1);
  return neighbors;
}

export function isStreet(tile: TileId): boolean {
  return tileById[tile].kind === 'street';
}

export function analyzePlan(plan: CityPlan): CityMetrics {
  const counts = Object.fromEntries(TILE_IDS.map((id) => [id, 0])) as Record<TileId, number>;
  for (const tile of plan.cells) counts[tile]++;
  const groupByCell = Array<number>(plan.cells.length).fill(-1);
  const roadGroups: number[][] = [];
  let roadEdges = 0;

  for (let index = 0; index < plan.cells.length; index++) {
    if (!isStreet(plan.cells[index])) continue;
    roadEdges += neighborIndices(plan, index).filter((other) => other > index && isStreet(plan.cells[other])).length;
    if (groupByCell[index] !== -1) continue;
    const group = [index];
    const groupId = roadGroups.length;
    groupByCell[index] = groupId;
    for (let cursor = 0; cursor < group.length; cursor++) {
      for (const neighbor of neighborIndices(plan, group[cursor])) {
        if (isStreet(plan.cells[neighbor]) && groupByCell[neighbor] === -1) {
          groupByCell[neighbor] = groupId;
          group.push(neighbor);
        }
      }
    }
    roadGroups.push(group);
  }

  const unfrontedBuildings: number[] = [];
  let buildingCount = 0;
  let buildingsBesideGreen = 0;
  for (let index = 0; index < plan.cells.length; index++) {
    if (tileById[plan.cells[index]].kind !== 'building') continue;
    buildingCount++;
    const neighbors = neighborIndices(plan, index);
    if (!neighbors.some((other) => isStreet(plan.cells[other]))) unfrontedBuildings.push(index);
    if (neighbors.some((other) => tileById[plan.cells[other]].kind === 'green')) buildingsBesideGreen++;
  }

  return {
    counts, roadCount: roadGroups.reduce((total, group) => total + group.length, 0), roadEdges, roadGroups, groupByCell,
    largestRoadGroup: roadGroups.reduce((largest, group) => Math.max(largest, group.length), 0),
    buildingCount, buildingsWithFrontage: buildingCount - unfrontedBuildings.length,
    unfrontedBuildings,
    greenCount: TILE_IDS.reduce((total, id) => total + (tileById[id].kind === 'green' ? counts[id] : 0), 0),
    buildingsBesideGreen,
    occupiedCount: plan.cells.length - counts.empty,
  };
}

export function placeTile(plan: CityPlan, index: number, tile: TileId): CityPlan {
  assertIndex(plan, index);
  if (!isTileId(tile)) throw new Error('Choose a tile from the ingredient catalog.');
  if (plan.cells[index] === tile) return plan;
  const cells = [...plan.cells];
  cells[index] = tile;
  return createPlan(plan.name, plan.width, plan.height, cells);
}

export function clearPlan(plan: CityPlan): CityPlan {
  if (plan.cells.every((tile) => tile === 'empty')) return plan;
  return createPlan(plan.name, plan.width, plan.height, plan.cells.map(() => 'empty'));
}

export function renamePlan(plan: CityPlan, name: string): CityPlan {
  if (name.trim() === plan.name) return plan;
  return createPlan(name, plan.width, plan.height, plan.cells);
}

export function createHistory(plan: CityPlan): CityHistory {
  return { past: [], present: plan, future: [] };
}

export function commitPlan(history: CityHistory, plan: CityPlan): CityHistory {
  const current = history.present;
  if (current === plan || (
    current.name === plan.name && current.width === plan.width && current.height === plan.height
    && current.cells.every((tile, index) => tile === plan.cells[index])
  )) return history;
  return {
    past: [...history.past, current].slice(-HISTORY_LIMIT),
    present: plan,
    future: [],
  };
}

export function undo(history: CityHistory): CityHistory {
  if (!history.past.length) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
  };
}

export function redo(history: CityHistory): CityHistory {
  if (!history.future.length) return history;
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: history.future[0],
    future: history.future.slice(1),
  };
}

export function recipeChecks(metrics: CityMetrics): Readonly<Record<RecipeRule, boolean>> {
  return {
    'six-streets': metrics.roadCount >= 6,
    'joined-streets': metrics.roadGroups.length === 1,
    'four-buildings': metrics.buildingCount >= 4,
    'every-frontage': metrics.buildingCount > 0 && metrics.buildingsWithFrontage === metrics.buildingCount,
    'three-greens': metrics.greenCount >= 3,
    'four-green-neighbors': metrics.buildingsBesideGreen >= 4,
  };
}

export function serializePlan(plan: CityPlan): string {
  return JSON.stringify({
    format: 'recipe-for-a-city',
    version: 1,
    name: plan.name,
    width: plan.width,
    height: plan.height,
    tiles: Array.from({ length: plan.height }, (_, row) => plan.cells.slice(row * plan.width, (row + 1) * plan.width)),
    model: {
      coordinates: 'Rows run from 1 downward; columns run from A rightward. Tiles are stored row by row.',
      streets: 'road and bridge connect only across shared grid sides; no diagonal edges.',
      frontage: 'A building tile shares a side with at least one road or bridge.',
      greenNeighbors: 'A building tile shares a side with a park or garden.',
      caveat: 'A toy model, not real urban planning advice.',
    },
    legend: Object.fromEntries(TILE_IDS.map((id) => [id, tileById[id].name])),
  }, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTileRows(value: unknown, width: number, height: number): value is TileId[][] {
  return Array.isArray(value) && value.length === height && value.every((row: unknown) =>
    Array.isArray(row) && row.length === width && row.every(isTileId),
  );
}

export function deserializePlan(text: string): CityPlan {
  if (text.length > 100_000) throw new PlanInputError('This plan is too large. Choose a Recipe for a City JSON file under 100 KB.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new PlanInputError('That file is not valid JSON. Your current neighborhood has not changed.');
  }
  if (!isRecord(value) || value.format !== 'recipe-for-a-city' || value.version !== 1) {
    throw new PlanInputError('Choose a Recipe for a City plan with format “recipe-for-a-city” and version 1.');
  }
  const { name, width, height, tiles: rows } = value;
  if (typeof name !== 'string' || typeof width !== 'number' || typeof height !== 'number') {
    throw new PlanInputError('The plan needs a name and numeric width and height.');
  }
  if (!isTileRows(rows, width, height)) {
    throw new PlanInputError('The plan must have one row per grid row, with a known tile at every address.');
  }
  return createPlan(name, width, height, rows.flat());
}

export function planFilename(plan: CityPlan, extension: 'svg' | 'json'): string {
  const slug = plan.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return `recipe-for-a-city-${slug || 'neighborhood'}.${extension}`;
}

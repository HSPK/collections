export const DIRECTIONS = ['up', 'right', 'down', 'left'] as const;
export type Direction = typeof DIRECTIONS[number];
export type ParcelShape = 'circle' | 'square' | 'triangle' | 'diamond';

export interface ParcelDefinition {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly shape: ParcelShape;
}

export interface LevelDefinition {
  readonly id: string;
  readonly title: string;
  readonly district: string;
  readonly briefing: string;
  readonly tip: string;
  readonly capacity: number;
  readonly moveBudget: number;
  readonly scenery: 'garden' | 'town' | 'canal';
  readonly map: readonly string[];
  readonly parcels: readonly ParcelDefinition[];
}

export interface Tile {
  readonly kind: 'street' | 'wall';
  readonly exit?: Direction;
}

export interface Parcel extends ParcelDefinition {
  readonly pickup: number;
  readonly destination: number;
}

export interface Level {
  readonly definition: LevelDefinition;
  readonly width: number;
  readonly height: number;
  readonly start: number;
  readonly tiles: readonly Tile[];
  readonly parcels: readonly Parcel[];
}

export type ParcelLocation = number | 'bag' | 'delivered';

export interface GameState {
  readonly position: number;
  readonly facing: Direction;
  readonly parcelLocations: readonly ParcelLocation[];
  readonly steps: number;
}

export interface GameSession {
  readonly current: GameState;
  readonly history: readonly GameState[];
}

export type GamePhase = 'playing' | 'complete' | 'exhausted';
export type BlockReason = 'wall' | 'edge' | 'one-way' | 'complete' | 'budget';
export interface MoveEvent {
  readonly type: 'pickup' | 'delivery' | 'full';
  readonly parcelId: string;
}

export interface MoveResult {
  readonly state: GameState;
  readonly moved: boolean;
  readonly blocked?: BlockReason;
  readonly events: readonly MoveEvent[];
}

export interface TurnResult {
  readonly session: GameSession;
  readonly move: MoveResult;
}

export type SolverResult =
  | { readonly status: 'solved'; readonly moves: readonly Direction[]; readonly visited: number }
  | { readonly status: 'unsolvable' | 'limit'; readonly moves: readonly []; readonly visited: number };

const OFFSETS: Record<Direction, readonly [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};

const ARROWS: Record<string, Direction> = {
  '↑': 'up',
  '→': 'right',
  '↓': 'down',
  '←': 'left',
};

export function compileLevel(definition: LevelDefinition): Level {
  const rows = definition.map.map((row) => Array.from(row));
  const width = rows[0]?.length ?? 0;
  if (!width || !rows.length || rows.some((row) => row.length !== width)) {
    throw new Error(`${definition.id}: a map must be a non-empty rectangle.`);
  }
  if (!Number.isInteger(definition.capacity) || definition.capacity < 1) {
    throw new Error(`${definition.id}: capacity must be a positive integer.`);
  }
  if (!Number.isInteger(definition.moveBudget) || definition.moveBudget < 1) {
    throw new Error(`${definition.id}: the move budget must be a positive integer.`);
  }
  const ids = new Set(definition.parcels.map((parcel) => parcel.id));
  if (!ids.size || ids.size !== definition.parcels.length ||
      definition.parcels.some((parcel) => !/^[A-Z]$/.test(parcel.id))) {
    throw new Error(`${definition.id}: parcels need unique single-letter uppercase IDs.`);
  }

  const tiles: Tile[] = [];
  const starts: number[] = [];
  const pickups = new Map<string, number[]>();
  const destinations = new Map<string, number[]>();
  rows.flat().forEach((symbol, position) => {
    if (symbol === '#') {
      tiles.push({ kind: 'wall' });
      return;
    }
    tiles.push({ kind: 'street', ...(ARROWS[symbol] ? { exit: ARROWS[symbol] } : {}) });
    if (symbol === '@') starts.push(position);
    else if (symbol === '.' || ARROWS[symbol]) return;
    else if (ids.has(symbol)) {
      destinations.set(symbol, [...(destinations.get(symbol) ?? []), position]);
    } else if (ids.has(symbol.toUpperCase()) && symbol === symbol.toLowerCase()) {
      const id = symbol.toUpperCase();
      pickups.set(id, [...(pickups.get(id) ?? []), position]);
    } else {
      throw new Error(`${definition.id}: unknown map symbol "${symbol}".`);
    }
  });
  if (starts.length !== 1) throw new Error(`${definition.id}: use exactly one @ post office.`);
  const parcels = definition.parcels.map((parcel) => {
    const pickup = pickups.get(parcel.id);
    const destination = destinations.get(parcel.id);
    if (pickup?.length !== 1 || destination?.length !== 1) {
      throw new Error(`${definition.id}: parcel ${parcel.id} needs exactly one pickup and one address.`);
    }
    return { ...parcel, pickup: pickup[0], destination: destination[0] };
  });
  return { definition, width, height: rows.length, start: starts[0], tiles, parcels };
}

export function createInitialState(level: Level): GameState {
  return {
    position: level.start,
    facing: 'right',
    parcelLocations: level.parcels.map((parcel) => parcel.pickup),
    steps: 0,
  };
}

export function createSession(level: Level): GameSession {
  return { current: createInitialState(level), history: [] };
}

export function deliveredCount(state: GameState): number {
  return state.parcelLocations.filter((location) => location === 'delivered').length;
}

export function bagCount(state: GameState): number {
  return state.parcelLocations.filter((location) => location === 'bag').length;
}

export function remainingMoves(level: Level, state: GameState): number {
  return Math.max(0, level.definition.moveBudget - state.steps);
}

export function getPhase(level: Level, state: GameState): GamePhase {
  if (deliveredCount(state) === level.parcels.length) return 'complete';
  return remainingMoves(level, state) === 0 ? 'exhausted' : 'playing';
}

export function coordinates(level: Level, position: number): { row: number; column: number } {
  return { row: Math.floor(position / level.width) + 1, column: position % level.width + 1 };
}

export function move(level: Level, state: GameState, direction: Direction): MoveResult {
  const blocked = (reason: BlockReason): MoveResult => ({
    state, moved: false, blocked: reason, events: [],
  });
  const phase = getPhase(level, state);
  if (phase === 'complete') return blocked('complete');
  if (phase === 'exhausted') return blocked('budget');
  const street = level.tiles[state.position];
  if (street.exit && direction !== street.exit) return blocked('one-way');

  const [dx, dy] = OFFSETS[direction];
  const x = state.position % level.width + dx;
  const y = Math.floor(state.position / level.width) + dy;
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return blocked('edge');
  const position = y * level.width + x;
  if (level.tiles[position].kind === 'wall') return blocked('wall');

  const parcelLocations = [...state.parcelLocations];
  const events: MoveEvent[] = [];
  // Delivery comes first so a future map format may safely co-locate an address and a pickup.
  level.parcels.forEach((parcel, index) => {
    if (parcelLocations[index] === 'bag' && parcel.destination === position) {
      parcelLocations[index] = 'delivered';
      events.push({ type: 'delivery', parcelId: parcel.id });
    }
  });
  let load = parcelLocations.filter((location) => location === 'bag').length;
  level.parcels.forEach((parcel, index) => {
    if (parcelLocations[index] !== position) return;
    if (load < level.definition.capacity) {
      parcelLocations[index] = 'bag';
      load += 1;
      events.push({ type: 'pickup', parcelId: parcel.id });
    } else {
      events.push({ type: 'full', parcelId: parcel.id });
    }
  });
  return {
    moved: true,
    events,
    state: { position, facing: direction, parcelLocations, steps: state.steps + 1 },
  };
}

export function takeTurn(level: Level, session: GameSession, direction: Direction): TurnResult {
  const result = move(level, session.current, direction);
  return {
    move: result,
    session: result.moved
      ? { current: result.state, history: [...session.history, session.current] }
      : session,
  };
}

export function undoTurn(session: GameSession): GameSession {
  const previous = session.history.at(-1);
  return previous
    ? { current: previous, history: session.history.slice(0, -1) }
    : session;
}

// Facing is cosmetic. BFS reaches a position/load configuration with the fewest spent moves first.
function stateKey(state: GameState): string {
  return `${state.position}|${state.parcelLocations.join(',')}`;
}

export function solve(
  level: Level,
  initial: GameState = createInitialState(level),
  maxVisited = 100_000,
): SolverResult {
  if (!Number.isInteger(maxVisited) || maxVisited < 1) {
    throw new Error('The solver visit limit must be a positive integer.');
  }
  if (getPhase(level, initial) === 'complete') return { status: 'solved', moves: [], visited: 1 };
  interface Node {
    state: GameState;
    parent: number;
    direction?: Direction;
  }
  const nodes: Node[] = [{ state: initial, parent: -1 }];
  const seen = new Set([stateKey(initial)]);
  for (let head = 0; head < nodes.length; head += 1) {
    for (const direction of DIRECTIONS) {
      const result = move(level, nodes[head].state, direction);
      if (!result.moved) continue;
      const key = stateKey(result.state);
      if (seen.has(key)) continue;
      if (seen.size >= maxVisited) return { status: 'limit', moves: [], visited: seen.size };
      seen.add(key);
      const index = nodes.push({ state: result.state, parent: head, direction }) - 1;
      if (getPhase(level, result.state) === 'complete') {
        const moves: Direction[] = [];
        for (let cursor = index; nodes[cursor].parent !== -1; cursor = nodes[cursor].parent) {
          moves.push(nodes[cursor].direction!);
        }
        return { status: 'solved', moves: moves.reverse(), visited: seen.size };
      }
    }
  }
  return { status: 'unsolvable', moves: [], visited: seen.size };
}

import { AgentValidationError, requireRule } from '../agents/errors';
import { array, integer, object, text } from '../agents/schema';

export const MAX_SAVE_CHARACTERS = 512 * 1024;
export const MAX_GAME_COMMANDS = 600;

export interface GameDefinition<S, C> {
  id: string;
  create(seed: number): S;
  reduce(state: S, command: C): S;
  parseCommand(value: unknown): C;
}

export class GameSession<S, C> {
  private readonly definition: GameDefinition<S, C>;
  private current: S;
  private currentSeed: number;
  private commands: C[] = [];
  private generation = 0;
  private readonly listeners = new Set<() => void>();

  constructor(definition: GameDefinition<S, C>, seed = 1) {
    requireRule(/^[a-z][a-z0-9-]*$/.test(definition.id), 'The game needs a valid identifier.');
    this.definition = definition;
    this.currentSeed = integer(seed, 'Seed', 0, 0xffffffff);
    this.current = definition.create(this.currentSeed);
  }

  get state(): S { return this.current; }
  get revision(): number { return this.generation; }
  get seed(): number { return this.currentSeed; }
  get moveCount(): number { return this.commands.length; }

  preview(command: C): S {
    return this.definition.reduce(this.current, this.definition.parseCommand(command));
  }

  dispatch(command: C): S {
    requireRule(this.commands.length < MAX_GAME_COMMANDS, 'This session reached its move limit. Export it and start a new game.');
    const parsed = this.definition.parseCommand(structuredClone(command));
    const next = this.definition.reduce(this.current, parsed);
    requireRule(JSON.stringify([...this.commands, parsed]).length + 200 <= MAX_SAVE_CHARACTERS,
      'This session reached its replay size limit. Export it and start a new game.');
    this.current = next;
    this.commands.push(parsed);
    this.changed();
    return this.current;
  }

  reset(seed = this.currentSeed): void {
    const nextSeed = integer(seed, 'Seed', 0, 0xffffffff);
    const next = this.definition.create(nextSeed);
    this.currentSeed = nextSeed;
    this.current = next;
    this.commands = [];
    this.changed();
  }

  serialize(): string {
    const encoded = JSON.stringify({
      format: 'odd-index-game',
      version: 1,
      game: this.definition.id,
      seed: this.currentSeed,
      commands: this.commands,
    });
    requireRule(encoded.length <= MAX_SAVE_CHARACTERS, 'This replay exceeds the export size limit.');
    return encoded;
  }

  restore(encoded: string): void {
    requireRule(encoded.length <= MAX_SAVE_CHARACTERS, 'This replay file is too large.');
    let value: unknown;
    try {
      value = JSON.parse(encoded);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new AgentValidationError('The replay file is not valid JSON.');
    }
    const record = object(value, ['format', 'version', 'game', 'seed', 'commands'], 'Replay');
    requireRule(record.format === 'odd-index-game' && record.version === 1, 'This replay format or version is not supported.');
    requireRule(text(record.game, 'Game', 80) === this.definition.id, 'This replay belongs to a different game.');
    const seed = integer(record.seed, 'Seed', 0, 0xffffffff);
    const commands = array(record.commands, entry => this.definition.parseCommand(entry), 'Replay moves', 0, MAX_GAME_COMMANDS);
    let state = this.definition.create(seed);
    // Replaying into a draft validates phases and resource budgets before anything becomes visible.
    for (const command of commands) state = this.definition.reduce(state, command);
    this.currentSeed = seed;
    this.current = state;
    this.commands = commands;
    this.changed();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private changed(): void {
    this.generation++;
    for (const listener of this.listeners) listener();
  }
}

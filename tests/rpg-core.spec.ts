import { expect, test } from '@playwright/test';
import { createInventory, exchangeInventory, inventorySize } from '../src/core/rpg/inventory';
import { gainExperience, progression } from '../src/core/rpg/progression';
import { GameSession, MAX_GAME_COMMANDS, MAX_SAVE_CHARACTERS } from '../src/core/games/session';
import { object, text } from '../src/core/agents/schema';

const items = ['ore', 'tonic', 'charm'] as const;
const curve = [0, 6, 16, 30, 50] as const;

test('RPG inventories pay real costs before rewards and preserve input on success or failure', () => {
  const bag = createInventory(items, [{ item: 'ore', amount: 3 }, { item: 'tonic', amount: 1 }]);
  Object.freeze(bag);
  const crafted = exchangeInventory(bag, {
    spend: [{ item: 'ore', amount: 1 }, { item: 'ore', amount: 1 }],
    gain: [{ item: 'charm', amount: 1 }],
  }, { capacity: 4 });
  expect(crafted).toEqual({ ore: 1, tonic: 1, charm: 1 });
  expect(bag).toEqual({ ore: 3, tonic: 1, charm: 0 });
  expect(inventorySize(crafted)).toBe(3);
  expect(() => exchangeInventory(bag, {
    spend: [{ item: 'charm', amount: 1 }], gain: [{ item: 'charm', amount: 1 }],
  })).toThrow('Not enough charm');
  expect(() => exchangeInventory(bag, { spend: [{ item: 'ore', amount: 2 }, { item: 'ore', amount: 2 }] })).toThrow('Not enough ore');
  expect(() => exchangeInventory(bag, { gain: [{ item: 'tonic', amount: 2 }] }, { capacity: 4 })).toThrow('capacity');
  expect(bag).toEqual({ ore: 3, tonic: 1, charm: 0 });
});

test('RPG inventory boundaries reject unknown items, fractional amounts and overflow', () => {
  expect(() => createInventory(['ore', 'ore'])).toThrow('unique');
  expect(() => createInventory(['../ore'])).toThrow('readable');
  expect(() => exchangeInventory<string>({ ore: 0 }, { gain: [{ item: 'missing', amount: 1 }] })).toThrow('Unknown');
  for (const amount of [-1, 0, .5, NaN, Infinity, 1_000_001]) {
    expect(() => exchangeInventory({ ore: 1 }, { gain: [{ item: 'ore', amount }] })).toThrow();
  }
  expect(() => exchangeInventory({ ore: 1 }, { gain: [{ item: 'ore', amount: 2 }] }, { stackLimit: 2 })).toThrow('stack');
  expect(() => inventorySize({ ore: -1 })).toThrow();
  expect(() => inventorySize({ ore: 1_000_000, tonic: 1 })).toThrow();
  expect(exchangeInventory({ ore: 4, charm: 0 }, {
    spend: [{ item: 'ore', amount: 4 }], gain: [{ item: 'charm', amount: 4 }],
  }, { capacity: 4 })).toEqual({ ore: 0, charm: 4 });
});

test('RPG progression handles exact thresholds, multi-level rewards and the final level', () => {
  expect(progression(5, curve)).toEqual({ xp: 5, level: 1, nextThreshold: 6, remaining: 1 });
  expect(progression(6, curve)).toEqual({ xp: 6, level: 2, nextThreshold: 16, remaining: 10 });
  expect(gainExperience(5, 25, curve)).toEqual({ xp: 30, level: 4, nextThreshold: 50, remaining: 20, earnedLevels: 3 });
  expect(gainExperience(50, 20, curve)).toEqual({ xp: 70, level: 5, nextThreshold: null, remaining: 0, earnedLevels: 0 });
  for (const invalid of [[], [1, 2], [0, 0], [0, 4, 2], [0, NaN], [0, .5]]) {
    expect(() => progression(1, invalid)).toThrow();
  }
  expect(() => gainExperience(0, -1, curve)).toThrow();
  expect(() => gainExperience(1_000_000, 1, curve)).toThrow();
});

test('RPG replay preflight and preview enforce the same budgets as commit', () => {
  const definition = {
    id: 'rpg-budget-fixture', create: () => 0,
    reduce: (state: number, _command: { note: string }) => state + 1,
    parseCommand(value: unknown) {
      const entry = object(value, ['note']);
      return { note: text(entry.note, 'Note', MAX_SAVE_CHARACTERS) };
    },
  };
  const session = new GameSession(definition);
  for (let index = 0; index < MAX_GAME_COMMANDS; index++) session.dispatch({ note: 'one move' });
  const saved = session.serialize(), revision = session.revision;
  expect(() => session.assertCanDispatch()).toThrow('move limit');
  expect(() => session.preview({ note: 'one more' })).toThrow('move limit');
  expect(() => session.dispatch({ note: 'one more' })).toThrow('move limit');
  expect(session.serialize()).toBe(saved);
  expect(session.revision).toBe(revision);
  const large = new GameSession(definition);
  large.dispatch({ note: 'x'.repeat(MAX_SAVE_CHARACTERS - 2000) });
  expect(() => large.assertCanDispatch(32768)).toThrow('replay space');
  expect(() => large.preview({ note: 'x'.repeat(3000) })).toThrow('size limit');
  expect(() => large.dispatch({ note: 'x'.repeat(3000) })).toThrow('size limit');
  expect(large.moveCount).toBe(1);
});

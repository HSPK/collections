import { requireRule } from '../agents/errors';
import { integer } from '../agents/schema';

export type Inventory<I extends string> = Record<I, number>;
export interface ItemStack<I extends string> { item: I; amount: number }
export interface InventoryLimits { capacity?: number; stackLimit?: number }

export function inventorySize<I extends string>(inventory: Readonly<Inventory<I>>): number {
  let size = 0;
  for (const value of Object.values<number>(inventory)) size += integer(value, 'Item count', 0, 1_000_000);
  return integer(size, 'Inventory size', 0, 1_000_000);
}

export function createInventory<I extends string>(
  ids: readonly I[], initial: readonly ItemStack<I>[] = [], limits: InventoryLimits = {},
): Inventory<I> {
  requireRule(ids.length > 0 && new Set(ids).size === ids.length &&
    ids.every(id => /^[a-z][a-z0-9-]*$/.test(id)), 'Inventory needs unique, readable item IDs.');
  const empty = Object.fromEntries(ids.map(id => [id, 0])) as Inventory<I>;
  return exchangeInventory(empty, { gain: initial }, limits);
}

export function exchangeInventory<I extends string>(
  inventory: Readonly<Inventory<I>>,
  exchange: { spend?: readonly ItemStack<I>[]; gain?: readonly ItemStack<I>[] },
  limits: InventoryLimits = {},
): Inventory<I> {
  inventorySize(inventory);
  const capacity = integer(limits.capacity ?? 1_000_000, 'Inventory capacity', 0, 1_000_000);
  const stackLimit = integer(limits.stackLimit ?? 1_000_000, 'Stack limit', 0, 1_000_000);
  const spending = new Map<I, number>(), gaining = new Map<I, number>();
  for (const [stacks, totals] of [[exchange.spend ?? [], spending], [exchange.gain ?? [], gaining]] as const) {
    requireRule(stacks.length <= 1000, 'An inventory exchange contains too many entries.');
    for (const { item, amount } of stacks) {
      requireRule(Object.hasOwn(inventory, item), `Unknown inventory item: ${item}.`);
      const count = integer(amount, 'Exchange quantity', 1, 1_000_000);
      totals.set(item, integer((totals.get(item) ?? 0) + count, 'Total exchange quantity', 1, 1_000_000));
    }
  }
  // Costs must exist before rewards; netting alone would allow crafting from nothing.
  for (const [item, count] of spending) requireRule(inventory[item] >= count, `Not enough ${item}.`);
  const next: Inventory<I> = { ...inventory };
  for (const [item, count] of spending) next[item] -= count;
  for (const [item, count] of gaining) next[item] += count;
  requireRule(Object.values<number>(next).every(count => Number.isSafeInteger(count) && count <= stackLimit),
    'This exchange exceeds an item stack limit.');
  requireRule(inventorySize(next) <= capacity, 'This exchange exceeds inventory capacity.');
  return next;
}

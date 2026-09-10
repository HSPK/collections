import { requireRule } from '../../core/agents/errors';
import { MAX_TRACE, WAVE_TICKS, schedule } from './data';
import type { Lane, Plan, Spawn, Upgrade } from './data';

export interface Input { tick: number; lane: Lane; pulse: boolean }
export interface Lamp { energy: number; heat: number; cooldown: number; flash: number }
export interface Shadow { spawn: Spawn; hp: number; status: 'waiting' | 'live' | 'star' | 'escaped'; resolved: number }
export interface WaveStats { cleared: number; pulses: number; hits: number; misses: number; maxCombo: number; lanes: number[] }
export interface Round {
  tick: number; lane: Lane; lives: number; score: number; combo: number; capacity: number; cooling: number;
  lamps: Lamp[]; shadows: Shadow[]; stats: WaveStats; terminal: boolean;
}
export function createRound(plan: Plan, wave: number, lives = 3, upgrades: readonly Upgrade[] = []): Round {
  const capacity = 100 + upgrades.filter(u => u === 'reserve').length * 20;
  return {
    tick: 0, lane: 1, lives, score: 0, combo: 0, capacity,
    cooling: 2 + upgrades.filter(u => u === 'breeze').length,
    lamps: Array.from({ length: 3 }, () => ({ energy: capacity, heat: 0, cooldown: 0, flash: -100 })),
    shadows: schedule(plan, wave).map(spawn => ({ spawn, hp: spawn.kind === 'crown' ? 2 : 1, status: 'waiting', resolved: -1 })),
    stats: { cleared: 0, pulses: 0, hits: 0, misses: 0, maxCombo: 0, lanes: [0, 0, 0] }, terminal: false,
  };
}
export function vulnerable(shadow: Shadow, tick: number): boolean {
  const age = tick - shadow.spawn.tick;
  return shadow.status === 'live' && age >= (shadow.spawn.kind === 'kite' || shadow.spawn.kind === 'mask' ? 32 : 24) && age <= 60;
}
/** Mutates only its owned, deterministic round; no wall-clock, random, DOM or network. */
export function step(round: Round, input?: Input): void {
  requireRule(!round.terminal, '这更已经结束，不能再输入。');
  const tick = round.tick + 1;
  if (input) {
    requireRule(input.tick === tick && Number.isInteger(input.lane) && input.lane >= 0 && input.lane <= 2 && typeof input.pulse === 'boolean', '输入必须属于下一逻辑刻和有效灯道。');
    round.lane = input.lane;
  }
  round.tick = tick;
  for (const shadow of round.shadows) if (shadow.spawn.tick === tick) shadow.status = 'live';
  for (const lamp of round.lamps) lamp.cooldown = Math.max(0, lamp.cooldown - 1);
  let fired = -1;
  const selected = round.lamps[round.lane];
  if (input?.pulse && selected.cooldown === 0 && selected.energy >= 28 && selected.heat <= 68) {
    fired = round.lane;
    selected.energy -= 28; selected.heat += 32; selected.cooldown = 8; selected.flash = tick;
    round.stats.pulses++; round.stats.lanes[fired]++;
    let connected = false;
    for (const shadow of round.shadows) {
      if (shadow.spawn.lane !== fired || !vulnerable(shadow, tick)) continue;
      connected = true;
      shadow.hp--; round.stats.hits++;
      if (shadow.hp > 0) continue;
      shadow.status = 'star'; shadow.resolved = tick;
      round.combo++; round.stats.cleared++;
      round.stats.maxCombo = Math.max(round.stats.maxCombo, round.combo);
      const age = tick - shadow.spawn.tick;
      round.score += 100 + Math.min(20, round.combo) * 10 + (age >= 44 && age <= 52 ? 20 : 0);
    }
    if (!connected) { round.stats.misses++; round.combo = 0; }
  }
  for (let lane = 0; lane < 3; lane++) {
    if (lane === fired) continue;
    const lamp = round.lamps[lane];
    lamp.energy = Math.min(round.capacity, lamp.energy + 2);
    lamp.heat = Math.max(0, lamp.heat - round.cooling);
  }
  // Light on the deadline saves a fold. Once the third fold is lost, nothing later scores.
  for (const shadow of round.shadows) {
    if (shadow.status !== 'live' || tick - shadow.spawn.tick < 60) continue;
    shadow.status = 'escaped'; shadow.resolved = tick; round.lives--; round.combo = 0;
    if (round.lives === 0) break;
  }
  round.terminal = round.lives === 0 || tick === WAVE_TICKS;
}
export function replay(plan: Plan, wave: number, lives: number, upgrades: readonly Upgrade[], trace: readonly Input[], endTick: number): Round {
  requireRule(Number.isInteger(endTick) && endTick >= 1 && endTick <= WAVE_TICKS, '结束刻越界。');
  requireRule(trace.length <= MAX_TRACE, '输入记录超过一更容量。');
  let previous = 0;
  for (const input of trace) {
    requireRule(Number.isInteger(input.tick) && input.tick > previous && input.tick <= endTick, '输入必须严格递增，且不能在结束后。');
    requireRule(Number.isInteger(input.lane) && input.lane >= 0 && input.lane <= 2 && typeof input.pulse === 'boolean', '输入灯道或闪光无效。');
    previous = input.tick;
  }
  const round = createRound(plan, wave, lives, upgrades);
  let cursor = 0;
  while (!round.terminal && round.tick < endTick) {
    const input = trace[cursor]?.tick === round.tick + 1 ? trace[cursor++] : undefined;
    step(round, input);
  }
  requireRule(round.terminal && round.tick === endTick && cursor === trace.length, '只能封存完整的一更；不能伪造结束或死亡后的操作。');
  return round;
}
/** A constructive solution for every legal catalog combination, including both boss stages. */
export function winningTrace(plan: Plan, wave: number): Input[] {
  const inputs = new Map<number, Input>();
  for (const spawn of schedule(plan, wave)) {
    inputs.set(spawn.tick + 36, { tick: spawn.tick + 36, lane: spawn.lane, pulse: true });
    if (spawn.kind === 'crown') inputs.set(spawn.tick + 44, { tick: spawn.tick + 44, lane: spawn.lane, pulse: true });
  }
  return [...inputs.values()].sort((a, b) => a.tick - b.tick);
}

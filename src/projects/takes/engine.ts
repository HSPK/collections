import { requireRule } from '../../core/agents/errors';
import { array, choice, integer, number, object, text } from '../../core/agents/schema';
import type { GameDefinition } from '../../core/games/session';
import { ACTORS, ATTENTIONS, CUES, MARK_IDS, POSES, RIGS, SHOTS, legalPoses, openingWorld, portraitActor, scenarios } from './data';
import type { Actor, Camera, Cue, MarkId, Plan, Scenario, Shot, Vec3, World } from './data';
import { coverage, distance, screenDirection } from './geometry';

export interface Evaluation { kept: boolean; reasons: string[]; coverage: ReturnType<typeof coverage>[]; direction: number }
export interface Take { id: number; scene: number; shot: Shot; camera: Camera; world: World; result: Evaluation; note: string }
export interface State {
  phase: 'setup' | 'production' | 'won' | 'lost';
  brief: Scenario; scene: number; film: number; time: number; rehearsals: number;
  world: World; ready: boolean; takes: Take[]; note: string; ending: string;
}
export type Command =
  | { type: 'start'; brief: Scenario }
  | { type: 'rehearse'; cue: Cue; note: string; plan: Plan }
  | { type: 'mark'; mark: MarkId; x: number; z: number }
  | { type: 'prop'; x: number; z: number }
  | { type: 'record'; shot: Shot; camera: Camera }
  | { type: 'next' };

export function parseActor(value: unknown): Actor {
  const a = object(value, ['id', 'mark', 'pose', 'attention', 'line'], 'Actor');
  return { id: choice(a.id, ACTORS, 'Actor'), mark: choice(a.mark, MARK_IDS, 'Mark'), pose: choice(a.pose, POSES, 'Pose'),
    attention: choice(a.attention, ATTENTIONS, 'Attention'), line: text(a.line, 'Dialogue', 120) };
}
export function parsePlan(value: unknown): Plan {
  const p = object(value, ['intention', 'actors'], 'Blocking plan');
  return { intention: text(p.intention, 'Public intention', 200), actors: array(p.actors, parseActor, 'Actors', 2, 2) };
}
export function parseCamera(value: unknown): Camera {
  const c = object(value, ['rig', 'rail', 'distance', 'lens', 'focus', 'height'], 'Camera');
  return { rig: choice(c.rig, RIGS, 'Rig'), rail: number(c.rail, 'Camera rail', -6, 6), distance: number(c.distance, 'Dolly distance', 6, 14),
    lens: integer(c.lens, 'Lens', 28, 85), focus: choice(c.focus, ['both', ...ACTORS], 'Focus'), height: number(c.height, 'Aim height', .5, 2) };
}
function parseBrief(value: unknown): Scenario {
  const b = object(value, ['id', 'title', 'premise', 'beats'], 'Brief');
  const beats = array(b.beats, v => text(v, 'Scene direction', 180), 'Scenes', 3, 3);
  return { id: choice(b.id, scenarios.map(s => s.id), 'Scenario'), title: text(b.title, 'Title', 70), premise: text(b.premise, 'Premise', 500), beats: [beats[0], beats[1], beats[2]] };
}
export function parseCommand(value: unknown): Command {
  requireRule(typeof value === 'object' && value !== null && 'type' in value, 'A command needs a type.');
  switch (value.type) {
    case 'start': { const c = object(value, ['type', 'brief']); return { type: 'start', brief: parseBrief(c.brief) }; }
    case 'rehearse': {
      const c = object(value, ['type', 'cue', 'note', 'plan']);
      return { type: 'rehearse', cue: choice(c.cue, CUES, 'Cue'), note: text(c.note, 'Director note', 200, 0), plan: parsePlan(c.plan) };
    }
    case 'mark': {
      const c = object(value, ['type', 'mark', 'x', 'z']);
      return { type: 'mark', mark: choice(c.mark, MARK_IDS, 'Mark'), x: number(c.x, 'Mark X', -4, 4), z: number(c.z, 'Mark Z', -2, 2) };
    }
    case 'prop': {
      const c = object(value, ['type', 'x', 'z']);
      return { type: 'prop', x: number(c.x, 'Cabinet X', -4, 4), z: number(c.z, 'Cabinet Z', -2, 4) };
    }
    case 'record': { const c = object(value, ['type', 'shot', 'camera']); return { type: 'record', shot: choice(c.shot, SHOTS, 'Shot'), camera: parseCamera(c.camera) }; }
    case 'next': object(value, ['type']); return { type: 'next' };
    default: requireRule(false, 'Unknown Takes command.');
  }
}
export function create(seed: number): State {
  return { phase: 'setup', brief: structuredClone(scenarios[seed % scenarios.length]), scene: 0, film: 10, time: 24, rehearsals: 0,
    world: openingWorld(), ready: false, takes: [], note: '', ending: '' };
}
export function continuityKey(world: World): string {
  return JSON.stringify({ actors: world.actors.map(a => ({ ...a, position: world.marks[a.mark] })), prop: world.prop, cue: world.cue });
}
export function evaluate(state: State, shot: Shot, camera: Camera): Evaluation {
  const world = state.world, readings = world.actors.map(a => coverage(a, camera, world));
  const reasons: string[] = [], direction = screenDirection(camera, world);
  if (!state.ready) reasons.push('Call an AI rehearsal first. The actors have not performed this scene.');
  if (world.cue !== CUES[state.scene]) reasons.push(`This scene needs the ${CUES[state.scene]} cue. Rehearse that beat.`);
  const selected = shot === 'wide' ? world.actors : world.actors.filter(a => a.id === portraitActor(state.scene));
  if (shot === 'wide' && camera.focus !== 'both') reasons.push('The wide needs focus on Both actors.');
  if (shot === 'portrait' && camera.focus !== portraitActor(state.scene)) reasons.push(`Focus the portrait on ${portraitActor(state.scene)}.`);
  for (const a of selected) {
    const c = readings[world.actors.indexOf(a)], name = a.id === 'mica' ? 'Mica' : 'Pip';
    if (!c.inside) reasons.push(`${name} crosses the 4% safe frame. Widen the lens, dolly back, or change the aim height.`);
    if (shot === 'wide' && (c.height < .14 || c.height > .55)) reasons.push(`${name} needs 14–55% frame height in a wide; now ${Math.round(c.height * 100)}%.`);
    if (shot === 'portrait' && (c.height < .55 || c.height > .90)) reasons.push(`${name} needs 55–90% frame height in a portrait; now ${Math.round(c.height * 100)}%. Try 85 mm.`);
    if (c.visible < 8) reasons.push(`${name} has ${c.visible}/9 clear sightlines. Move the cabinet or camera off the obstruction.`);
    if (!legalPoses[CUES[state.scene]].includes(a.pose)) reasons.push(`${name}'s pose does not cover the scene cue.`);
    if (a.attention === 'audience' && state.scene !== 2) reasons.push(`${name} is looking into the audience. Ask for partner or prop attention before the finale.`);
  }
  const anchor = state.takes.find(t => t.scene === state.scene && t.result.kept && t.shot === 'wide');
  if (shot === 'portrait' && !anchor) reasons.push('Keep the establishing wide first: it sets this scene’s continuity.');
  if (anchor) {
    if (direction !== anchor.result.direction || !direction) reasons.push('Screen direction reversed: you crossed the 180-degree line. Return to the original side.');
    if (continuityKey(world) !== continuityKey(anchor.world)) reasons.push('Continuity changed since the wide: restore the same marks, prop, pose, attention and dialogue.');
  }
  if (state.takes.some(t => t.scene === state.scene && t.shot === shot && t.result.kept)) reasons.push('This shot is already in the cut. Choose the other shot or the next scene.');
  return { kept: reasons.length === 0, reasons, coverage: readings, direction };
}
export function sceneComplete(state: State): boolean {
  return SHOTS.every(shot => state.takes.some(t => t.scene === state.scene && t.shot === shot && t.result.kept));
}
function validPositions(world: World): void {
  const positions = world.actors.map(a => world.marks[a.mark]);
  requireRule(distance(positions[0], positions[1]) >= 1.5, 'Actor marks are too close: leave at least 1.5 m between actors.');
  for (const p of positions) requireRule(Math.abs(p.x - world.prop.x) >= 1.25 || Math.abs(p.z - world.prop.z) >= .95, 'The cabinet overlaps an actor. Move it clear of the occupied mark.');
}
function finish(state: State): State {
  const kept = state.takes.filter(t => t.result.kept).length;
  if (kept === 6) {
    state.phase = 'won';
    state.ending = state.film >= 3 ? 'Festival print · A' : state.film >= 1 ? 'Opening night · B' : 'In the can · C';
  } else if (state.film <= 0 || state.time <= 0) {
    state.phase = 'lost';
    state.ending = state.film <= 0 ? `Out of film · ${kept}/6 shots in the cut` : `The theater closed · ${kept}/6 shots in the cut`;
  }
  return state;
}
export function reduce(previous: State, command: Command): State {
  if (command.type === 'start') {
    requireRule(previous.phase === 'setup', 'Restart before opening another production.');
    return { ...previous, brief: structuredClone(command.brief), phase: 'production' };
  }
  requireRule(previous.phase === 'production', 'This production is not running. Open a brief or restart.');
  requireRule(previous.film > 0 && previous.time > 0, 'The production has exhausted its budget.');
  const state = structuredClone(previous);
  switch (command.type) {
    case 'rehearse': {
      requireRule(!sceneComplete(state), 'Both shots are in the cut. Move to the next scene.');
      requireRule(state.rehearsals < 10, 'All ten rehearsal calls are used. Film the current blocking.');
      requireRule(command.plan.actors.length === 2 && ACTORS.every(id => command.plan.actors.filter(a => a.id === id).length === 1), 'Choose exactly one action for Mica and one for Pip.');
      for (const actor of command.plan.actors) {
        requireRule(actor.mark.startsWith(`${actor.id}-`), `${actor.id} must choose a mark from their own role catalog.`);
        requireRule(legalPoses[command.cue].includes(actor.pose), `The ${command.cue} cue allows only ${legalPoses[command.cue].join(' or ')}.`);
      }
      state.world.actors = ACTORS.map(id => ({ ...command.plan.actors.find(a => a.id === id)! }));
      state.world.cue = command.cue;
      validPositions(state.world);
      state.ready = true; state.rehearsals++; state.time--; state.note = command.note;
      break;
    }
    case 'mark': {
      requireRule(command.mark.startsWith('mica') ? command.x <= -.75 : command.x >= .75, 'Mica stays left of -0.75 m; Pip stays right of +0.75 m.');
      state.world.marks[command.mark] = { x: command.x, y: 0, z: command.z };
      validPositions(state.world); state.time--; break;
    }
    case 'prop':
      state.world.prop = { x: command.x, y: 0, z: command.z };
      validPositions(state.world); state.time--; break;
    case 'record': {
      requireRule(state.ready, 'Rehearse with the actors before spending film.');
      requireRule(!sceneComplete(state), 'This scene is complete. Advance to the next scene.');
      const result = evaluate(state, command.shot, command.camera);
      state.takes.push({ id: state.takes.length + 1, scene: state.scene, shot: command.shot, camera: { ...command.camera },
        world: structuredClone(state.world), result, note: state.note });
      state.film--; state.time--; break;
    }
    case 'next':
      requireRule(sceneComplete(state) && state.scene < 2, 'Keep both required shots before changing scenes.');
      state.scene++; state.ready = false; state.world.cue = null;
      state.world.actors = state.world.actors.map(a => ({ ...a, line: '', pose: 'listen' }));
      break;
  }
  return finish(state);
}
export const definition: GameDefinition<State, Command> = { id: 'takes', create, reduce, parseCommand };
export const positionText = (p: Vec3) => `${p.x.toFixed(1)}, ${p.z.toFixed(1)} m`;

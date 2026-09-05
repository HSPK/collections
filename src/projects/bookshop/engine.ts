import { BOOKS, FACTS, SCENES, SCENE_IDS } from './data';
import type { Choice, Condition, Effects, FactId, Scene, SceneId } from './data';

export const BOOKMARK_KEY = 'last-bookshop:bookmark';
export const BOOKMARK_VERSION = 1;
export const MAX_STEPS = 256;
export const START_SCENE: SceneId = 'threshold';

export interface Step {
  scene: SceneId;
  choice: string;
}

export interface Snapshot {
  scene: SceneId;
  facts: readonly FactId[];
  visited: readonly SceneId[];
}

export interface Journey {
  steps: readonly Step[];
  frames: readonly Snapshot[];
}

export interface Bookmark {
  version: typeof BOOKMARK_VERSION;
  steps: readonly Step[];
}

const sceneMap = new Map<SceneId, Scene>(SCENES.map((scene) => [scene.id, scene]));
const factIds = Object.keys(FACTS) as FactId[];

export function getScene(id: SceneId): Scene {
  const scene = sceneMap.get(id);
  if (!scene) throw new Error(`Unknown bookshop scene: ${id}`);
  return scene;
}

export function currentFrame(journey: Journey): Snapshot {
  return journey.frames[journey.frames.length - 1]!;
}

export function meetsCondition(state: Snapshot, condition?: Condition): boolean {
  if (!condition) return true;
  return (condition.all ?? []).every((fact) => state.facts.includes(fact))
    && (condition.none ?? []).every((fact) => !state.facts.includes(fact))
    && (condition.visited ?? []).every((scene) => state.visited.includes(scene))
    && (condition.unvisited ?? []).every((scene) => !state.visited.includes(scene));
}

export function choiceReason(state: Snapshot, choice: Choice): string | undefined {
  if (meetsCondition(state, choice.when)) return undefined;
  if (choice.when?.unvisited?.some((id) => state.visited.includes(id))) {
    return 'Already explored on this path. Use your bookmark to rewind and choose differently.';
  }
  const missing = (choice.when?.all ?? []).filter((id) => !state.facts.includes(id));
  const reason = choice.unavailable ?? 'This path is not open with your present discoveries.';
  return missing.length ? `${reason} Missing: ${missing.map((id) => FACTS[id].label).join('; ')}.` : reason;
}

function applyEffects(facts: readonly FactId[], effects?: Effects): FactId[] {
  const next = new Set(facts);
  for (const fact of effects?.remove ?? []) next.delete(fact);
  for (const fact of effects?.add ?? []) next.add(fact);
  return factIds.filter((fact) => next.has(fact));
}

function enterScene(scene: SceneId, facts: readonly FactId[], visited: readonly SceneId[]): Snapshot {
  return {
    scene,
    facts: applyEffects(facts, getScene(scene).effects),
    visited: visited.includes(scene) ? [...visited] : [...visited, scene],
  };
}

function transition(state: Snapshot, choice: Choice): Snapshot {
  return enterScene(choice.target, applyEffects(state.facts, choice.effects), state.visited);
}

export function newJourney(): Journey {
  return { steps: [], frames: [enterScene(START_SCENE, [], [])] };
}

export function takeChoice(journey: Journey, choiceId: string): Journey | undefined {
  if (journey.steps.length >= MAX_STEPS) return undefined;
  const frame = currentFrame(journey);
  const choice = getScene(frame.scene).choices.find((candidate) => candidate.id === choiceId);
  if (!choice || !meetsCondition(frame, choice.when)) return undefined;
  return {
    steps: [...journey.steps, { scene: frame.scene, choice: choice.id }],
    frames: [...journey.frames, transition(frame, choice)],
  };
}

export function replayJourney(steps: readonly Step[]): Journey | undefined {
  if (steps.length > MAX_STEPS) return undefined;
  let journey = newJourney();
  for (const step of steps) {
    if (step.scene !== currentFrame(journey).scene) return undefined;
    const next = takeChoice(journey, step.choice);
    if (!next) return undefined;
    journey = next;
  }
  return journey;
}

export function rewindJourney(journey: Journey, frameIndex: number): Journey | undefined {
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= journey.frames.length) return undefined;
  return replayJourney(journey.steps.slice(0, frameIndex));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function restoreBookmark(value: unknown): Journey | undefined {
  if (!isRecord(value) || !exactKeys(value, ['version', 'steps'])
    || value.version !== BOOKMARK_VERSION || !Array.isArray(value.steps)
    || value.steps.length > MAX_STEPS) return undefined;
  const steps: Step[] = [];
  for (const step of value.steps) {
    if (!isRecord(step) || !exactKeys(step, ['scene', 'choice'])
      || typeof step.scene !== 'string' || !SCENE_IDS.some((id) => id === step.scene)
      || typeof step.choice !== 'string' || step.choice.length > 80) return undefined;
    steps.push({ scene: step.scene as SceneId, choice: step.choice });
  }
  return replayJourney(steps);
}

export function isBookmark(value: unknown): value is Bookmark {
  return restoreBookmark(value) !== undefined;
}

export function bookmarkFor(journey: Journey): Bookmark {
  return { version: BOOKMARK_VERSION, steps: journey.steps.map((step) => ({ ...step })) };
}

export function paragraphsFor(frame: Snapshot): string[] {
  return getScene(frame.scene).paragraphs.flatMap((paragraph) => {
    if (typeof paragraph === 'string') return [paragraph];
    return meetsCondition(frame, paragraph.when) ? [paragraph.text] : [];
  });
}

export function journeyText(journey: Journey): string {
  const current = currentFrame(journey);
  const scene = getScene(current.scene);
  const lines = [
    'THE LAST BOOKSHOP', 'An original work of fiction.',
    'A copy of this particular journey. Returning to an earlier chapter removes later choices from the bookmark.',
    '',
  ];
  journey.frames.forEach((frame, index) => {
    lines.push(`${index + 1}. ${getScene(frame.scene).title}`, getScene(frame.scene).place, '');
    lines.push(...paragraphsFor(frame).flatMap((paragraph) => [paragraph, '']));
    const step = journey.steps[index];
    if (step) {
      const choice = getScene(step.scene).choices.find((candidate) => candidate.id === step.choice);
      lines.push(`You chose: ${choice?.label ?? step.choice}`, '');
    }
  });
  lines.push(scene.ending ? `Ending: ${scene.ending.name}` : `Your bookmark: ${scene.title}`, '');
  lines.push('IN YOUR POCKET');
  const items = current.facts.filter((id) => FACTS[id].kind === 'item');
  lines.push(...(items.length ? items.map((id) => `- ${FACTS[id].label}: ${FACTS[id].detail}`) : ['Nothing yet.']));
  lines.push('', 'THINGS YOU KNOW');
  const discoveries = current.facts.filter((id) => FACTS[id].kind === 'discovery');
  lines.push(...(discoveries.length ? discoveries.map((id) => `- ${FACTS[id].label}: ${FACTS[id].detail}`) : ['No discoveries recorded yet.']));
  return `${lines.join('\n')}\n`;
}

export interface StoryAudit {
  issues: string[];
  sceneCount: number;
  reachableScenes: SceneId[];
  reachableEndings: SceneId[];
  endingPaths: Partial<Record<SceneId, Step[]>>;
  exploredStates: number;
}

// Explore equivalent story states once; the path is retained only as a reachability witness.
export function auditStory(): StoryAudit {
  const issues: string[] = [];
  const knownScenes = new Set(SCENES.map((scene) => scene.id));
  if (knownScenes.size !== SCENES.length) issues.push('Scene IDs must be unique.');
  for (const id of SCENE_IDS) if (!knownScenes.has(id)) issues.push(`Missing scene: ${id}`);
  const checkCondition = (condition: Condition | undefined, source: string) => {
    for (const id of [...condition?.all ?? [], ...condition?.none ?? []]) {
      if (!Object.hasOwn(FACTS, id)) issues.push(`${source}: unknown fact ${id}`);
    }
    for (const id of [...condition?.visited ?? [], ...condition?.unvisited ?? []]) {
      if (!knownScenes.has(id)) issues.push(`${source}: unknown scene condition ${id}`);
    }
    if (condition?.all?.some((id) => condition.none?.includes(id))
      || condition?.visited?.some((id) => condition.unvisited?.includes(id))) {
      issues.push(`${source}: contradictory requirements.`);
    }
  };
  const checkEffects = (effects: Effects | undefined, source: string) => {
    for (const id of [...effects?.add ?? [], ...effects?.remove ?? []]) {
      if (!Object.hasOwn(FACTS, id)) issues.push(`${source}: unknown effect ${id}`);
    }
    if (effects?.add?.some((id) => effects.remove?.includes(id))) issues.push(`${source}: conflicting effects.`);
  };
  for (const scene of SCENES) {
    if (!scene.title.trim() || !scene.paragraphs.length) issues.push(`${scene.id}: missing chapter content.`);
    if (Boolean(scene.ending) !== (scene.choices.length === 0)) issues.push(`${scene.id}: unintentional dead end or choices after an ending.`);
    if (new Set(scene.choices.map((choice) => choice.id)).size !== scene.choices.length) issues.push(`${scene.id}: duplicate choice IDs.`);
    checkEffects(scene.effects, scene.id);
    for (const paragraph of scene.paragraphs) {
      if (typeof paragraph !== 'string') checkCondition(paragraph.when, `${scene.id} prose`);
    }
    for (const choice of scene.choices) {
      if (!knownScenes.has(choice.target)) issues.push(`${scene.id}/${choice.id}: unknown target ${choice.target}`);
      checkCondition(choice.when, `${scene.id}/${choice.id}`);
      checkEffects(choice.effects, `${scene.id}/${choice.id}`);
    }
  }
  for (const book of BOOKS) if (!knownScenes.has(book.scene)) issues.push(`${book.id}: unknown shelf-book scene.`);
  if (issues.length) return { issues, sceneCount: SCENES.length, reachableScenes: [], reachableEndings: [], endingPaths: {}, exploredStates: 0 };

  const reachableScenes = new Set<SceneId>();
  const endingPaths: Partial<Record<SceneId, Step[]>> = {};
  const seen = new Set<string>();
  const queue: { state: Snapshot; steps: Step[] }[] = [{ state: currentFrame(newJourney()), steps: [] }];
  for (let index = 0; index < queue.length; index += 1) {
    const { state, steps } = queue[index]!;
    const key = `${state.scene}|${[...state.facts].sort().join(',')}|${[...state.visited].sort().join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reachableScenes.add(state.scene);
    const scene = getScene(state.scene);
    const choices = scene.choices.filter((choice) => meetsCondition(state, choice.when));
    if (scene.ending && !endingPaths[state.scene]) endingPaths[state.scene] = steps;
    if (!scene.ending && !choices.length) issues.push(`${scene.id}: a reachable state has no exit.`);
    for (const choice of choices) {
      queue.push({
        state: transition(state, choice),
        steps: [...steps, { scene: state.scene, choice: choice.id }],
      });
    }
  }
  for (const scene of SCENES) {
    if (!reachableScenes.has(scene.id)) issues.push(`Unreachable scene: ${scene.id}`);
    if (scene.ending && !endingPaths[scene.id]) issues.push(`Unreachable ending: ${scene.id}`);
  }
  return {
    issues, sceneCount: SCENES.length, reachableScenes: [...reachableScenes],
    reachableEndings: Object.keys(endingPaths) as SceneId[],
    endingPaths, exploredStates: seen.size,
  };
}

import { ARTIFACTS, DECISIONS, ENDINGS, INITIAL_CHOICES, PLACES, RULES } from './world';
import type { Artifact, Choices, DecisionId, Era, PlaceId, Rule } from './world';

export interface Evaluation {
  facts: Record<string, boolean>;
  active: Choices;
  suspended: DecisionId[];
  ending: typeof ENDINGS[number] | undefined;
}

export const dependencies = (rule: Rule): string[] => [...(rule.all ?? []), ...(rule.any ?? []), ...(rule.not ?? [])];

export function validateWorld(rules: Rule[] = RULES, artifacts: Artifact[] = ARTIFACTS): string[] {
  const errors: string[] = [];
  const ids = new Map(rules.map((rule) => [rule.id, rule]));
  if (ids.size !== rules.length) errors.push('Duplicate rule id.');
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(rule: Rule): void {
    if (visiting.has(rule.id)) { errors.push(`Cycle at ${rule.id}.`); return; }
    if (visited.has(rule.id)) return;
    visiting.add(rule.id);
    for (const id of dependencies(rule)) {
      const parent = ids.get(id);
      if (!parent) errors.push(`${rule.id}: dangling dependency ${id}.`);
      else {
        if (parent.era > rule.era) errors.push(`${rule.id}: dependency points into the future.`);
        visit(parent);
      }
    }
    visiting.delete(rule.id);
    visited.add(rule.id);
    if (rule.choice) {
      const decision = DECISIONS.find((item) => item.id === rule.choice?.decision);
      if (!decision?.options.some((option) => option.id === rule.choice?.value && option.rule === rule.id)) {
        errors.push(`${rule.id}: unknown choice.`);
      }
      if (decision && decision.era !== rule.era) errors.push(`${rule.id}: choice era mismatch.`);
    }
  }
  for (const rule of rules) visit(rule);
  for (const decision of DECISIONS) {
    for (const option of decision.options) if (!ids.has(option.rule)) errors.push(`${decision.id}: missing option rule ${option.rule}.`);
  }
  if (new Set(artifacts.map((item) => item.id)).size !== artifacts.length) errors.push('Duplicate artifact id.');
  for (const artifact of artifacts) {
    const refs = [artifact.visible, ...artifact.variants.map((variant) => variant.when)].filter((id): id is string => !!id);
    for (const id of refs) {
      if (!ids.has(id)) errors.push(`${artifact.id}: dangling event dependency ${id}.`);
      else if (ids.get(id)!.era > artifact.era) errors.push(`${artifact.id}: evidence points into the future.`);
    }
    if (artifact.variants.at(-1)?.when) errors.push(`${artifact.id}: missing fallback variant.`);
    if (!PLACES.some((place) => place.id === artifact.place)) errors.push(`${artifact.id}: unknown place.`);
  }
  return [...new Set(errors)];
}

const ruleMap = new Map(RULES.map((rule) => [rule.id, rule]));
export function getRule(id: string): Rule {
  const rule = ruleMap.get(id);
  if (!rule) throw new Error(`Unknown causal rule: ${id}`);
  return rule;
}

export function initialChoices(): Choices { return { ...INITIAL_CHOICES }; }

export function evaluate(choices: Choices, era: Era = 3): Evaluation {
  const facts: Record<string, boolean> = {};
  const visiting = new Set<string>();
  function resolve(id: string): boolean {
    if (id in facts) return facts[id];
    if (visiting.has(id)) throw new Error(`Causal cycle: ${id}`);
    const rule = getRule(id);
    visiting.add(id);
    const parents = dependencies(rule);
    for (const parent of parents) resolve(parent);
    const value = rule.era <= era &&
      (!rule.choice || choices[rule.choice.decision] === rule.choice.value) &&
      (rule.all ?? []).every((parent) => facts[parent]) &&
      (!rule.any?.length || rule.any.some((parent) => facts[parent])) &&
      (rule.not ?? []).every((parent) => !facts[parent]);
    facts[id] = value;
    visiting.delete(id);
    return value;
  }
  for (const rule of RULES) resolve(rule.id);
  const active: Choices = { shore: null, charter: null, crossing: null, letter: null, room: null, practice: null, invitation: null, performance: null };
  const suspended: DecisionId[] = [];
  for (const decision of DECISIONS) {
    const selected = decision.options.find((option) => choices[decision.id] === option.id);
    if (selected && facts[selected.rule]) active[decision.id] = selected.id;
    else if (selected && decision.era <= era) suspended.push(decision.id);
  }
  return { facts, active, suspended, ending: ENDINGS.find((ending) => facts[ending.rule]) };
}

export function unmet(id: string, evaluation: Evaluation): string[] {
  const rule = getRule(id);
  return [
    ...(rule.all ?? []).filter((parent) => !evaluation.facts[parent]),
    ...(!rule.any?.length || rule.any.some((parent) => evaluation.facts[parent]) ? [] : rule.any),
    ...(rule.not ?? []).filter((parent) => evaluation.facts[parent]),
  ];
}

export function choose(choices: Choices, decisionId: DecisionId, value: string | null): Choices {
  const decision = DECISIONS.find((item) => item.id === decisionId);
  if (!decision) throw new Error(`Unknown decision: ${decisionId}`);
  if (value === null && INITIAL_CHOICES[decisionId] !== null) throw new Error(`The inherited ${decisionId} decision must retain an intention.`);
  if (value !== null) {
    const option = decision.options.find((item) => item.id === value);
    if (!option) throw new Error(`Unknown option for ${decisionId}: ${value}`);
    const missing = unmet(option.rule, evaluate(choices));
    if (missing.length) throw new Error(`Prerequisites unmet: ${missing.map((id) => getRule(id).label).join('; ')}`);
  }
  return { ...choices, [decisionId]: value };
}

export function artifactText(artifact: Artifact, evaluation: Evaluation): Artifact['variants'][number] | undefined {
  if (artifact.visible && !evaluation.facts[artifact.visible]) return undefined;
  return artifact.variants.find((variant) => !variant.when || evaluation.facts[variant.when]);
}

export function locationStates(evaluation: Evaluation, era: Era): Record<PlaceId, string> {
  const f = evaluation.facts;
  return {
    quay: f['steps'] ? 'Seven tidal steps' : f['wall'] ? 'Level embankment' : 'Shore unassigned',
    hall: era < 2 ? f['commons'] ? 'Laundry common trust' : 'Municipal laundry' :
      f['living-score'] ? 'Rehearsal · living score' : f['annotated-edition'] ? 'Reading room · full letter' :
        f['rehearsal'] ? 'Rehearsal room' : f['reading-room'] ? 'Public reading room' : 'Unlet upper floor',
    bridge: era === 0 ? 'Ilex ferry' : f['footbridge'] ? 'Landing footbridge' : f['quay-stop'] ? 'Tram · quay stop' : f['hill-stop'] ? 'Tram · upper stop' : 'Provisional ferry',
    archive: era === 0 ? f['register'] ? 'Accession A.91.44' : 'Reference catalogue' :
      f['collation'] ? 'Original letter recovered' : f['sealed'] ? 'Bound letter · unread' : f['oral-work'] ? 'Kitchen testimony' : f['copies'] ? 'Original dispersed' : 'Deposit unresolved',
    garden: evaluation.ending ? evaluation.ending.subtitle.split(' / ')[1] : 'The sour quince trees',
  };
}

export interface Difference { kind: 'choice' | 'fact' | 'place' | 'document'; id: string; label: string; before: string; after: string; why: string }
export function branchDiff(before: Choices, after: Choices): Difference[] {
  const a = evaluate(before);
  const b = evaluate(after);
  const changes: Difference[] = [];
  for (const decision of DECISIONS) {
    if (before[decision.id] !== after[decision.id]) {
      const label = (value: string | null) => decision.options.find((option) => option.id === value)?.label ?? 'Unassigned';
      changes.push({ kind: 'choice', id: decision.id, label: decision.title, before: label(before[decision.id]), after: label(after[decision.id]), why: `An editorial choice in ${[1891, 1932, 1976, 2026][decision.era]}.` });
    }
  }
  for (const rule of RULES) if (a.facts[rule.id] !== b.facts[rule.id]) {
    changes.push({ kind: 'fact', id: rule.id, label: rule.label, before: a.facts[rule.id] ? 'True' : 'Not true', after: b.facts[rule.id] ? 'True' : 'Not true', why: rule.because });
  }
  const oldPlaces = locationStates(a, 3);
  const newPlaces = locationStates(b, 3);
  for (const place of PLACES) if (oldPlaces[place.id] !== newPlaces[place.id]) {
    changes.push({ kind: 'place', id: place.id, label: place.name, before: oldPlaces[place.id], after: newPlaces[place.id], why: 'Derived from the enacted civic facts.' });
  }
  for (const artifact of ARTIFACTS) {
    const oldText = artifactText(artifact, a);
    const newText = artifactText(artifact, b);
    if (oldText !== newText) changes.push({
      kind: 'document', id: artifact.id, label: artifact.title,
      before: oldText ? 'Earlier wording' : 'Not in this branch', after: newText ? 'Revised wording' : 'Not in this branch',
      why: newText?.annotation ?? 'Its source no longer survives in this branch.',
    });
  }
  return changes;
}

export const HISTORY_LIMIT = 2000;
export interface History { entries: Choices[]; labels: string[]; cursor: number }
export function newHistory(): History { return { entries: [initialChoices()], labels: ['The inherited city'], cursor: 0 }; }
export function current(history: History): Choices { return history.entries[history.cursor]; }
export function commit(history: History, choices: Choices, label: string): History {
  if (JSON.stringify(current(history)) === JSON.stringify(choices)) return history;
  if (history.cursor >= HISTORY_LIMIT - 1) {
    throw new FolioError('The folio history is full. Export it, then revisit an earlier revision before editing.');
  }
  return { entries: [...history.entries.slice(0, history.cursor + 1), { ...choices }], labels: [...history.labels.slice(0, history.cursor + 1), label], cursor: history.cursor + 1 };
}
export function travel(history: History, offset: -1 | 1): History {
  return { ...history, cursor: Math.max(0, Math.min(history.entries.length - 1, history.cursor + offset)) };
}

export interface Save {
  version: 1;
  history: History;
  pinned: Choices | null;
  era: Era;
  document: string;
}
export class FolioError extends Error {}
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function isChoices(value: unknown): value is Choices {
  if (!record(value) || Object.keys(value).length !== DECISIONS.length) return false;
  return DECISIONS.every((decision) =>
    (value[decision.id] === null && INITIAL_CHOICES[decision.id] === null) ||
    decision.options.some((option) => option.id === value[decision.id]));
}
export function isSave(value: unknown): value is Save {
  if (!record(value) || value.version !== 1 || !record(value.history)) return false;
  const h = value.history;
  return Array.isArray(h.entries) && h.entries.length > 0 && h.entries.length <= HISTORY_LIMIT && h.entries.every(isChoices) &&
    Array.isArray(h.labels) && h.labels.length === h.entries.length && h.labels.every((label) => typeof label === 'string' && label.length <= 200) &&
    typeof h.cursor === 'number' && Number.isInteger(h.cursor) && h.cursor >= 0 && h.cursor < h.entries.length &&
    (value.pinned === null || isChoices(value.pinned)) &&
    typeof value.era === 'number' && Number.isInteger(value.era) && value.era >= 0 && value.era <= 3 &&
    typeof value.document === 'string' && ARTIFACTS.some((artifact) => artifact.id === value.document && artifact.era === value.era);
}
export function serialize(save: Save): string {
  if (!isSave(save)) throw new FolioError('This folio cannot be exported: its data is invalid or its history exceeds 2,000 entries.');
  return JSON.stringify(save, null, 2);
}
export function deserialize(text: string): Save {
  if (text.length > 4_000_000) throw new FolioError('This file exceeds the 4 MB folio limit.');
  let value: unknown;
  try { value = JSON.parse(text); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new FolioError('This is not a readable JSON folio. Your current city has not changed.');
  }
  if (!isSave(value)) throw new FolioError('Unsupported or invalid Palinode folio. Expected version 1 with known decisions, documents, and a valid history. Your current city has not changed.');
  return value;
}

export interface Hint { target: string; rule: string; text: string }
export function hintFor(choices: Choices, endingId: string): Hint {
  const evaluation = evaluate(choices);
  const ending = ENDINGS.find((item) => item.id === endingId);
  if (!ending) throw new Error(`Unknown ending: ${endingId}`);
  if (evaluation.facts[ending.ready]) return { target: ending.title, rule: ending.ready, text: `The evidence supports this ending. Go to 2026 and choose “${DECISIONS[7].options.find((option) => option.id === endingId)?.label}”. Nothing has been changed for you.` };
  function trace(id: string): string {
    const missing = unmet(id, evaluation);
    if (missing.length) return trace(missing[0]);
    return id;
  }
  const id = trace(ending.ready);
  const rule = getRule(id);
  const decision = DECISIONS.find((item) => item.id === rule.choice?.decision);
  return {
    target: ending.title, rule: id,
    text: `${rule.label} is not true in this city. ${rule.because}${decision ? ` Look at “${decision.title}” in ${[1891, 1932, 1976, 2026][decision.era]}.` : ''} This is one unmet cause, not a complete solution.`,
  };
}

export function reachableEndings(limit = 10_000): { visited: number; paths: Map<string, Choices>; complete: boolean } {
  const paths = new Map<string, Choices>();
  let visited = 0;
  let complete = true;
  function walk(index: number, choices: Choices): void {
    if (visited >= limit) { complete = false; return; }
    visited++;
    if (index === DECISIONS.length) {
      const ending = evaluate(choices).ending;
      if (ending && !paths.has(ending.id)) paths.set(ending.id, { ...choices });
      return;
    }
    const decision = DECISIONS[index];
    for (const option of decision.options) {
      if (!unmet(option.rule, evaluate(choices)).length) walk(index + 1, { ...choices, [decision.id]: option.id });
    }
  }
  walk(0, { shore: null, charter: null, crossing: null, letter: null, room: null, practice: null, invitation: null, performance: null });
  return { visited, paths, complete };
}

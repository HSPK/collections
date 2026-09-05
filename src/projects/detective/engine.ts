import type { CaseFile, Evidence, Rule } from './data';

export interface Hypothesis {
  personId: string;
  order: readonly string[];
}

export interface Conclusion {
  kind: 'missing-person' | 'missing-evidence' | 'contradiction' | 'incomplete' | 'solved';
  headline: string;
  message: string;
  evidenceIds: readonly string[];
  possibleCount: number;
}

function permutations(items: readonly string[]): string[][] {
  if (items.length === 0) return [[]];
  return items.flatMap((item, index) =>
    permutations(items.filter((_, candidate) => candidate !== index))
      .map((rest) => [item, ...rest]),
  );
}

export function hypotheses(file: CaseFile): Hypothesis[] {
  const ids = file.people.map((person) => person.id);
  const logic = file.logic;
  if (logic.kind === 'profiles') return ids.map((personId) => ({ personId, order: [] }));
  return permutations(ids).map((order) => ({
    personId: order[logic.affectedSlot],
    order,
  }));
}

export function matchesRule(file: CaseFile, hypothesis: Hypothesis, rule: Rule): boolean {
  if (rule.kind === 'fact') {
    const person = file.people.find((candidate) => candidate.id === hypothesis.personId);
    if (!person) throw new Error(`Unknown person in ${file.id}: ${hypothesis.personId}`);
    const fact = person.facts[rule.field];
    if (fact === undefined) throw new Error(`Missing ${rule.field} fact for ${person.id}`);
    return rule.allowed.includes(fact);
  }
  const first = hypothesis.order.indexOf(rule.first);
  const second = hypothesis.order.indexOf(rule.second);
  if (first < 0 || second < 0) throw new Error(`Ordering rule used without its visitors in ${file.id}`);
  return rule.kind === 'before' ? first < second : first + 1 === second;
}

function selectedEvidence(file: CaseFile, evidenceIds: readonly string[]): Evidence[] {
  return [...new Set(evidenceIds)].map((id) => {
    const evidence = file.evidence.find((item) => item.id === id);
    if (!evidence) throw new Error(`Unknown evidence in ${file.id}: ${id}`);
    return evidence;
  });
}

export function possibleHypotheses(
  file: CaseFile,
  evidenceIds: readonly string[] = file.evidence.map((evidence) => evidence.id),
): Hypothesis[] {
  const rules = selectedEvidence(file, evidenceIds).flatMap((evidence) => evidence.rules);
  return hypotheses(file).filter((hypothesis) =>
    rules.every((rule) => matchesRule(file, hypothesis, rule)),
  );
}

export function possiblePeople(
  file: CaseFile,
  evidenceIds?: readonly string[],
): string[] {
  return [...new Set(possibleHypotheses(file, evidenceIds).map((hypothesis) => hypothesis.personId))];
}

export function assessConclusion(
  file: CaseFile,
  personId: string | null,
  evidenceIds: readonly string[],
): Conclusion {
  const possible = possiblePeople(file, evidenceIds);
  if (personId === null) {
    return {
      kind: 'missing-person',
      headline: 'Put a name to your theory.',
      message: 'Choose a person in the dossiers, then present your case. Ruling someone out is only a pencil note.',
      evidenceIds: [],
      possibleCount: possible.length,
    };
  }
  const person = file.people.find((candidate) => candidate.id === personId);
  if (!person) throw new Error(`Unknown nominee in ${file.id}: ${personId}`);
  const evidence = selectedEvidence(file, evidenceIds);
  if (evidence.length === 0) {
    return {
      kind: 'missing-evidence',
      headline: 'A hunch needs a little evidence.',
      message: 'Open the exhibits and pin the ones that support your reasoning. Your case needs to identify just one person.',
      evidenceIds: [],
      possibleCount: possible.length,
    };
  }
  if (!possible.includes(personId)) {
    const directConflicts = evidence.filter((exhibit) =>
      !hypotheses(file).some((hypothesis) =>
        hypothesis.personId === personId &&
        exhibit.rules.every((rule) => matchesRule(file, hypothesis, rule))),
    );
    return {
      kind: 'contradiction',
      headline: 'One thread does not fit.',
      message: directConflicts.length > 0
        ? `${person.name} does not fit ${directConflicts.map((item) => `exhibit ${item.letter}`).join(' and ')}. Revisit the record and try a different conclusion.`
        : `The pinned ordering notes cannot place ${person.name} in the ${file.logic.kind === 'order' ? file.logic.slots[file.logic.affectedSlot] : 'recorded'} visit. Try writing the visits in the notebook, then follow each ordering link.`,
      evidenceIds: directConflicts.map((item) => item.id),
      possibleCount: possible.length,
    };
  }
  if (possible.length !== 1) {
    return {
      kind: 'incomplete',
      headline: 'A good start, not quite a proof.',
      message: `Your pinned evidence still fits ${possible.length} people. ${person.name} is possible, but not yet the only possibility. Find another identifying exhibit; a motive alone is not proof.`,
      evidenceIds: [],
      possibleCount: possible.length,
    };
  }
  const fullSolution = possiblePeople(file);
  if (fullSolution.length !== 1 || fullSolution[0] !== file.solution.personId) {
    throw new Error(`The published solution is not unique for ${file.id}`);
  }
  return {
    kind: 'solved',
    headline: 'Case closed. Nicely reasoned.',
    message: `Your evidence identifies ${person.name}, and rules out every alternative. Here is how the whole story fits together.`,
    evidenceIds: evidence.map((item) => item.id),
    possibleCount: 1,
  };
}

export function setTimelineNote(
  notes: readonly string[],
  slot: number,
  personId: string,
  file: CaseFile,
): string[] {
  if (file.logic.kind !== 'order' || notes.length !== file.logic.slots.length) {
    throw new Error(`Timeline notes do not match ${file.id}`);
  }
  if (!Number.isInteger(slot) || slot < 0 || slot >= notes.length) {
    throw new Error(`Invalid timeline slot: ${slot}`);
  }
  if (personId && !file.people.some((person) => person.id === personId)) {
    throw new Error(`Unknown timeline visitor: ${personId}`);
  }
  return notes.map((value, index) => index === slot ? personId : personId && value === personId ? '' : value);
}

export function validateCase(file: CaseFile): string[] {
  const errors: string[] = [];
  const personIds = file.people.map((person) => person.id);
  const evidenceIds = file.evidence.map((evidence) => evidence.id);
  if (personIds.length < 3 || new Set(personIds).size !== personIds.length) {
    errors.push('A case needs at least three people with unique ids.');
  }
  if (new Set(evidenceIds).size !== evidenceIds.length) errors.push('Evidence ids must be unique.');
  if (!personIds.includes(file.solution.personId)) errors.push('The published answer must be a person in the case.');
  for (const person of file.people) {
    for (const column of file.columns) {
      if (!person.facts[column.key]) errors.push(`${person.id} is missing its ${column.key} record.`);
    }
  }
  if (file.logic.kind === 'order') {
    if (file.logic.slots.length !== personIds.length) errors.push('Each visitor needs exactly one timeline slot.');
    if (new Set(file.logic.slots).size !== file.logic.slots.length) errors.push('Timeline slots must be distinct.');
    if (!Number.isInteger(file.logic.affectedSlot) || file.logic.affectedSlot < 0 || file.logic.affectedSlot >= personIds.length) {
      errors.push('The affected timeline slot must exist.');
    }
  }
  for (const evidence of file.evidence) {
    for (const rule of evidence.rules) {
      if (rule.kind === 'fact') {
        if (file.logic.kind !== 'profiles' || !file.columns.some((column) => column.key === rule.field)) {
          errors.push(`${evidence.id} refers to an unavailable profile field.`);
        }
        if (!rule.allowed.length || !rule.allowed.every((value) =>
          file.people.some((person) => person.facts[rule.field] === value))) {
          errors.push(`${evidence.id} requires a fact value that is not in the records.`);
        }
      } else if (file.logic.kind !== 'order' || !personIds.includes(rule.first) || !personIds.includes(rule.second) || rule.first === rule.second) {
        errors.push(`${evidence.id} has an invalid ordering rule.`);
      }
    }
  }
  if (errors.length === 0) {
    const people = possiblePeople(file);
    if (people.length !== 1 || people[0] !== file.solution.personId) {
      errors.push('The full evidence must identify exactly the published answer.');
    }
    if (file.logic.kind === 'order' && possibleHypotheses(file).length !== 1) {
      errors.push('The full evidence must determine a unique visit order.');
    }
  }
  return errors;
}

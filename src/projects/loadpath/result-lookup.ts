import { ModelError } from './schema';
import type { Bar, Joint, Structure } from './schema';
import type { MemberResult, NodeResult, Solved } from './solver';

interface ResultMatches<T, R> {
  readonly pairs: ReadonlyArray<readonly [T, R]>;
  get(id: string): R;
}
export interface AnalysisMatches {
  members: ResultMatches<Bar, MemberResult>;
  nodes: ResultMatches<Joint, NodeResult>;
}
function matchResults<T extends { id: string }, R extends { id: string }>(items: T[], results: R[], kind: string): ResultMatches<T, R> {
  const byId = new Map(items.map((item) => [item.id, item]));
  if (byId.size !== items.length) throw new ModelError(`Result association has duplicate ${kind} IDs in the model.`);
  const resultsById = new Map<string, R>();
  const pairs = results.map((result): [T, R] => {
    if (resultsById.has(result.id)) throw new ModelError(`Result association has duplicate ${kind} result ${result.id}.`);
    resultsById.set(result.id, result);
    const item = byId.get(result.id);
    if (!item) throw new ModelError(`Cannot match ${kind} result ${result.id} to a model ID. Recalculate the current model.`);
    return [item, result];
  });
  if (resultsById.size !== byId.size) throw new ModelError(`Result association is missing ${kind} results for the current model. Recalculate before displaying or exporting.`);
  return {
    pairs,
    get(id) {
      const result = resultsById.get(id);
      if (!result) throw new ModelError(`Result association is missing ${kind} result ${id}. Recalculate the current model.`);
      return result;
    },
  };
}
/** All result-bearing output surfaces require the same complete, one-to-one ID association. */
export function matchAnalysis(model: Structure, result: Solved): AnalysisMatches {
  return {
    members: matchResults(model.members, result.members, 'member'),
    nodes: matchResults(model.nodes, result.nodes, 'node'),
  };
}

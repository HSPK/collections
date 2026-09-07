import { requireRule } from '../../core/agents/errors';
import { array, choice, integer, isRecord, object, text } from '../../core/agents/schema';
import type { GameDefinition } from '../../core/games/session';
import {
  CAPACITY, CONDITIONS, DELEGATE_IDS, DELEGATES, EMERGENCY_POLICY, FIELDS, HEARING_COST,
  INITIAL_POLICY, MAX_AMENDMENTS, MAX_HEARINGS, SEASONS, SETUPS, VOTES, WORKS,
} from './data';
import type { Command, Decision, DelegateId, Offer, Plan, Policy, Projection, Resources, State, Vote } from './data';

const clamp = (n: number, max = 100) => Math.max(0, Math.min(max, n));
export const allocated = (policy: Policy) => FIELDS.reduce((total, field) => total + policy[field], 0);
export const majority = (state: State) => state.decisions.filter(decision => decision.vote === 'yes').length >= 2;
export const forecast = (state: State) => {
  const season = SEASONS[state.season];
  return { ...season, pressure: season.tide + season.storm + SETUPS[state.condition].pressure };
};

export function create(seed: number): State {
  const setup = SETUPS.estuary;
  return {
    seed, condition: 'estuary', phase: 'setup', season: 0, policy: { ...INITIAL_POLICY },
    resources: { water: setup.water, energy: setup.energy, food: setup.food, funds: setup.funds, integrity: 84, cohesion: setup.cohesion },
    hearings: 0, amendments: 0, decisions: [], offers: [], offeredBy: [], pledge: 'none',
    pacts: [], trust: { vale: 3, reed: 3, moss: 3 }, history: [], ending: '',
  };
}

export function projectPolicy(
  state: State, policy: Policy = state.policy, emergency = false, reserveHearing = state.phase === 'draft',
): Projection {
  const weather = forecast(state);
  const before = state.resources;
  const defence = 4 + policy.barrier * 2;
  const flood = Math.max(0, weather.pressure - defence);
  const captured = weather.rain + policy.water * 2;
  const generation = policy.power * 3;
  const load = 5 + policy.water + Math.ceil(policy.barrier / 2) + weather.cold;
  const harvest = policy.food * 2;
  const raw = {
    water: before.water + captured - 6 - flood,
    energy: before.energy + generation - load - flood,
    food: before.food + harvest - 7 - flood * 2,
  };
  const shortage = { water: Math.max(0, -raw.water), energy: Math.max(0, -raw.energy), food: Math.max(0, -raw.food) };
  const spill = { water: Math.max(0, raw.water - CAPACITY), energy: Math.max(0, raw.energy - CAPACITY), food: Math.max(0, raw.food - CAPACITY) };
  const income = 7 + Math.floor(policy.power / 2);
  const expense = 6 + flood * 2 + (emergency ? 3 : 0);
  const hearingCost = reserveHearing ? HEARING_COST : 0;
  return {
    pressure: weather.pressure, defence, flood, rain: weather.rain, captured, generation, load, harvest,
    income, expense, hearingCost, raw, shortage, spill,
    after: {
      water: clamp(raw.water, CAPACITY), energy: clamp(raw.energy, CAPACITY), food: clamp(raw.food, CAPACITY),
      funds: before.funds + income - expense - hearingCost,
      integrity: clamp(before.integrity - flood * 12 + (policy.barrier >= 4 ? 2 : 0)),
      cohesion: clamp(before.cohesion + (emergency ? -14 : 2) - flood * 5 - 6 * (shortage.water + shortage.energy + shortage.food)),
    },
  };
}

export function supportRule(state: State, id: DelegateId, policy = state.policy): { allowed: boolean; reason: string } {
  const next = projectPolicy(state, policy);
  const delegate = DELEGATES[id];
  if (state.trust[id] <= 1 && policy[delegate.field] < 4) {
    return { allowed: false, reason: `Low trust: ${delegate.field} needs at least 4 works.` };
  }
  if (id === 'vale' && next.flood > 0) return { allowed: false, reason: `${next.flood} flood exposure: Vale cannot support flooded quays.` };
  if (id === 'reed' && (next.shortage.energy > 0 || next.after.funds < 0)) {
    return { allowed: false, reason: 'Grid insolvency: energy and treasury must not run short.' };
  }
  if (id === 'moss' && (next.shortage.water > 0 || next.shortage.food > 0)) {
    return { allowed: false, reason: 'Basic needs: food and water must not run short.' };
  }
  return { allowed: true, reason: 'Support is legal, not guaranteed. The delegate decides.' };
}

export function legalVotes(state: State, id: DelegateId, policy = state.policy): Vote[] {
  return supportRule(state, id, policy).allowed ? ['yes', 'no', 'abstain'] : ['no', 'abstain'];
}

export function transfer(policy: Policy, offer: Offer): Policy {
  requireRule(offer.from !== offer.to, 'An offer must transfer between different works.');
  const next = { ...policy, [offer.from]: policy[offer.from] - offer.amount, [offer.to]: policy[offer.to] + offer.amount };
  requireRule(FIELDS.every(field => next[field] >= 0 && next[field] <= 6), 'The offer exceeds a source or destination allocation.');
  return next;
}

export function legalOffers(state: State, id: DelegateId): Offer[] {
  const hearingReserve = HEARING_COST * (state.phase === 'draft' ? 2 : 1);
  if (state.offeredBy.includes(id) || state.hearings >= MAX_HEARINGS - 1 ||
    state.amendments >= MAX_AMENDMENTS || state.resources.funds < hearingReserve) return [];
  const followUp: State = {
    ...state, phase: 'draft',
    resources: { ...state.resources, funds: state.resources.funds - (state.phase === 'draft' ? HEARING_COST : 0) },
  };
  const result: Offer[] = [];
  for (const from of FIELDS) for (const to of FIELDS) for (const amount of [1, 2]) {
    if (from === to || state.policy[from] < amount || state.policy[to] + amount > 6) continue;
    const offer = { delegate: id, from, to, amount };
    if (supportRule(followUp, id, transfer(state.policy, offer)).allowed) result.push(offer);
  }
  return result;
}

export function parsePlan(value: unknown): Plan {
  const plan = object(value, ['decisions', 'offers'], 'Council plan');
  return {
    decisions: array(plan.decisions, value => {
      const item = object(value, ['delegate', 'vote', 'promise', 'statement'], 'Delegate decision');
      return {
        delegate: choice(item.delegate, DELEGATE_IDS, 'Delegate'), vote: choice(item.vote, VOTES, 'Vote'),
        promise: choice(item.promise, ['none', 'reciprocate'] as const, 'Promise'), statement: text(item.statement, 'Public statement', 180),
      };
    }, 'Decisions', 3, 3),
    offers: array(plan.offers, value => {
      const item = object(value, ['delegate', 'from', 'to', 'amount'], 'Counteroffer');
      return {
        delegate: choice(item.delegate, DELEGATE_IDS, 'Delegate'),
        from: choice(item.from, FIELDS, 'Source'), to: choice(item.to, FIELDS, 'Destination'),
        amount: integer(item.amount, 'Transfer', 1, 2),
      };
    }, 'Counteroffers', 0, 2),
  };
}

export function parseCommand(value: unknown): Command {
  requireRule(isRecord(value), 'A move must be an object.');
  const type = choice(value.type, ['start', 'allocate', 'pledge', 'council', 'take-offer', 'amend', 'enact', 'emergency', 'next'] as const, 'Move');
  switch (type) {
    case 'start': {
      const item = object(value, ['type', 'condition']);
      return { type, condition: choice(item.condition, CONDITIONS, 'Campaign condition') };
    }
    case 'allocate': {
      const item = object(value, ['type', 'field', 'value']);
      return { type, field: choice(item.field, FIELDS, 'Works'), value: integer(item.value, 'Allocation', 0, 6) };
    }
    case 'pledge': {
      const item = object(value, ['type', 'delegate']);
      return { type, delegate: choice(item.delegate, ['none', ...DELEGATE_IDS] as const, 'Pledge recipient') };
    }
    case 'take-offer': {
      const item = object(value, ['type', 'delegate']);
      return { type, delegate: choice(item.delegate, DELEGATE_IDS, 'Offer author') };
    }
    case 'council': {
      const item = object(value, ['type', 'plan']);
      return { type, plan: parsePlan(item.plan) };
    }
    default:
      object(value, ['type']);
      return { type };
  }
}

function validateCouncil(state: State, plan: Plan) {
  requireRule(state.phase === 'draft', 'Only a draft can go to a hearing.');
  requireRule(allocated(state.policy) === WORKS, 'Allocate exactly 12 works before requesting a hearing.');
  requireRule(state.hearings < MAX_HEARINGS, 'The season has no hearings left.');
  requireRule(state.resources.funds >= HEARING_COST, 'A hearing costs 2 crowns. The treasury cannot fund it.');
  requireRule(new Set(plan.decisions.map(item => item.delegate)).size === 3, 'Each of the three delegates must vote exactly once.');
  for (const decision of plan.decisions) {
    requireRule(legalVotes(state, decision.delegate).includes(decision.vote), `${DELEGATES[decision.delegate].name}: ${supportRule(state, decision.delegate).reason}`);
    if (decision.promise === 'reciprocate') {
      requireRule(state.pledge === decision.delegate && state.season < SEASONS.length - 1 && decision.vote === 'yes',
        'Reciprocation requires a matching player pledge, a yes vote, and a future season.');
    }
  }
  requireRule(new Set(plan.offers.map(item => item.delegate)).size === plan.offers.length, 'Each delegate may offer only one transfer per season.');
  for (const offer of plan.offers) {
    requireRule(legalOffers(state, offer.delegate).some(legal => legal.from === offer.from && legal.to === offer.to && legal.amount === offer.amount),
      `${DELEGATES[offer.delegate].surname}'s counteroffer is outside the published legal offer budget.`);
  }
}

function reopen(state: State): State {
  requireRule(state.phase === 'ballot', 'Amendments require a completed ballot.');
  requireRule(state.amendments < MAX_AMENDMENTS && state.hearings < MAX_HEARINGS, 'No amendments or hearings remain. Enact the ballot or use the emergency charter.');
  requireRule(state.resources.funds >= HEARING_COST, 'The treasury cannot fund another hearing.');
  return { ...state, phase: 'draft', amendments: state.amendments + 1, decisions: [], offers: [] };
}

function settle(state: State, emergency: boolean): State {
  requireRule(state.phase === 'ballot', 'A completed council ballot is required before any policy is enacted.');
  requireRule(emergency ? !majority(state) : majority(state), emergency ? 'The emergency charter is legal only after rejection.' : 'Adoption requires at least two actual yes votes.');
  const policy = emergency ? { ...EMERGENCY_POLICY } : { ...state.policy };
  const projection = projectPolicy(state, policy, emergency, false);
  const trust = { ...state.trust };
  const trustNotes: string[] = [];
  for (const pact of state.pacts) {
    requireRule(pact.due === state.season, 'A public pact has an invalid due season.');
    const id = pact.delegate;
    if (policy[pact.field] < pact.minimum) {
      trust[id] = clamp(trust[id] - 2, 6);
      projection.after.cohesion = clamp(projection.after.cohesion - 3);
      trustNotes.push(`Your ${DELEGATES[id].surname} pact broke: ${pact.field} below 4. Trust -2, cohesion -3.`);
    } else if (!emergency && supportRule(state, id, policy).allowed && state.decisions.find(item => item.delegate === id)?.vote !== 'yes') {
      trust[id] = clamp(trust[id] - 2, 6);
      projection.after.cohesion = clamp(projection.after.cohesion - 3);
      trustNotes.push(`${DELEGATES[id].surname} withheld promised legal support. Trust -2, cohesion -3.`);
    } else {
      trust[id] = clamp(trust[id] + 1, 6);
      projection.after.cohesion = clamp(projection.after.cohesion + 2);
      trustNotes.push(`${DELEGATES[id].surname} pact honored. Trust +1, cohesion +2.`);
    }
  }
  const pacts = emergency ? [] : state.decisions.filter(item => item.promise === 'reciprocate').map(item => ({
    delegate: item.delegate, field: DELEGATES[item.delegate].field, minimum: 4, due: state.season + 1,
  }));
  const resources = projection.after;
  let ending = '';
  if (resources.integrity <= 0) ending = 'The quays were lost. Flood damage exhausted the city fabric.';
  else if (projection.shortage.water > 0) ending = 'The cisterns ran dry. Clean water demand could not be met.';
  else if (projection.shortage.energy > 0) ending = 'The grid failed. The city could not meet its seasonal energy load.';
  else if (projection.shortage.food > 0) ending = 'The granaries emptied. The city could not feed every district.';
  else if (resources.funds < 0) ending = 'The treasury defaulted. The city could not fund its public works.';
  else if (resources.cohesion <= 0) ending = 'The council lost its mandate. Emergency rule exhausted public cohesion.';
  else if (state.season < SEASONS.length - 1 && resources.funds < HEARING_COST) ending = 'The treasury defaulted. Fewer than 2 crowns remain to convene the next council.';
  else if (state.season === SEASONS.length - 1 && (resources.integrity < 40 || resources.cohesion < 30)) {
    ending = 'The city survived, but the accord did not. The final mandate needs 40 fabric and 30 cohesion.';
  }
  const phase = ending ? 'lost' : state.season === SEASONS.length - 1 ? 'won' : 'resolved';
  if (phase === 'won') ending = 'Nacre stands together. Six tides weathered; a living city, a lasting accord.';
  return {
    ...state, phase, policy, resources, trust, pacts, ending,
    history: [...state.history, {
      season: state.season, mode: emergency ? 'emergency' : 'adopted', policy, votes: state.decisions.map(item => ({ ...item })),
      before: { ...state.resources }, projection, trustNotes,
    }],
  };
}

export function reduce(state: State, input: Command): State {
  const command = parseCommand(input);
  switch (command.type) {
    case 'start': {
      requireRule(state.phase === 'setup', 'A campaign can only start from setup.');
      const setup = SETUPS[command.condition];
      const resources: Resources = { water: setup.water, energy: setup.energy, food: setup.food, funds: setup.funds, cohesion: setup.cohesion, integrity: 84 };
      return { ...state, phase: 'draft', condition: command.condition, resources };
    }
    case 'allocate': {
      requireRule(state.phase === 'draft', 'The voted policy is locked. Spend an amendment to edit it.');
      const policy = { ...state.policy, [command.field]: command.value };
      requireRule(allocated(policy) <= WORKS, 'Only 12 works are available. Release a work before moving it elsewhere.');
      return { ...state, policy };
    }
    case 'pledge':
      requireRule(state.phase === 'draft', 'Pledges belong to the current draft.');
      requireRule(state.season < SEASONS.length - 1 || command.delegate === 'none', 'There is no next season to pledge.');
      return { ...state, pledge: command.delegate };
    case 'council': {
      validateCouncil(state, command.plan);
      return {
        ...state, phase: 'ballot', hearings: state.hearings + 1,
        resources: { ...state.resources, funds: state.resources.funds - HEARING_COST },
        decisions: DELEGATE_IDS.map(id => ({ ...command.plan.decisions.find(item => item.delegate === id)! })),
        offers: command.plan.offers.map(item => ({ ...item })), offeredBy: [...state.offeredBy, ...command.plan.offers.map(item => item.delegate)],
      };
    }
    case 'amend': return reopen(state);
    case 'take-offer': {
      const offer = state.offers.find(item => item.delegate === command.delegate);
      requireRule(offer, 'That delegate has no live counteroffer.');
      return { ...reopen(state), policy: transfer(state.policy, offer) };
    }
    case 'enact': return settle(state, false);
    case 'emergency': return settle(state, true);
    case 'next':
      requireRule(state.phase === 'resolved' && state.season < SEASONS.length - 1, 'The campaign cannot advance from this phase.');
      return {
        ...state, phase: 'draft', season: state.season + 1, hearings: 0, amendments: 0,
        decisions: [], offers: [], offeredBy: [], pledge: 'none',
      };
  }
}

export const definition: GameDefinition<State, Command> = { id: 'accord', create, reduce, parseCommand };

export function decisionFor(state: State, id: DelegateId): Decision | undefined {
  return state.decisions.find(item => item.delegate === id);
}

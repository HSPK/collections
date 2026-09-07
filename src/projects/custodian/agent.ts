import type { AgentRequest } from '../../core/agents/client';
import { requireRule } from '../../core/agents/errors';
import { defineTool, schema } from '../../core/agents/schema';
import { CARGO, CARGO_IDS, LICENCES, PACKAGING, PACKINGS, REGULATIONS, TRAVELLERS } from './data';
import { createSession, measurements, parseArrival, parseBargain } from './engine';
import type { ArrivalPlan, BargainPlan, Question, State } from './engine';

export const arrivalTool = defineTool<ArrivalPlan>({
  name: 'present_consignment',
  description: 'Choose real hidden cargo IDs and affordable packaging, then make a possibly dishonest public declaration. The port computes all physical facts and outcomes.',
  parameters: schema.object({
    cargo: schema.array(schema.enum(CARGO_IDS), 1, 2),
    packing: schema.enum(PACKINGS),
    declaration: schema.object({
      contents: schema.string(), mass: schema.integer(1, 50), temperature: schema.integer(-30, 100),
      licence: schema.enum(LICENCES), testimony: schema.string(),
    }),
    intention: schema.string(),
  }),
  parse: parseArrival,
  summarize: plan => `Declaration filed: ${plan.declaration.contents}. ${plan.intention}`,
});

export const bargainTool = defineTool<BargainPlan>({
  name: 'negotiate_inspection',
  description: 'Offer a bounded quarantine bond or paid, truthful partial disclosure, or refuse. Testimony may lie; certified cargo IDs must be real.',
  parameters: schema.object({
    response: schema.enum(['offer', 'refuse']), amount: schema.integer(0, 4),
    disclosed: schema.array(schema.enum(CARGO_IDS), 0, 2), testimony: schema.string(), intention: schema.string(),
  }),
  parse: parseBargain,
  summarize: plan => `${plan.response === 'offer' ? `Offer: ${plan.amount} credits` : 'Offer refused'}. ${plan.intention}`,
});

const role = `You play one merchant at an original fictional interdimensional customs port, not the officer.
Make a strategic tool decision for this merchant's objective and personality. Never output private reasoning.
Public intentions <=160 characters, testimony <=300, declared contents <=140.
Declarations and testimony can lie. You cannot change measured evidence, permits, credits, rules, or the outcome.
Use only the tool. No external facts, links or code.`;

export function arrivalObservation(state: State) {
  const traveller = TRAVELLERS[state.audits.length];
  requireRule(traveller !== undefined, 'No travellers remain.');
  return {
    stage: 'arrival', travellerNumber: state.audits.length + 1, shift: state.seed,
    merchant: { name: traveller.name, personality: traveller.personality, objective: traveller.objective, preference: traveller.preference, officialLicence: traveller.licence, wallet: traveller.wallet },
    legalCargo: CARGO.filter(item => traveller.cargo.includes(item.id)),
    consignment: { minimumItems: 1, maximumItems: 2, uniqueIds: true, minimumTotalValue: traveller.minimumValue },
    packaging: PACKAGING,
    regulations: REGULATIONS.filter(item => item.from <= state.audits.length + 1),
    precedence: 'Prohibited or unlicensed: return. Otherwise unsafe containment: quarantine. Otherwise admit.',
    officerResources: { minutes: state.minutes, credits: state.credits, scans: state.scans, trust: state.trust },
    utility: 'Admit earns full cargo value; quarantine earns half rounded up; return earns zero. Packaging and accepted bond subtract credits; paid disclosure adds credits. Preferred verdict adds two.',
    instructions: 'Select your hidden consignment and packing, then declare anything plausible. Packing costs come out of your wallet. Do not include actual measurements as extra fields.',
  };
}

export function bargainObservation(state: State, question: Question) {
  requireRule(state.active !== null, 'A merchant must be at the desk.');
  const active = state.active;
  const traveller = TRAVELLERS[active.number - 1];
  const facts = measurements(active);
  const remainingWallet = traveller.wallet - PACKAGING[active.plan.packing].price;
  return {
    stage: 'negotiation', question, travellerNumber: active.number,
    merchant: { name: traveller.name, personality: traveller.personality, objective: traveller.objective, preference: traveller.preference, officialLicence: traveller.licence },
    ownCargo: active.plan.cargo, ownPacking: active.plan.packing, declaration: active.plan.declaration,
    ownGoods: CARGO.filter(item => active.plan.cargo.includes(item.id)),
    officerEvidence: {
      channels: active.inspected,
      grossMass: active.inspected.includes('weigh') ? facts.mass : null,
      temperature: active.inspected.includes('thermal') ? [facts.cold, facts.hot] : null,
      officialLicence: active.inspected.includes('registry') ? facts.licence : null,
      seal: active.inspected.includes('seal') ? facts.packing : null,
      identifiedCargo: active.inspected.includes('scan') ? active.plan.cargo : active.certified,
    },
    remainingWallet, officerCredits: state.credits,
    officerResources: { minutes: state.minutes, scans: state.scans, trust: state.trust },
    utility: 'Admit earns full cargo value; quarantine earns half rounded up; return earns zero. Packaging and accepted bond subtract credits; paid disclosure adds credits. Preferred verdict adds two.',
    regulations: REGULATIONS.filter(item => item.from <= active.number),
    legalOffer: question === 'bond'
      ? { minimum: 2, maximum: Math.min(4, remainingWallet), disclosed: [], consequence: 'If accepted, you pay the amount and the officer must quarantine. No transfer until stamping.' }
      : { minimum: 1, maximum: Math.min(3, state.credits), allowedDisclosure: active.plan.cargo, consequence: 'If accepted, officer pays you and receives the selected real IDs. Reveal one or both, never a false ID.' },
    refusal: { response: 'refuse', amount: 0, disclosed: [] },
    instructions: 'Refuse when maximum is below minimum. You get one negotiation, no further counteroffer. An officer may reject your offer. Testimony is an unverified claim, unlike paid certification.',
  };
}

export function arrivalRequest(state: State, validate: (plan: ArrivalPlan) => void): AgentRequest<ArrivalPlan> {
  return { system: role, observation: arrivalObservation(state), tool: arrivalTool, validate };
}

export function bargainRequest(state: State, question: Question, validate: (plan: BargainPlan) => void): AgentRequest<BargainPlan> {
  return { system: role, observation: bargainObservation(state, question), tool: bargainTool, validate };
}

export function smokeCase(): { request: AgentRequest<ArrivalPlan>; verify(plan: ArrivalPlan): void } {
  const session = createSession();
  return {
    request: arrivalRequest(session.state, plan => { session.preview({ type: 'arrival', plan }); }),
    verify(plan) {
      session.dispatch({ type: 'arrival', plan });
      requireRule(session.state.phase === 'inspection' && session.state.active?.plan.cargo.length !== 0, 'The merchant did not open a real case.');
      const before = session.state.scans;
      session.dispatch({ type: 'inspect', channel: 'scan' });
      requireRule(session.state.scans === before - 1 && session.state.active?.inspected.includes('scan') === true, 'The selected cargo did not produce a paid, replayable scan.');
    },
  };
}

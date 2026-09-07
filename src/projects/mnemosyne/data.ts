export const WITNESS_IDS = ['ivo', 'nell', 'ada', 'bram', 'cyra'] as const;
export type WitnessId = typeof WITNESS_IDS[number];
export const SUSPECT_IDS = ['ada', 'bram', 'cyra'] as const;
export type SuspectId = typeof SUSPECT_IDS[number];
export const CLAIM_IDS = ['imprint', 'passage', 'minute', 'alibi-ada', 'alibi-bram', 'alibi-cyra', 'rumor', 'ribbon'] as const;
export type ClaimId = typeof CLAIM_IDS[number];
export const ARTIFACT_IDS = ['seal', 'threshold', 'recorder', 'ribbon'] as const;
export type ArtifactId = typeof ARTIFACT_IDS[number];
export const ROLES = ['identity', 'entry', 'time'] as const;
export type EvidenceRole = typeof ROLES[number];
export const ROUTES = ['sluice', 'stair', 'arcade'] as const;
export type RouteId = typeof ROUTES[number];
export const TIMES = ['21:10', '21:20', '21:30'] as const;
export type TimeId = typeof TIMES[number];

export const WITNESSES: Record<WitnessId, {
  name: string; role: string; goal: string; x: number; y: number; portrait: number;
}> = {
  ivo: { name: 'Ivo Reed', role: 'Ferry keeper', goal: 'Protect the ferry workers. Offer a small truth before trusting an official.', x: 19, y: 45, portrait: 0 },
  nell: { name: 'Nell Venn', role: 'Bell keeper', goal: 'Correct the town clock without exposing a friend to an unverified rumor.', x: 43, y: 19, portrait: 1 },
  ada: { name: 'Ada Vale', role: 'Archivist', goal: 'Protect the archive and your own reputation. Prefer material evidence to gossip.', x: 78, y: 29, portrait: 2 },
  bram: { name: 'Bram Orr', role: 'Lamplighter', goal: 'Keep the night workers out of scandal. Share practical observations with people who listen.', x: 74, y: 75, portrait: 3 },
  cyra: { name: 'Cyra Moss', role: 'Restorer', goal: 'Preserve fragile objects and avoid being blamed for someone else\'s alterations.', x: 36, y: 78, portrait: 4 },
};

export const CONNECTIONS: readonly [WitnessId, WitnessId, number][] = [
  ['ivo', 'nell', 2], ['ivo', 'cyra', 1], ['nell', 'ada', 2],
  ['nell', 'bram', 1], ['ada', 'bram', 1], ['ada', 'cyra', 2], ['bram', 'cyra', 2],
];

// Both chapters are editable case data; the seed rotates credentials and the authoritative solution.
export const CHAPTERS = [
  {
    title: 'The name that went missing',
    subtitle: 'I / The Empty Cylinder',
    scene: 'At 21:40, the archive opened its annual cylinder of spoken names. One voice was gone. No one was hurt. Yet all five witnesses remember a different ten minutes of the evening.',
    mission: 'Find who removed the voice cylinder, which entrance they used, and the actual minute of the removal.',
    aftermath: 'The cylinder is recovered behind a false shelf. Its missing voice speaks of a second alteration: a flood register quietly rewritten years ago.',
    material: 'A fresh amber crescent is pressed into the cylinder cradle. Only the two amber permit holders could leave this mark.',
    passage: 'Water silt lies inside the locked cradle, not outside it. The cylinder passed through the sluice entrance; the public arcade and dry stair cannot produce this trace.',
    minute: 'The spring recorder stopped when the cylinder was lifted. Its local dial is ten minutes slow. The stopped dial and clock calibration must be read together.',
    location: 'The listening archive',
  },
  {
    title: 'The river remembers',
    subtitle: 'II / The Borrowed Flood',
    scene: 'The recovered voice names a page in the flood register. Tonight someone replaced that page, turning a communal rescue into a private claim. The same witnesses hold different fragments of this new event.',
    mission: 'Identify who substituted the flood page, reconstruct its entry route, and correct the time of the substitution. This is a new crime, not the first culprit again.',
    aftermath: 'The original page returns to the public archive. The rescue belongs to the town again. Memory remains imperfect; the record no longer has to be.',
    material: 'Amber permit wax is embedded in the replacement page. Only the two amber permit holders had access to this wax batch.',
    passage: 'A narrow ladder crease runs through the new page. It entered by the dry stair, whose ladder hatch caused the crease, not by the sluice or public arcade.',
    minute: 'The page press stamped its uncorrected local time. The bell keeper logged a ten-minute lag. Correct the press stamp to establish the substitution minute.',
    location: 'The flood reading room',
  },
] as const;

export interface Claim {
  id: ClaimId;
  title: string;
  text: string;
  kind: 'observation' | 'alibi' | 'rumor';
  role?: EvidenceRole;
  supports: SuspectId[];
  true: boolean;
  route?: RouteId;
  time?: TimeId;
}

export interface Artifact {
  id: ArtifactId;
  title: string;
  location: string;
  caption: string;
  detail: string;
  claimId: ClaimId;
  custodian: WitnessId;
}

export interface CaseFile {
  chapter: number;
  story: typeof CHAPTERS[number];
  culprit: SuspectId;
  route: RouteId;
  time: TimeId;
  localTime: string;
  suspects: { id: SuspectId; permit: string; access: RouteId[]; alibi: string }[];
  claims: Record<ClaimId, Claim>;
  artifacts: Artifact[];
  knowledge: Record<WitnessId, { claimId: ClaimId; trust: number }[]>;
}

export function caseFile(seed: number, chapter: number): CaseFile {
  const story = CHAPTERS[chapter];
  if (!story) throw new Error('Unknown Mnemosyne chapter.');
  const culpritIndex = (seed % 3 + chapter) % 3;
  const culprit = SUSPECT_IDS[culpritIndex];
  const samePermit = SUSPECT_IDS[(culpritIndex + 1) % 3];
  const sameAccess = SUSPECT_IDS[(culpritIndex + 2) % 3];
  const route: RouteId = chapter === 0 ? 'sluice' : 'stair';
  const time = TIMES[(Math.floor(seed / 3) + chapter) % 3];
  const localTime = `21:${String(Number(time.slice(3)) - 10).padStart(2, '0')}`;
  const suspects = SUSPECT_IDS.map(id => ({
    id,
    permit: id === sameAccess ? 'Black' : 'Amber',
    access: id === samePermit ? ['arcade' as const] : [route, 'arcade' as const],
    alibi: id === culprit ? `I was in the public arcade from 21:00 to 21:40. I never entered the ${route}.` :
      id === samePermit ? 'I was sorting permits at the arcade desk from 21:00 to 21:40.' :
        'I was checking the outer gate from 21:00 to 21:40, not inside the archive.',
  }));
  const claims: Record<ClaimId, Claim> = {
    imprint: { id: 'imprint', title: 'The amber imprint', text: story.material, kind: 'observation', role: 'identity', supports: [culprit, samePermit], true: true },
    passage: { id: 'passage', title: 'The inward trace', text: story.passage, kind: 'observation', role: 'entry', supports: [culprit, sameAccess], true: true, route },
    minute: { id: 'minute', title: 'Ten minutes behind', text: `${story.minute} Local reading: ${localTime}. Corrected time: ${time}.`, kind: 'observation', role: 'time', supports: [...SUSPECT_IDS], true: true, time },
    'alibi-ada': { id: 'alibi-ada', title: 'Ada\'s alibi', text: suspects[0].alibi, kind: 'alibi', supports: [], true: culprit !== 'ada' },
    'alibi-bram': { id: 'alibi-bram', title: 'Bram\'s alibi', text: suspects[1].alibi, kind: 'alibi', supports: [], true: culprit !== 'bram' },
    'alibi-cyra': { id: 'alibi-cyra', title: 'Cyra\'s alibi', text: suspects[2].alibi, kind: 'alibi', supports: [], true: culprit !== 'cyra' },
    rumor: { id: 'rumor', title: 'The rust-colored ribbon', text: `Someone saw ${WITNESSES[samePermit].name} with a rust ribbon near the archive. The town calls this proof. It is only a rumor.`, kind: 'rumor', supports: [samePermit], true: false },
    ribbon: { id: 'ribbon', title: 'A ribbon from last winter', text: 'The ribbon is bleached under its knot and catalogued last winter. It cannot date tonight\'s event. The most repeated story is not evidence of this crime.', kind: 'observation', supports: [], true: true },
  };
  return {
    chapter, story, culprit, route, time, localTime, suspects, claims,
    artifacts: [
      { id: 'seal', title: 'Permit wax / plate 01', location: 'The conservation drawer', caption: 'Raking light; amber wax in the recess.', detail: story.material, claimId: 'imprint', custodian: 'cyra' },
      { id: 'threshold', title: 'Threshold / plate 02', location: chapter === 0 ? 'Below the water door' : 'The ladder hatch', caption: 'An inward trace, photographed before cleaning.', detail: story.passage, claimId: 'passage', custodian: 'bram' },
      { id: 'recorder', title: 'The stopped dial / plate 03', location: 'The bell keeper\'s cabinet', caption: `Local dial ${localTime}; calibration slip: +10 minutes.`, detail: claims.minute.text, claimId: 'minute', custodian: 'nell' },
      { id: 'ribbon', title: 'Ribbon / plate 04', location: 'The winter accession box', caption: 'Faded cloth, folded under an old accession stamp.', detail: claims.ribbon.text, claimId: 'ribbon', custodian: 'ada' },
    ],
    knowledge: {
      ivo: [{ claimId: 'imprint', trust: 1 }, { claimId: 'minute', trust: 3 }],
      nell: [{ claimId: 'minute', trust: 1 }, { claimId: 'imprint', trust: 2 }],
      ada: [{ claimId: 'passage', trust: 2 }],
      bram: [{ claimId: 'passage', trust: 1 }, { claimId: 'minute', trust: 2 }],
      cyra: [{ claimId: 'imprint', trust: 2 }, { claimId: 'passage', trust: 2 }],
    },
  };
}

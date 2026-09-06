export type Era = 0 | 1 | 2 | 3;
export type DecisionId = 'shore' | 'charter' | 'crossing' | 'letter' | 'room' | 'practice' | 'invitation' | 'performance';
export type Choices = Record<DecisionId, string | null>;
export type PlaceId = 'quay' | 'hall' | 'bridge' | 'archive' | 'garden';

export interface Rule {
  id: string;
  era: Era;
  label: string;
  because: string;
  choice?: { decision: DecisionId; value: string };
  all?: string[];
  any?: string[];
  not?: string[];
}

export interface Option {
  id: string;
  label: string;
  detail: string;
  rule: string;
}

export interface Decision {
  id: DecisionId;
  era: Era;
  title: string;
  author: string;
  prompt: string;
  options: Option[];
}

export interface Artifact {
  id: string;
  era: Era;
  place: PlaceId;
  title: string;
  kind: string;
  by: string;
  date: string;
  visible?: string;
  variants: { when?: string; text: string[]; annotation: string }[];
}

export const ERAS = [
  { year: '1891', name: 'The foundations', line: 'What a city keeps a place for.' },
  { year: '1932', name: 'The rerouting', line: 'What travels; what stays behind.' },
  { year: '1976', name: 'The inheritance', line: 'A room is not yet a memory.' },
  { year: '2026', name: 'The missing measure', line: 'Who gets to finish the sentence?' },
] as const;

export const PLACES: { id: PlaceId; name: string; number: string }[] = [
  { id: 'quay', name: 'Tidemark Quay', number: '01' },
  { id: 'hall', name: 'The Long Room', number: '02' },
  { id: 'bridge', name: 'Ilex Crossing', number: '03' },
  { id: 'archive', name: 'Municipal Archive', number: '04' },
  { id: 'garden', name: 'Orchard Square', number: '05' },
];

export const DECISIONS: Decision[] = [
  {
    id: 'shore', era: 0, title: 'Draw the waterline', author: 'Works committee, 1891',
    prompt: 'The grant buys one shore: public tidal steps, or a level embankment for a future tram. Both keep the houses dry. They preserve different ways of arriving.',
    options: [
      { id: 'steps', label: 'Keep the tidal steps', detail: 'A public landing; a later footbridge becomes possible. No level tram stop at the quay.', rule: 'steps' },
      { id: 'wall', label: 'Build the embankment', detail: 'A level quay and a tram stop; the old gathering steps disappear.', rule: 'wall' },
    ],
  },
  {
    id: 'charter', era: 0, title: 'Give the room a keeper', author: 'Ada Vale, municipal copyist',
    prompt: 'Ada leaves the upper laundry room and her unfinished civic score to a keeper. The co-operative can pass it from hand to hand. The registry can preserve an authoritative original.',
    options: [
      { id: 'commons', label: 'A common trust', detail: 'The laundry families inherit permission to copy and reinterpret.', rule: 'commons' },
      { id: 'register', label: 'A municipal trust', detail: 'The city inventories the score and protects its exact wording.', rule: 'register' },
    ],
  },
  {
    id: 'crossing', era: 1, title: 'Reroute the crossing', author: 'Transit plan 17, 1932',
    prompt: 'The ferry lease has ended. A small bridge keeps the old walking circuit. A tram viaduct connects the outer wards; on a stepped shore its stop must sit uphill.',
    options: [
      { id: 'bridge', label: 'Build the footbridge', detail: 'Requires the tidal landing. Keeps the five-minute walk to Orchard Square.', rule: 'footbridge' },
      { id: 'tram', label: 'Run the cross-river tram', detail: 'Connects the outer wards. The original walking circuit is interrupted.', rule: 'tram' },
    ],
  },
  {
    id: 'letter', era: 1, title: 'Send the unfinished letter', author: 'Sera Vale, laundry steward',
    prompt: 'Inside the score is an unposted letter. Sera can bind it into the archive, or use the common trust to make kitchen copies. Paper and practice remember different things.',
    options: [
      { id: 'sealed', label: 'Bind the original', detail: 'The whole letter survives, but someone must later read across the catalogue.', rule: 'sealed' },
      { id: 'copies', label: 'Circulate kitchen copies', detail: 'Requires the common trust. The original disperses; a living refrain survives.', rule: 'copies' },
    ],
  },
  {
    id: 'room', era: 2, title: 'Open the unlet floor', author: 'Mina Ren, rooms committee, 1976',
    prompt: 'The laundry has closed. There is funding for one use of the upper floor, not both. The shell will survive either way.',
    options: [
      { id: 'rehearsal', label: 'A neighborhood rehearsal room', detail: 'Makes a live performance possible. The archive remains across the river.', rule: 'rehearsal' },
      { id: 'reading', label: 'A public reading room', detail: 'Provides a home for a documented reading, not a rehearsed street performance.', rule: 'reading-room' },
    ],
  },
  {
    id: 'practice', era: 2, title: 'Recover the missing measure', author: 'Jo Vale & Mina Ren, 1976',
    prompt: 'The printed score ends one measure early. Listen to those who inherited the pause, or collate the bound letter. Neither method can recover material its own past has erased.',
    options: [
      { id: 'listen', label: 'Listen at the kitchen tables', detail: 'Requires circulated copies. Recovers a living score and Ada’s intention, but not every original word.', rule: 'oral-work' },
      { id: 'collate', label: 'Collate the bound letter', detail: 'Requires the bound original. Recovers the complete text, not the inherited rhythm.', rule: 'collation' },
    ],
  },
  {
    id: 'invitation', era: 3, title: 'Address the invitation', author: 'Nell Ren, city retracer, 2026',
    prompt: 'The centennial invitation was never sent. Decide who has the right to complete this work; the choice changes the gathering, not who is welcome in the city.',
    options: [
      { id: 'neighbors', label: 'Invite the inheriting households', detail: 'A return or procession is carried by the families who kept the refrain.', rule: 'neighbors' },
      { id: 'public', label: 'Publish an open invitation', detail: 'A public reading makes the surviving evidence available to everyone.', rule: 'public' },
    ],
  },
  {
    id: 'performance', era: 3, title: 'Complete the Common Measure', author: 'Your final annotation',
    prompt: 'There is no single correct city. There must be an honest relationship between what survived, where people can gather, and what you claim to have recovered.',
    options: [
      { id: 'return', label: 'Return to the steps', detail: 'The old circuit, a rehearsed living score, and the inheriting households.', rule: 'ending-return' },
      { id: 'procession', label: 'Take the refrain across town', detail: 'The tram, a rehearsed living score, and the inheriting households.', rule: 'ending-procession' },
      { id: 'reading', label: 'Read the letter in public', detail: 'A reading room, a collated original, and an open invitation.', rule: 'ending-reading' },
    ],
  },
];

export const RULES: Rule[] = [
  { id: 'steps', era: 0, label: 'The tidal steps survive', choice: { decision: 'shore', value: 'steps' }, because: 'The 1891 works grant preserves the public landing.' },
  { id: 'wall', era: 0, label: 'The quay has a level embankment', choice: { decision: 'shore', value: 'wall' }, because: 'The 1891 works grant builds a continuous, level shore.' },
  { id: 'commons', era: 0, label: 'The laundry families hold copying rights', choice: { decision: 'charter', value: 'commons' }, because: 'Ada leaves her score to a common trust rather than a municipal owner.' },
  { id: 'register', era: 0, label: 'The score has a municipal accession', choice: { decision: 'charter', value: 'register' }, because: 'The municipal trust numbers Ada’s original and keeps its chain of custody.' },
  { id: 'footbridge', era: 1, label: 'A footbridge meets the landing', all: ['steps'], choice: { decision: 'crossing', value: 'bridge' }, because: 'The bridge design requires the tidal landing retained in 1891.' },
  { id: 'tram', era: 1, label: 'The outer wards have a tram connection', choice: { decision: 'crossing', value: 'tram' }, because: 'The 1932 transit plan carries a tram across the Ilex.' },
  { id: 'quay-stop', era: 1, label: 'The tram stops directly on the quay', all: ['tram', 'wall'], because: 'The tram can stop by the water only where the embankment is level.' },
  { id: 'hill-stop', era: 1, label: 'The tram stops uphill', all: ['tram', 'steps'], because: 'The tidal steps survive, so the tram takes its accessible stop on the upper road.' },
  { id: 'old-circuit', era: 1, label: 'Ada’s original walking circuit is intact', all: ['footbridge', 'steps'], because: 'The landing and footbridge join the quay to Orchard Square without a detour.' },
  { id: 'sealed', era: 1, label: 'The original letter is bound in the archive', choice: { decision: 'letter', value: 'sealed' }, because: 'Sera deposits the unposted letter in the municipal binding.' },
  { id: 'copies', era: 1, label: 'Kitchen copies carry the refrain', all: ['commons'], choice: { decision: 'letter', value: 'copies' }, because: 'Sera can circulate the letter only under the common trust’s copying rights.' },
  { id: 'paper-trail', era: 1, label: 'The letter has a traceable paper trail', all: ['sealed'], because: 'The archive records a deposit even if the score itself belongs to the common trust.' },
  { id: 'kitchen-lineage', era: 1, label: 'The Vale households remember the pause', all: ['copies'], because: 'Repeated kitchen performances transmit a rhythm the printed score never specifies.' },
  { id: 'rehearsal', era: 2, label: 'The Long Room is a rehearsal space', choice: { decision: 'room', value: 'rehearsal' }, because: 'The 1976 grant equips the unlet floor for neighborhood rehearsals.' },
  { id: 'reading-room', era: 2, label: 'The Long Room is a public reading room', choice: { decision: 'room', value: 'reading' }, because: 'The 1976 grant fits desks and brings archive copies to the old laundry.' },
  { id: 'oral-work', era: 2, label: 'Jo records the inherited rhythm', all: ['kitchen-lineage'], choice: { decision: 'practice', value: 'listen' }, because: 'Listening work needs the household tradition established by the kitchen copies.' },
  { id: 'collation', era: 2, label: 'Mina collates the complete letter', all: ['paper-trail'], choice: { decision: 'practice', value: 'collate' }, because: 'Collation can recover the exact letter only if Sera bound the original.' },
  { id: 'living-score', era: 2, label: 'A living score can be performed', all: ['oral-work', 'rehearsal'], because: 'The inherited rhythm becomes a performable score when a room exists to rehearse it.' },
  { id: 'letter-understood', era: 2, label: 'The missing measure is understood', any: ['oral-work', 'collation'], because: 'Either the inherited pause or the original letter reveals Ada’s invitation to the absent.' },
  { id: 'working-friendship', era: 2, label: 'Jo and Mina share the work', all: ['oral-work', 'rehearsal'], because: 'Jo brings the family rhythm; Mina gives it a room and a civic record.' },
  { id: 'annotated-edition', era: 2, label: 'An honest annotated edition exists', all: ['collation', 'reading-room'], because: 'The complete text and a public reading room make an edition possible without pretending to recover the lost rhythm.' },
  { id: 'neighbors', era: 3, label: 'The inheriting households are invited', choice: { decision: 'invitation', value: 'neighbors' }, because: 'Nell addresses the invitation to the households who inherited the refrain.' },
  { id: 'public', era: 3, label: 'The invitation is publicly posted', choice: { decision: 'invitation', value: 'public' }, because: 'Nell publishes an invitation to hear the surviving evidence, with no inherited role required.' },
  { id: 'return-ready', era: 3, label: 'An honest return is possible', all: ['old-circuit', 'living-score', 'letter-understood', 'neighbors'], because: 'The original route, the rehearsed rhythm, Ada’s intention, and its inheritors all remain connected.' },
  { id: 'procession-ready', era: 3, label: 'An honest procession is possible', all: ['tram', 'living-score', 'letter-understood', 'neighbors'], because: 'A living score can travel on the new civic route rather than impersonate the vanished circuit.' },
  { id: 'reading-ready', era: 3, label: 'An honest public reading is possible', all: ['annotated-edition', 'letter-understood', 'public'], because: 'The original words can be shared with their missing rhythm openly acknowledged.' },
  { id: 'ending-return', era: 3, label: 'The city returns to the steps', all: ['return-ready'], choice: { decision: 'performance', value: 'return' }, because: 'You choose to complete the score on the original circuit, with its living inheritors.' },
  { id: 'ending-procession', era: 3, label: 'The refrain crosses town', all: ['procession-ready'], choice: { decision: 'performance', value: 'procession' }, because: 'You choose a new route that admits the old city has changed.' },
  { id: 'ending-reading', era: 3, label: 'The letter is read in public', all: ['reading-ready'], choice: { decision: 'performance', value: 'reading' }, because: 'You choose a faithful reading of the evidence rather than invent a lost performance.' },
];

export const INITIAL_CHOICES: Choices = {
  shore: 'wall', charter: 'register', crossing: 'tram', letter: 'sealed',
  room: null, practice: null, invitation: null, performance: null,
};

export const ENDINGS = [
  {
    id: 'return', rule: 'ending-return', ready: 'return-ready', title: 'A place left open',
    subtitle: 'Ending I / The return',
    text: [
      'At low water, Eli sets five chairs on the steps. There are six names on the invitation. Nobody fetches another chair.',
      'The procession is smaller than the centennial committee imagined. It follows Ada’s five-minute circuit: the laundry door, the footbridge, the quince tree, the landing. Jo’s recording supplies the difficult interval. Mina’s neat note supplies the reason not to fill it.',
      'When the last measure comes, everyone waits. An ordinary woman coming home from the late shift crosses the bridge. She does not know a performance is happening. The city makes room for her anyway.',
      'You have not restored 1891. The tram never reached the outer wards in this branch; those journeys still need an answer. But the steps have kept a public permission: to arrive without being expected. Nell closes the file with a blank line, deliberately.',
    ],
  },
  {
    id: 'procession', rule: 'ending-procession', ready: 'procession-ready', title: 'The city carries it',
    subtitle: 'Ending II / The procession',
    text: [
      'Eli asks the passengers to leave the last line unsung. A boy at the rear asks whether that means he has forgotten it. “No,” says Eli. “It means somebody else might need it.”',
      'The Common Measure crosses the river in a tram whose windows will not quite close. Every stop adds an accent. Jo’s kitchen rhythm acquires the uneven beat of rail joints; Mina’s rehearsal notes acquire a coffee ring.',
      'They do not pretend the tram is Ada’s lost footbridge. They name the detour, and the outer wards answer. The pause lasts all the way through the opening of the doors.',
      'Nell writes: a civic memory is not a thing that stays put. This version has lost the original walking circuit, and kept the work alive by letting more of the city change it. The final passenger carries no score. She hums it correctly, except where she does not.',
    ],
  },
  {
    id: 'reading', rule: 'ending-reading', ready: 'reading-ready', title: 'A faithful incompleteness',
    subtitle: 'Ending III / The reading',
    text: [
      'There is no reenactment. Nell says this first. The room contains the surviving words, twenty-three mismatched chairs, and no claim to remember how Ada’s neighbors once sang.',
      'Mina’s edition is open beside Sera’s binding. The crease where the unposted letter folded has become a small, permanent valley. Eli reads: “Leave one measure for the person who cannot arrive. Do not appoint someone to stand in their place.”',
      'At the printed blank, a reader asks about her grandmother. Another asks who was left out of the old invitation. The questions are copied into the margin, not answered on behalf of the absent.',
      'The kitchen refrain is gone from this branch. That loss remains a loss. But the letter no longer masquerades as a missing page: it is a request the present can accept. Nell leaves the reading room open an hour late. Nobody calls the result complete; everybody knows where to find it.',
    ],
  },
] as const;

export const ARTIFACTS: Artifact[] = [
  {
    id: 'waterline', era: 0, place: 'quay', title: 'Two inches above the tide', kind: 'Surveyor’s field sheet', by: 'Oren Pell, borough surveyor', date: '14 March 1891',
    variants: [
      { when: 'steps', text: ['Retain the seven limestone steps. Raise the doors of Nos. 4–18 by two inches; the houses remain dry without surrendering the landing.', 'Mrs. Vale asks whether the steps count as a street. I have marked them as one. A person waiting for the tide is not necessarily going nowhere. The grant leaves no level platform for the proposed tram.'], annotation: 'The bridge plan of 1932 will use this landing as its abutment.' },
      { text: ['Build a continuous embankment from the laundry to the salt gate. Raise the doors of Nos. 4–18 by two inches. The houses remain dry; the level road will take a tram.', 'Mrs. Vale asks where people will wait for the tide. I have drawn a bench. She says a bench is not quite what she meant. The seven steps are entered as stone to be reused.'], annotation: 'A level quay permits a waterside tram stop, but not the old landing bridge.' },
    ],
  },
  {
    id: 'charter', era: 0, place: 'hall', title: 'The room above the wash', kind: 'Deed, clause 6', by: 'Ada Vale, copyist & composer', date: '2 April 1891',
    variants: [
      { when: 'commons', text: ['I give the upper room, its long table, and the score called The Common Measure to the households of the laundry, in common. No household shall own the last word.', 'Copies may be carried away, corrected, and sung differently. Keep the room useful. A room locked for its own protection has already forgotten what it was for.'], annotation: 'The common trust gives Sera legal permission to circulate kitchen copies.' },
      { text: ['I give the upper room, its long table, and the score called The Common Measure to the borough in trust. The original shall be numbered and made available on request.', 'I have copied too many wills with a name omitted. Let this one retain its punctuation. Keep the room useful. A record nobody can find is a room without a door.'], annotation: 'The municipal trust keeps an exact chain of custody, not household copying rights.' },
    ],
  },
  {
    id: 'score', era: 0, place: 'garden', title: 'Five stations, four measures', kind: 'Composer’s working score', by: 'Ada Vale', date: '19 May 1891',
    variants: [{ text: ['Laundry door: a low note, held until the next person finds it. Crossing: two notes, neither louder. Quince tree: whatever the children have been singing. Landing: return to the first note.', 'The fifth station is drawn as an empty rectangle. Beneath it Ada has written, “Not an error.” A second hand has pencilled “missing?” and then rubbed so hard the paper has gone thin.'], annotation: 'The empty measure is intentional. The unposted letter explains whom it is for.' }],
  },
  {
    id: 'laundry', era: 0, place: 'hall', title: 'Monday is not a rehearsal', kind: 'Laundry day book', by: 'Els Vale, Ada’s sister', date: '25 May 1891',
    variants: [{ text: ['Six sheets missing from the count; none missing from the line. Ada has written music on the backs of the tally slips again. If the borough wants a civic performance it can first return my pencil.', 'Nevertheless we tried the first note after the boilers cooled. Mara took it lower than Ada had written. Ada liked that. I liked that we could all hear ourselves without stopping work.'], annotation: 'The practice begins as shared work, not a concert performed for an audience.' }],
  },
  {
    id: 'bench', era: 0, place: 'quay', title: 'For someone waiting', kind: 'Unsent request', by: 'Ada to Oren Pell', date: '7 June 1891',
    variants: [
      { when: 'steps', text: ['Thank you for calling the steps a street. Please do not put a plaque on them. Once a place has a plaque, somebody begins deciding which kind of waiting is appropriate.', 'I need one patch of the city that does not demand an explanation of a person who has come alone. That is all the fifth measure asks of the music, too.'], annotation: 'Place and score share an idea, but preserving the steps alone cannot preserve the music.' },
      { text: ['Thank you for the bench. It is a sensible bench. I know the tram will spare the hill people a long walk. I am not against sensible things.', 'I wonder only whether a public work can reserve a little space for a use we have not yet imagined. If the landing goes, the fifth measure must find another way to wait.'], annotation: 'Ada accepts a rerouted city. A new route need not falsify her intention.' },
    ],
  },
  {
    id: 'accession', era: 0, place: 'archive', title: 'An awkward object to catalogue', kind: 'Accession slip', by: 'Tobin Ren, assistant clerk', date: '11 June 1891',
    variants: [
      { when: 'register', text: ['A.91.44. One manuscript score, twelve leaves, one blank final measure. Owner: borough. Condition: flour in spine, otherwise sound.', 'Suggested heading: Music, civic. Rejected heading: Ceremonies, completed. Mrs. Vale insists the blank remain in the count. I have therefore catalogued a silence, which may complicate the annual return.'], annotation: 'This accession concerns the score. Sera will separately decide what happens to the letter.' },
      { text: ['Reference only. One manuscript score held by the laundry common trust. Not a municipal accession; no transfer of title.', 'Mrs. Vale permits a catalogue description but says the object is partly in the households. I cannot enter households on a shelf. I have left a cross-reference to the room above the wash.'], annotation: 'The archive knows the score exists even when it does not own it.' },
    ],
  },
  {
    id: 'quince', era: 0, place: 'garden', title: 'A tree planted off-center', kind: 'Gardener’s receipt', by: 'Dara Winn', date: '30 September 1891',
    variants: [{ text: ['One quince, rooted stock, planted two feet east of the survey pin. The exact center of the square is a drain. Mr. Pell has accepted that symmetry is not a growing condition.', 'Ada paid for the tree and asked us not to name it after her. The children already call it the sour tree. This seems likely to last longer than any official name.'], annotation: 'Orchard Square survives every branch. Not everything needs to change for a city to be different.' }],
  },
  {
    id: 'transit', era: 1, place: 'bridge', title: 'The shortest distance to whom?', kind: 'Transit committee minutes', by: 'Ivo Ren, minute clerk', date: '6 February 1932',
    variants: [
      { when: 'footbridge', text: ['Plan B adopted: the narrow footbridge meets the retained landing. The old five-minute circuit to Orchard Square remains walkable.', 'The outer wards petition for the tram instead. Their petition is attached, not dismissed. Chairman’s correction: do not write “everyone is now connected.” Write “the landing is connected.”'], annotation: 'The original circuit survives, but the tram’s wider reach does not.' },
      { when: 'tram', text: ['Plan T adopted: a tram viaduct crosses the Ilex. A journey from the outer wards now needs one ticket instead of two ferries.', 'Sera Vale asks that the old performance not be advertised as “restored” on opening day. The five-minute walking circuit is no longer continuous. Her amendment is carried by one vote.'], annotation: 'A procession can use this new route, but an original-route return cannot.' },
      { text: ['Plan B is suspended. Its abutment refers to tidal steps that the earlier works record does not retain. There is no authorization to build into a missing landing.', 'The ferry lease is extended provisionally. Submit a compatible crossing plan, or revise the shore decision. The committee will not conceal the gap with a line on the map.'], annotation: 'This is a suspended intention, not an automatically substituted tram.' },
    ],
  },
  {
    id: 'sera-letter', era: 1, place: 'archive', title: 'The envelope inside the music', kind: 'Deposit cover / delivery note', by: 'Sera Vale', date: '12 March 1932',
    variants: [
      { when: 'sealed', text: ['Mr. Ren: please bind the enclosed letter after leaf twelve. The envelope says “to whoever finishes this,” not a person’s name. I have not made copies.', 'My grandmother’s hand is perfectly legible. What is less legible is why we have all called this a missing page when the paper is here. Perhaps your daughter will be a better reader than your catalogue.'], annotation: 'The original survives for later collation; the household refrain is not transmitted by this deposit.' },
      { when: 'copies', text: ['To the six kitchens: pass the enclosed copy clockwise after Sunday. Sing the last part together before passing it on. The page tells you why; someone at the table will remember how.', 'The common trust permits us to do this. I am sending the original with the first packet, not keeping it above my own stove. There will not be one protected sheet for the archive to recover later.'], annotation: 'Living memory survives by circulation. The unique original loses its chain of custody.' },
      { text: ['The packets have not been sent. The municipal deed reserves reproduction; the kitchen circulation instruction has no authority in this branch.', 'Sera leaves the envelope in the laundry drawer pending a new instruction. Neither a protected archive deposit nor a continuing household refrain should be assumed.'], annotation: 'Circulation is suspended until the common-trust prerequisite is restored or binding is chosen.' },
    ],
  },
  {
    id: 'timetable', era: 1, place: 'quay', title: 'Where to meet the morning', kind: 'Notice for commuters', by: 'Aven Transit Office', date: '1 April 1932',
    variants: [
      { when: 'quay-stop', text: ['ILEX LINE. Tidemark stop: first car 06:12, last car 23:40. Level boarding from the embankment. Please leave the bench clear for passengers who cannot stand.', 'The former ferry bell is retained as the departure bell. A different vehicle may still need a familiar sound.'], annotation: 'Both the tram decision and the level embankment are necessary for this stop.' },
      { when: 'hill-stop', text: ['ILEX LINE. Upper Road stop: first car 06:14, last car 23:42. Level approach from the market. There is no tram stop on the tidal steps.', 'The steps remain open to pedestrians. Do not follow the old ferry sign if you are trying to catch the car.'], annotation: 'The tram and tidal steps coexist, but the stop is uphill.' },
      { when: 'footbridge', text: ['TIDEMARK FOOTBRIDGE. Open at all hours. Bicycles to be walked; baskets to be carried in whatever manner seems safest to the carrier.', 'There is no tram service across the Ilex in this plan. The outer-ward coach timetable is available at the salt gate.'], annotation: 'A short walking circuit is not the same thing as a citywide transit link.' },
      { text: ['TEMPORARY FERRY. The crossing plan is unresolved. Consult the landing board for each day’s service; no permanent connection is promised.', 'Do not print a bridge on the borough guide until the shore and crossing plans agree.'], annotation: 'Incompatible earlier edits produce an explicit provisional state.' },
    ],
  },
  {
    id: 'kitchen', era: 1, place: 'hall', title: 'A rest you can count in onions', kind: 'Recipe-book margin', by: 'Mara Vale, Sera’s daughter', date: '8 April 1932', visible: 'copies',
    variants: [{ text: ['The soup needs three onions, not the two Aunt Sera puts in her book. The pause needs the length of somebody taking off a wet coat. That is how she taught it to us.', 'We sang around the table after washing up. I copied the words and forgot which note came first. Sera says that is why the paper must travel with the people, not instead of them.'], annotation: 'This evidence exists only when the letter circulates through kitchens.' }],
  },
  {
    id: 'binding', era: 1, place: 'archive', title: 'Do not trim the folded edge', kind: 'Binder’s instruction', by: 'Ivo Ren', date: '8 April 1932', visible: 'sealed',
    variants: [{ text: ['Bind the letter after the score, not within it. Use the linen hinge. Do not trim the folded edge: there is writing across the crease which may belong to the sentence.', 'I asked Sera whether she wanted a copy. She said she would remember. I have recorded this answer because it seems exactly the sort of answer a catalogue should not trust.'], annotation: 'The crease and the untrimmed sentence will make exact recovery possible in 1976.' }],
  },
  {
    id: 'friends', era: 1, place: 'garden', title: 'A disagreement, carefully kept', kind: 'Postcard never posted', by: 'Sera to Ivo Ren', date: '21 July 1932',
    variants: [
      { when: 'copies', text: ['Ivo, you think a thing survives when it can be found in the same place. I think it survives when someone can carry it elsewhere. We are both frightened of losing it.', 'Come on Thursday. I will show you what a catalogue cannot hold, and you may tell me again why the dates matter. Bring your daughter. Mine has learned the difficult pause.'], annotation: 'This invitation begins the inter-family listening tradition inherited by Jo and Mina.' },
      { when: 'sealed', text: ['Ivo, thank you for leaving the crease alone. I was unkind about your catalogue. A drawer in the laundry is not automatically a kinder fate for a letter.', 'Come on Thursday. We can disagree in person. Bring your daughter. Mine is learning that preserving a thing and knowing what it means are different occupations.'], annotation: 'The families remain acquainted; this does not invent a household refrain that was never circulated.' },
      { text: ['Ivo, the packets are still in the drawer. We have permission neither to call them circulated nor to list them in your binding. It is strange how long a disagreement can remain a physical object.', 'Come on Thursday. We can decide nothing over soup as well as we can by post. Bring your daughter. I want our children to know that people can disagree and still set a table for one another.'], annotation: 'The letter is unresolved in this branch. Friendship does not substitute for a surviving source.' },
    ],
  },
  {
    id: 'room-inventory', era: 1, place: 'hall', title: 'Contents of the upper room', kind: 'Insurance inventory', by: 'Sera Vale', date: '4 November 1932',
    variants: [{ text: ['One long table, scarred at the west end. Seventeen chairs, of which eleven match nothing. A cracked mirror used for checking hems. One quince branch in a blue bottle.', 'Under “musical instruments” I have written “the room.” The assessor says this is not a category. I have not changed it. The window rattles on the first low note even when nobody is singing.'], annotation: 'The room’s physical shell remains available for either 1976 reuse.' }],
  },
  {
    id: 'reuse', era: 2, place: 'hall', title: 'One room, one grant', kind: 'Adaptive-use authorization', by: 'Mina Ren, rooms committee', date: '17 January 1976',
    variants: [
      { when: 'rehearsal', text: ['Approved: sprung floor, curtain, twenty stackable chairs. The laundry’s upper floor becomes a neighborhood rehearsal room. No raised stage: we are funding participation, not a better view of other people.', 'Archive materials remain at the municipal building. Jo asks to keep the old long table. It fits only if we remove two new chairs. Amendment approved.'], annotation: 'A living score needs this rehearsal space. It cannot also be the funded public reading room.' },
      { when: 'reading-room', text: ['Approved: reading lamps, low shelves, twenty-three chairs. The laundry’s upper floor becomes a public reading room. The archive will lend reference copies every Friday.', 'No acoustic work is included in this grant. Jo asks whether there will be singing. I answer that there may be many things, but we cannot honestly promise a rehearsed performance on this budget.'], annotation: 'This supports an annotated public reading, not the rehearsal required by live endings.' },
      { text: ['Deferred: two viable applications, one grant. The laundry has closed and the upper floor is still unlet. Its windows are sound; its next purpose is not yet settled.', 'Rehearsal room or reading room: the committee asks the retracer to enter one use. Until then, neither an ensemble nor a public edition has an institutional home.'], annotation: 'Choose a use in 1976. An empty room does not quietly count as both institutions.' },
    ],
  },
  {
    id: 'tape', era: 2, place: 'hall', title: 'Tape 3: the coat-length pause', kind: 'Oral-history transcript', by: 'Jo Vale interviewing Mara', date: '9 February 1976', visible: 'oral-work',
    variants: [{ text: ['JO: How many beats? / MARA: It depends who has come in. / JO: That will be difficult to notate. / MARA: Good.', 'JO: And the letter? / MARA: “Leave room for the one who cannot get here.” Or “a measure.” I forget the nouns. I remember that you must not hire someone to be them.', 'At 11:43, a kettle obscures three seconds. Jo does not splice them out. In the margin: the pause is a permission, not a technical failure.'], annotation: 'The intention is recovered through practice. The transcript does not pretend to be the exact original wording.' }],
  },
  {
    id: 'crease', era: 2, place: 'archive', title: 'The sentence across the crease', kind: 'Collation sheet', by: 'Mina Ren', date: '9 February 1976', visible: 'collation',
    variants: [{ text: ['Leaf 12 verso, letter, full reading: “Leave one measure for the person who cannot arrive. Do not appoint someone to stand in their place.”', 'The fold crosses “cannot,” not “can.” Earlier catalogue summaries misread this as an invitation for a late arrival. It is also a place for someone whose absence cannot be repaired.', 'There is no tempo marking. Exact words do not give us the old rhythm. We can publish the letter; we cannot certify a reconstruction of the performance.'], annotation: 'The full text is recoverable because the bound original retained its crease.' }],
  },
  {
    id: 'method', era: 2, place: 'archive', title: 'What we may claim', kind: 'Research notebook', by: 'Mina Ren', date: '18 February 1976',
    variants: [
      { when: 'oral-work', text: ['Jo’s tape is not the letter. It is evidence of what people did with the letter. The distinction belongs on every programme we print.', 'We know now why the last measure was left open. We know the inherited way of waiting. We do not have every word Ada wrote. A good record can admit all three sentences at once.'], annotation: 'Recovered intention and recovered original text are separate facts in the causal ledger.' },
      { when: 'collation', text: ['The letter is complete. The old performance is not. I refuse the committee’s proposed phrase “heard again exactly as in 1891.”', 'We can read the words in public and discuss the blank. That is not a lesser outcome. It is simply an outcome with a margin where the unavailable evidence should be.'], annotation: 'An exact reading is possible; an inherited live score is not silently inferred.' },
      { text: ['We have not yet chosen a recovery method. The committee’s report must retain the phrase “meaning unresolved.”', 'If the letter was bound, collate it. If it travelled through kitchens, ask the people who carried it. Do not demand a shelf number from a song or a living memory from a closed binding.'], annotation: 'The two recovery methods each require their own surviving source.' },
    ],
  },
  {
    id: 'jo-mina', era: 2, place: 'garden', title: 'Two names on the door', kind: 'Note in Jo’s handwriting', by: 'Jo Vale to Mina Ren', date: '3 March 1976',
    variants: [
      { when: 'working-friendship', text: ['I have put both our names on the rehearsal notice. Yours for making a room available, mine for knowing who might come. Neither is a complete invitation on its own.', 'Your father and my grandmother took forty years to agree that they were keeping different parts of the same thing. We could try to be quicker. Thursday, six o’clock. Bring a pencil; I will bring a kettle.'], annotation: 'Their working partnership requires both the listening project and a rehearsal room.' },
      { when: 'annotated-edition', text: ['Your edition is careful. Thank you for not putting my grandmother’s voice in quotation marks when you did not record it.', 'I cannot give you the inherited rhythm in this branch of our lives. I can help find chairs. Put my name on the volunteer list, not the list of historical witnesses.'], annotation: 'Friendship persists without manufacturing evidence Jo does not possess.' },
      { when: 'collation', text: ['Your transcription is careful. Thank you for leaving my grandmother’s voice outside the quotation marks: you recovered a letter, not a recording.', 'I can find chairs when there is a room for readers. Until then, keep my name beside the transcription, not among the historical witnesses. Recovering the words does not mean we have recovered the performance, or given its public edition a home.'], annotation: 'Recovered words do not count as a public edition without its reading-room grant.' },
      { text: ['We keep discussing the missing measure without agreeing on what evidence to bring. It is an excellent subject for an afternoon, less useful as a substitute for actually beginning.', 'I have a kettle. You have a key to the committee cupboard. One day we ought to arrange for these resources to meet.'], annotation: 'A possible collaboration is not yet the working partnership needed by a live score.' },
    ],
  },
  {
    id: 'route-rehearsal', era: 2, place: 'bridge', title: 'Route notes in green pencil', kind: 'Rehearsal route study', by: 'Jo Vale', date: '20 April 1976',
    variants: [
      { when: 'old-circuit', text: ['From the laundry door to the quay: two minutes, longer if anyone stops to look into the bakery. Over the footbridge to the quince tree: three minutes.', 'The route still exists. This tells us where people could walk, not whether they remember what to sing. Put the geography in one column and the evidence in another.'], annotation: 'The original circuit is necessary, but not sufficient, for the return ending.' },
      { when: 'tram', text: ['The old circuit breaks at the viaduct. Do not ask a line of singers to act as though the crossing is a footbridge.', 'The tram could carry the refrain. Doors opening and closing might make a new kind of pause. Call it a procession, not a restoration, and ask the outer wards what they want to add.'], annotation: 'The new route unlocks a different honest ending rather than a counterfeit restoration.' },
      { text: ['The permanent crossing remains unresolved. Leave this route blank until the shore and transit plans agree.', 'A route study is not permission to send people to an unbuilt bridge. The performance must wait for its city.'], annotation: 'Suspended prerequisites remain visible in the artifacts.' },
    ],
  },
  {
    id: 'edition', era: 2, place: 'hall', title: 'A page with a usable margin', kind: 'Prospectus for a public edition', by: 'Mina Ren', date: '1 September 1976', visible: 'annotated-edition',
    variants: [{ text: ['THE COMMON MEASURE, with the unposted letter. Twenty-four pages. Large type. A wide outside margin for readers to record whom the civic invitation forgot.', 'Available at the new reading room without identification. A copy may be consulted even by someone who cannot stay for the discussion. The final measure is printed blank; it is not offered as a puzzle with a concealed musical answer.'], annotation: 'Collation and the reading-room grant jointly make this edition possible.' }],
  },
  {
    id: 'commission', era: 3, place: 'archive', title: 'A city that remembers differently', kind: 'Letter of appointment', by: 'Nell Ren, city retracer', date: '6 September 2026',
    variants: [{ text: ['Aven’s centennial performance was announced in 1991. It never took place. The municipal file calls the cause “one missing measure.” There is a letter inside that absence.', 'You may amend eight civic decisions, not people’s feelings or the contents of their evidence. Trace what survived, give it a place, and make an invitation that its history can honestly support.', 'Pin this future before touching the past. It will stay on the facing page while the living city changes. Recover the meaning of the blank, then complete a return, a procession, or a public reading. None restores everything.'], annotation: 'Aven, its people, and every document here are original fiction. The consequences within this folio are rule-driven.' }],
  },
  {
    id: 'future-quay', era: 3, place: 'quay', title: 'The address on the invitation', kind: 'Nell’s present-day field note', by: 'Nell Ren', date: '7 September 2026',
    variants: [
      { when: 'quay-stop', text: ['The tram doors open where the seventh step used to be. There is a level shelter, a timetable, and a woman bringing a quince sapling home to the outer wards.', 'The invitation cannot truthfully say “meet on the old steps.” It could say “bring the refrain aboard.” A place has been lost here, and a journey made possible. Both belong in the record.'], annotation: 'This future changes when either the 1891 shore or 1932 crossing changes.' },
      { when: 'hill-stop', text: ['The tidal steps remain, but the tram stops on the upper road. From here I can see the shelter roof above the laundry.', 'We can gather at the water or board in town. We cannot call the viaduct Ada’s footbridge. Keeping one old place has not kept the whole old circuit.'], annotation: 'A mixed branch: old steps, new transit, no original walking circuit.' },
      { when: 'old-circuit', text: ['Seven steps, their centers worn shallow. The footbridge touches the landing as the old survey promised. Across the river, the sour tree has become three trees and an argument about which is the original.', 'The walking circuit is intact. If the households still know the pause and have rehearsed it, the invitation can name this place without quotation marks.'], annotation: 'The physical return is possible; the musical and social prerequisites still matter.' },
      { when: 'steps', text: ['The seven steps survive but the permanent crossing is unbuilt in this branch. The opposite bank looks close enough to tempt a careless caption.', 'I write “landing,” not “circuit.” A city can preserve the beginning of a path and still have no way to finish it.'], annotation: 'Repair the suspended crossing before claiming the original route.' },
      { text: ['The embankment is level. Beyond it, the crossing plan points to a landing that no longer exists. The temporary ferry sign has become a rather permanent object.', 'There is no bridge and no tram in the enacted record. The future is waiting for two earlier decisions to agree with each other.'], annotation: 'A suspended bridge is not rendered as a working structure.' },
    ],
  },
  {
    id: 'eli', era: 3, place: 'bridge', title: 'A conductor, in one sense or another', kind: 'Voice message transcribed', by: 'Eli Vale to Nell Ren', date: '8 September 2026',
    variants: [
      { when: 'tram', text: ['I can reserve the back half of the 18:10. No private car; this is a public line. Whoever boards will hear what we are doing, and may very reasonably prefer to keep reading.', 'My job is to make a safe journey, not conduct a choir. But I do know exactly how long a door remains open. Tell me whether you have a living score, or only a story about one.'], annotation: 'Eli works on the tram when the transit decision creates that institution.' },
      { text: ['I can carry the chairs from the upper room, or help people find the landing. In this city I repair bicycles; the job on the tram belonged to a future we did not build.', 'People keep asking whether I can conduct. I can keep a group together on a road. If that is what the performance needs, ask me. If you need a recovered rhythm, ask the evidence.'], annotation: 'Eli’s occupation changes with the crossing, not arbitrarily with the selected document.' },
    ],
  },
  {
    id: 'invitation', era: 3, place: 'garden', title: 'To whoever finishes this', kind: 'Invitation proof', by: 'Nell Ren', date: '10 September 2026',
    variants: [
      { when: 'neighbors', text: ['To the households who carried the Common Measure: please bring the version you inherited, and a name you do not want us to speak on someone else’s behalf.', 'This is an invitation to carry the work, not an order to represent your ancestors. You may decline. Anyone may watch or join at your invitation; the inherited part is yours to offer.'], annotation: 'This invitation supports a living return or procession, not the documentary-reading ending.' },
      { when: 'public', text: ['An open reading of the Common Measure and its unposted letter. No prior knowledge, family connection, or answer is required.', 'We will distinguish what the evidence says from what it leaves unavailable. There will be a blank in the reading and a margin for questions. You do not have to explain why you came.'], annotation: 'This invitation supports the public reading when an annotated edition exists.' },
      { text: ['TO: [not yet addressed]. WHERE: [dependent on the city]. BRING: [dependent on what survived].', 'Nell has ruled through “Grand Restoration.” Beneath it: “Do not promise people an original we cannot produce. Decide whether we are asking inheritors to carry a living work or readers to examine surviving words.”'], annotation: 'Address the invitation in 2026; no audience is silently assumed.' },
    ],
  },
  {
    id: 'missing', era: 3, place: 'archive', title: 'The measure was never missing', kind: 'Revised catalogue entry', by: 'Nell Ren', date: '11 September 2026',
    variants: [
      { when: 'oral-work', text: ['Correction to Aven centennial file: the final blank is intentional. The household practice preserves a pause long enough to admit a person without requiring them to take part.', 'The exact letter has not survived its circulation. Jo’s recording carries its intention, not a verbatim quotation. To complete a living version, the city must supply a rehearsal room, a route, and the inheriting households.'], annotation: 'Meaning recovered through oral work. A final event still requires its own institutional and social conditions.' },
      { when: 'collation', text: ['Correction to Aven centennial file: the final blank is intentional. The bound letter requests a measure for “the person who cannot arrive,” and forbids appointing a substitute.', 'The old household rhythm was not preserved by this archive. An annotated public reading can honor the words precisely by not claiming to sing them as they once were sung.'], annotation: 'Meaning recovered through collation. The reading needs an edition, a room, and a public invitation.' },
      { text: ['The file still reads “one missing measure.” Neither the inherited pause nor the folded letter has been examined in 1976.', 'There is no hidden password to type here. A source must survive the 1932 decision, and a compatible recovery method must take it seriously. Change the institutions, then read what they are able to remember.'], annotation: 'Recover Ada’s intention in 1976 before attempting a final event.' },
    ],
  },
  {
    id: 'room-today', era: 3, place: 'hall', title: 'Light in the upper windows', kind: 'Evening field note', by: 'Nell Ren', date: '12 September 2026',
    variants: [
      { when: 'living-score', text: ['Someone has left Jo and Mina’s names together on the rehearsal cupboard. Inside: green pencils, a kettle, the kitchen recording, and a score with room for hesitation.', 'The window still rattles on the first low note. The room has not preserved every word Ada wrote. It has preserved a way for people to notice one another while making something.'], annotation: 'Listening plus a rehearsal room yields a living score and a working partnership.' },
      { when: 'annotated-edition', text: ['Twenty-three chairs, exactly as in the grant. Mina’s edition stands on a low shelf. A reader has used the wide margin to ask whether an invitation can be inherited against one’s will.', 'The kettle is new. The long table is not. The city has a place to read the complete letter without pretending the absent rhythm can be called back by better shelving.'], annotation: 'Collation plus a reading room yields an annotated edition.' },
      { when: 'rehearsal', text: ['The floor is ready for rehearsal. The chairs face one another rather than a stage. There is no recovered living score in the cupboard yet.', 'An institution may be generous and still lack the evidence for a particular promise. Find the household source and the listening work if this room is to carry the Common Measure.'], annotation: 'The room alone cannot make a living score.' },
      { when: 'reading-room', text: ['The reading lamps are on, but Mina’s edition is not on the shelf. There are other good books; the room is not a failure because this one is unavailable.', 'For this civic reading, though, someone must collate the bound original. Do not substitute the kitchen transcript and call it the letter.'], annotation: 'The reading room alone cannot make an exact edition.' },
      { text: ['No light in the upper windows. The laundry sign has outlasted the laundry by fifty years. A pigeon has discovered the ledge but not a way in.', 'The 1976 grant is still unassigned in this timeline. The city has inherited a sound room and no decision about whom to let inside.'], annotation: 'Give the floor an institutional use in 1976.' },
    ],
  },
  {
    id: 'afterword', era: 3, place: 'garden', title: 'What a city cannot keep at once', kind: 'Retracer’s marginal note', by: 'Nell Ren', date: '13 September 2026',
    variants: [{ text: ['You cannot spend the same grant on two rooms. You cannot claim both a protected original and the unbroken practice of its dispersed copies. You cannot put the new tram on the old footbridge and call the route unchanged.', 'You can compare the cities these choices make. Keep one on the facing page. Let another become real. A different ending is not a correction of the people who lived the first one; it is a different account of what you asked them to carry.'], annotation: 'Continue editing after any ending. A pinned branch and the undo history preserve alternatives without declaring a best one.' }],
  },
];

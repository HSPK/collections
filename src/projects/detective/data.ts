export interface FactColumn {
  key: string;
  label: string;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  statement: string;
  facts: Record<string, string>;
  avatar: number;
}

export type Rule =
  | { kind: 'fact'; field: string; allowed: readonly string[] }
  | { kind: 'before'; first: string; second: string }
  | { kind: 'immediately-before'; first: string; second: string };

export interface Evidence {
  id: string;
  letter: string;
  title: string;
  kind: 'log' | 'trace' | 'route' | 'note';
  teaser: string;
  paragraphs: readonly string[];
  deduction: string;
  rules: readonly Rule[];
}

export interface CaseFile {
  id: string;
  number: string;
  title: string;
  location: string;
  difficulty: string;
  illustration: 'cake' | 'parcel' | 'label';
  summary: string;
  briefing: readonly string[];
  question: string;
  groundRules: string;
  columns: readonly FactColumn[];
  people: readonly Person[];
  evidence: readonly Evidence[];
  timeline: readonly { time: string; event: string }[];
  logic:
    | { kind: 'profiles' }
    | { kind: 'order'; slots: readonly string[]; affectedSlot: number };
  nudge: string;
  solution: {
    personId: string;
    headline: string;
    explanation: readonly string[];
    recovery: string;
  };
}

export const CASES: readonly CaseFile[] = [
  {
    id: 'cake-under-cover',
    number: '01',
    title: 'The cake under cover',
    location: 'Bramble Hall / the spring lunch',
    difficulty: 'Start here · compare the records',
    illustration: 'cake',
    summary: 'One magnificent cake. An empty cooling rack. Four very busy helpers.',
    briefing: [
      'The spring lunch is nearly ready, but the lemon-and-poppy cake has vanished from the pantry. There is no broken glass, no crumb trail, and certainly no reason to panic before the kettle boils.',
      'One of four helpers moved the whole cake during a single pantry visit. The porter recorded each visit, the way the helper carried things, and the passage they used to leave. Find the person to ask before anyone starts baking another.',
    ],
    question: 'Who moved the cake?',
    groundRules: 'The porter saw every visit, and the records below are accurate. Each helper made exactly one trip. One person moved the cake, without an accomplice. The cake left by either the east or west passage.',
    columns: [
      { key: 'visit', label: 'Pantry visit' },
      { key: 'transport', label: 'Carried things on' },
      { key: 'exit', label: 'Left through' },
    ],
    people: [
      {
        id: 'leda',
        name: 'Leda Fern',
        role: 'Greenhouse keeper',
        avatar: 0,
        statement: 'I took the handcart back through the west passage. Its left wheel squeaks on the turn by the fern room. I must oil that thing.',
        facts: { visit: '10:10', transport: 'Handcart', exit: 'West passage' },
      },
      {
        id: 'orin',
        name: 'Orin Pipp',
        role: 'Tea-table host',
        avatar: 1,
        statement: 'The porter waved me through at 10:09. I use a tray with two handles. West is the shortest way back to my table.',
        facts: { visit: '10:09', transport: 'Handheld tray', exit: 'West passage' },
      },
      {
        id: 'tavi',
        name: 'Tavi Loom',
        role: 'Tablecloth arranger',
        avatar: 2,
        statement: 'I had the handcart before ten. I remember the pantry clock: five minutes to go. Then straight out west with the tablecloths.',
        facts: { visit: '09:55', transport: 'Handcart', exit: 'West passage' },
      },
      {
        id: 'neri',
        name: 'Neri Wick',
        role: 'Paper-flower maker',
        avatar: 3,
        statement: 'My cart and I left by the east passage at 10:11. The vines in the west passage are not kind to paper flowers.',
        facts: { visit: '10:11', transport: 'Handcart', exit: 'East passage' },
      },
    ],
    evidence: [
      {
        id: 'shelf-log',
        letter: 'A',
        title: 'The cooling-rack log',
        kind: 'log',
        teaser: 'Two pencil entries narrow the window.',
        paragraphs: [
          '10:08 — Baker checks the cake on its rack. Icing firm, lemon decoration in place.',
          '10:12 — Baker returns with the serving knife. The rack is empty.',
          'The porter confirms the cake did not return to the pantry after it left. All four recorded visit times use the same pantry clock.',
        ],
        deduction: 'The cake moved after 10:08 and before 10:12, so the 09:55 visit is too early.',
        rules: [{ kind: 'fact', field: 'visit', allowed: ['10:09', '10:10', '10:11'] }],
      },
      {
        id: 'flour-tracks',
        letter: 'B',
        title: 'A small flour accident',
        kind: 'trace',
        teaser: 'The rack remembers what the floor saw.',
        paragraphs: [
          'At 10:08, a little flour spilled under the cake rack. The baker swept the surrounding floor, leaving only this fresh patch.',
          'At 10:12, two wheel tracks cross that patch. The wheels stopped against the rack; there are no shoe prints beside it.',
          'The porter confirms that only the cake-mover approached the rack in that interval. Of the recorded carrying methods, only a handcart has wheels.',
        ],
        deduction: 'The cake left on a handcart, not a handheld tray.',
        rules: [{ kind: 'fact', field: 'transport', allowed: ['Handcart'] }],
      },
      {
        id: 'door-ribbon',
        letter: 'C',
        title: 'The ribbon in the door',
        kind: 'route',
        teaser: 'A fleeting glimpse, but a definite direction.',
        paragraphs: [
          'The baker tied a long ribbon to the cake board before leaving it to cool. No other item in the pantry had one.',
          'At about 10:10, the porter saw that very ribbon trail out through the west doorway. A stack of linen hid the person above it.',
          'The porter watched it continue west. The cake did not turn back or pass through the east doorway.',
        ],
        deduction: 'The cake-mover used the west passage.',
        rules: [{ kind: 'fact', field: 'exit', allowed: ['West passage'] }],
      },
      {
        id: 'warm-sunshine',
        letter: 'D',
        title: 'A note beneath the kettle',
        kind: 'note',
        teaser: 'Perhaps this was a kindness, not a theft.',
        paragraphs: [
          'The lunch organizer left a note: "The pantry gets hot at ten. If the icing softens, find it somewhere cool. I will fetch the cake at eleven."',
          'Several helpers saw the note. It explains why somebody might move the cake, but does not tell you who did.',
        ],
        deduction: 'This explains a possible motive. It does not rule out any helper.',
        rules: [],
      },
    ],
    timeline: [
      { time: '09:55', event: 'The earliest recorded helper visits the pantry.' },
      { time: '10:08', event: 'The cake is on the rack; fresh flour is left beneath it.' },
      { time: '10:09–11', event: 'Three more helpers make their recorded visits.' },
      { time: '10:12', event: 'The baker finds the rack empty.' },
    ],
    logic: { kind: 'profiles' },
    nudge: 'Start with the time window. Then compare the carrying method and exit. A good conclusion must fit all three, not just one.',
    solution: {
      personId: 'leda',
      headline: 'A rescue mission, with extra icing.',
      explanation: [
        'Leda Fern is the only helper whose visit fits the time window, whose transport has wheels, and whose exit is west.',
        'Tavi left too early. Orin used a handheld tray. Neri went east. The note about the warm pantry supplies a motive, but it is the three physical records that identify Leda.',
      ],
      recovery: 'Leda put the covered cake on a marble bench in the cool fern room. The lunch is saved; the handcart still needs oil.',
    },
  },
  {
    id: 'parcel-out-of-place',
    number: '02',
    title: 'A parcel out of place',
    location: 'Button Street / the makers’ exchange',
    difficulty: 'Look closely · combine three traces',
    illustration: 'parcel',
    summary: 'A seed tin slipped into somebody’s parcel. The packing photo holds the answer.',
    briefing: [
      'At the neighborhood makers’ exchange, a little sun-stamped seed tin has disappeared from the shared table. A photograph taken during packing clearly shows it inside one of four open parcels.',
      'A vase hides the packer’s face, but three details of that same parcel are visible. The parcels are now sealed and waiting for collection. Work out whose parcel to open, rather than unwrapping everyone’s afternoon.',
    ],
    question: 'Whose parcel contains the seed tin?',
    groundRules: 'Each person packed exactly one parcel using the materials on their docket. The dockets are accurate. All three photograph details belong to the same box containing the seed tin. Nothing was repacked after the photograph.',
    columns: [
      { key: 'paper', label: 'Wrapping paper' },
      { key: 'tie', label: 'Fastening' },
      { key: 'tag', label: 'Address label' },
    ],
    people: [
      {
        id: 'clem',
        name: 'Clem Rill',
        role: 'Ceramic-button maker',
        avatar: 2,
        statement: 'Plain kraft paper, cotton cord, and a round label. The buttons make enough patterns on their own, I think.',
        facts: { paper: 'Plain kraft', tie: 'Cotton cord', tag: 'Round' },
      },
      {
        id: 'sula',
        name: 'Sula Reed',
        role: 'Paper-lantern folder',
        avatar: 0,
        statement: 'I used the striped paper left from our last workshop, with cotton cord. My labels are round; the corner punch is broken.',
        facts: { paper: 'Striped', tie: 'Cotton cord', tag: 'Round' },
      },
      {
        id: 'fenn',
        name: 'Fenn Alder',
        role: 'Ribbon weaver',
        avatar: 3,
        statement: 'Striped paper goes nicely with a wide, flat ribbon. I chose a round label to balance all those straight lines.',
        facts: { paper: 'Striped', tie: 'Flat ribbon', tag: 'Round' },
      },
      {
        id: 'bram',
        name: 'Bram Petal',
        role: 'Pocket-map printer',
        avatar: 1,
        statement: 'Stripes, cord, square label. I like a proper corner. You can always tell which way up a square is. Well, almost.',
        facts: { paper: 'Striped', tie: 'Cotton cord', tag: 'Square' },
      },
    ],
    evidence: [
      {
        id: 'paper-detail',
        letter: 'A',
        title: 'The turned-back flap',
        kind: 'trace',
        teaser: 'The outside of the paper peeks into view.',
        paragraphs: [
          'In the photograph, the seed tin’s sun stamp is visible inside the open box. The wrapping paper folds back over that box’s edge.',
          'The outside of this flap has alternating straight dark and pale bands. These are printed stripes, not shadows; the same bands repeat on the parcel’s side.',
          'The exchange stocked only the two paper types recorded on the dockets: striped paper and plain kraft.',
        ],
        deduction: 'The parcel uses striped wrapping paper, not plain kraft.',
        rules: [{ kind: 'fact', field: 'paper', allowed: ['Striped'] }],
      },
      {
        id: 'cord-detail',
        letter: 'B',
        title: 'The loose end',
        kind: 'log',
        teaser: 'Round and twisted, rather than flat.',
        paragraphs: [
          'A loose fastening lies across the same parcel’s open flap. Its cut end shows three small twisted strands.',
          'The materials sheet identifies the cotton cord as round and three-stranded. The ribbon is broad, flat, and unstranded.',
          'Every packer used the fastening on their docket, and no parcel has both.',
        ],
        deduction: 'The fastening is cotton cord. A flat ribbon cannot make the visible three-stranded end.',
        rules: [{ kind: 'fact', field: 'tie', allowed: ['Cotton cord'] }],
      },
      {
        id: 'label-detail',
        letter: 'C',
        title: 'An edge without a corner',
        kind: 'route',
        teaser: 'Most of the address is hidden. The shape is not.',
        paragraphs: [
          'The vase obscures the writing on the label attached to that parcel. A clear arc of its paper edge remains visible above the vase.',
          'The full exposed edge is a smooth curve. The labels were either round circles or straight-edged squares, with no rounded corners.',
          'This is the address label, not the sun stamp on the seed tin.',
        ],
        deduction: 'The address label is round, not square.',
        rules: [{ kind: 'fact', field: 'tag', allowed: ['Round'] }],
      },
      {
        id: 'collection-ledger',
        letter: 'D',
        title: 'No bicycle has left',
        kind: 'note',
        teaser: 'There is still time to put this right.',
        paragraphs: [
          'The collection ledger has four unchecked boxes. All four parcels are still on the green hold shelf by the door.',
          'The seed keeper writes: "The tin looks just like the communal string tin. An easy mix-up. Please ask the packer before opening anything."',
        ],
        deduction: 'This tells you the parcel is still here and suggests an innocent mix-up. It does not identify its packer.',
        rules: [],
      },
    ],
    timeline: [
      { time: '12:50', event: 'Four packers choose the materials listed on their dockets.' },
      { time: '13:04', event: 'The photograph captures the seed tin inside one open parcel.' },
      { time: '13:10', event: 'All parcels are sealed, unchanged, on the hold shelf.' },
      { time: '13:20', event: 'The bicycle collection is due. There is time for a careful look.' },
    ],
    logic: { kind: 'profiles' },
    nudge: 'A striped box alone is not enough. The three photo details must describe the same parcel. Treat the collection ledger as context, not identification.',
    solution: {
      personId: 'sula',
      headline: 'Special delivery: a small misunderstanding.',
      explanation: [
        'Sula Reed’s parcel is the only one with striped paper, cotton cord, and a round address label.',
        'Clem used plain paper. Fenn used a flat ribbon. Bram used a square label. Every other parcel contradicts a different detail of the photograph.',
      ],
      recovery: 'Sula opens the parcel on the hold shelf. The seed tin was mistaken for the communal string tin and packed beside the lanterns. Seeds go to the garden; lanterns go to their new home.',
    },
  },
  {
    id: 'wandering-label',
    number: '03',
    title: 'The wandering museum label',
    location: 'The Museum of Useful Little Things',
    difficulty: 'Arrange the visits · follow the sequence',
    illustration: 'label',
    summary: 'A loose label hitched a ride on a folio. Put four visitors in order to find it.',
    briefing: [
      'The museum’s folding-umbrella display has lost its label. A doorway photograph taken at 14:20 shows it caught on the back of a visitor’s folio. Only hands are in the frame.',
      'Four volunteers entered the gallery, one each at 14:00, 14:10, 14:20, and 14:30. Their name stamps smudged, but three reliable notes preserve the order of their visits. Rebuild that order to find the folio to check.',
    ],
    question: 'Who carried the label out at 14:20?',
    groundRules: 'Each volunteer visited once, at a different listed time. Nobody else entered or handled the display. The photograph identifies the 14:20 visitor as the accidental carrier. All three ordering notes are accurate. "Immediately before" means consecutive visits.',
    columns: [
      { key: 'task', label: 'Museum duty' },
      { key: 'folio', label: 'Carried' },
    ],
    people: [
      {
        id: 'miri',
        name: 'Miri Finch',
        role: 'School-tour guide',
        avatar: 1,
        statement: 'I needed a quiet look before the school tour. We all use the same green folios, so the photograph will not tell you much about whose hands those are.',
        facts: { task: 'Tour notes', folio: 'Green folio' },
      },
      {
        id: 'rook',
        name: 'Rook Vale',
        role: 'Display volunteer',
        avatar: 3,
        statement: 'I went in to measure the plinth. There is a note about who handed the gallery pass directly to me. That might be useful.',
        facts: { task: 'Plinth measurements', folio: 'Green folio' },
      },
      {
        id: 'theo',
        name: 'Theo Fen',
        role: 'Conservation assistant',
        avatar: 2,
        statement: 'I checked the paper humidity strip. Please do not guess from our jobs; any of those folios could have brushed a loose label.',
        facts: { task: 'Humidity reading', folio: 'Green folio' },
      },
      {
        id: 'ada',
        name: 'Ada Pollen',
        role: 'Collection cataloguer',
        avatar: 0,
        statement: 'I was updating the umbrella entry. My folio spent most of the visit on the display ledge, just like everyone else’s.',
        facts: { task: 'Catalogue updates', folio: 'Green folio' },
      },
    ],
    evidence: [
      {
        id: 'drying-note',
        letter: 'A',
        title: 'A note at the drying rack',
        kind: 'note',
        teaser: 'One visit must happen before the guide arrives.',
        paragraphs: [
          'The conservation desk’s signed note reads: "Theo’s gallery humidity reading was complete before Miri made her gallery visit."',
          'The note establishes an order, not a precise time. Other visits could have happened between them.',
        ],
        deduction: 'Theo visited before Miri, but this note alone does not say they were consecutive.',
        rules: [{ kind: 'before', first: 'theo', second: 'miri' }],
      },
      {
        id: 'tour-note',
        letter: 'B',
        title: 'The tour-book margin',
        kind: 'log',
        teaser: 'A pencilled greeting preserves another link.',
        paragraphs: [
          'A signed margin note records: "Miri had already finished her gallery visit when Ada went in to update the catalogue."',
          'Again, this means earlier, not necessarily immediately earlier.',
        ],
        deduction: 'Miri visited before Ada.',
        rules: [{ kind: 'before', first: 'miri', second: 'ada' }],
      },
      {
        id: 'gallery-pass',
        letter: 'C',
        title: 'The hand-to-hand pass',
        kind: 'route',
        teaser: 'Two visits belong directly beside one another.',
        paragraphs: [
          'The pass log reads: "Ada handed the gallery pass straight to Rook, who made the next visit. No one entered between them."',
          'There was only one gallery pass. The two visits must be consecutive, with Ada first.',
        ],
        deduction: 'Ada visited immediately before Rook.',
        rules: [{ kind: 'immediately-before', first: 'ada', second: 'rook' }],
      },
      {
        id: 'old-adhesive',
        letter: 'D',
        title: 'A slightly sticky corner',
        kind: 'trace',
        teaser: 'The label was quite capable of hitching a ride.',
        paragraphs: [
          'The display keeper finds an old square of removable adhesive curling away from the label holder.',
          'The photograph shows that corner stuck to the back of a green folio. Every volunteer carried one. The adhesive explains the accident, not the identity of the carrier.',
        ],
        deduction: 'Any of the four folios could have picked up the label. Use the order of visits to identify which one did.',
        rules: [],
      },
    ],
    timeline: [
      { time: '13:55', event: 'The umbrella label is checked in its holder.' },
      { time: '14:00–30', event: 'One volunteer visits every ten minutes; each visits just once.' },
      { time: '14:20', event: 'A doorway photograph shows the label on this visitor’s folio.' },
      { time: '14:40', event: 'The keeper gathers the three reliable ordering notes.' },
    ],
    logic: { kind: 'order', slots: ['14:00', '14:10', '14:20', '14:30'], affectedSlot: 2 },
    nudge: 'Treat each ordering note as a link. First place the two consecutive visits together, then fit the earlier visitors around them. The photographed visit is the third slot.',
    solution: {
      personId: 'ada',
      headline: 'A label with a very short holiday.',
      explanation: [
        'The notes force one order: Theo, then Miri, then Ada, then Rook. Theo must precede Miri, Miri must precede Ada, and Rook follows Ada immediately.',
        'The four visits were at 14:00, 14:10, 14:20, and 14:30. Ada is therefore the 14:20 visitor in the photograph. The folio colors and museum duties do not identify anyone.',
      ],
      recovery: 'Ada turns over the green folio. There it is: "A folding umbrella, made for unpredictable afternoons." A fresh label holder ends its travels.',
    },
  },
];

import type { DiagramId } from './diagrams';

export type RoomId = 'distance' | 'time' | 'unsaid' | 'domestic';

export interface MuseumRoom {
  id: RoomId;
  number: string;
  name: string;
  shortName: string;
  introduction: string;
}

export interface Exhibit {
  id: DiagramId;
  accession: string;
  title: string;
  room: RoomId;
  maker: string;
  imaginedDate: string;
  classification: string;
  dimensions: string;
  summary: string;
  caption: string;
  story: readonly string[];
  provenance: string;
  materials: readonly { name: string; note: string }[];
  care: string;
  question: string;
}

export const fictionNotice = 'This museum is a work of fiction. Every object, maker, date, acquisition, and provenance described here is invented. The diagrams are speculative drawings, not working plans or historical records.';

export const rooms: readonly MuseumRoom[] = [
  {
    id: 'distance',
    number: '01',
    name: 'Distance & direction',
    shortName: 'Distance',
    introduction: 'For going elsewhere, staying here, and discovering that these are not always opposites.',
  },
  {
    id: 'time',
    number: '02',
    name: 'Time & its keeping',
    shortName: 'Time',
    introduction: 'Small vessels for the part of a day that a clock cannot describe.',
  },
  {
    id: 'unsaid',
    number: '03',
    name: 'Things left unsaid',
    shortName: 'The unsaid',
    introduction: 'Instruments that make room for a sentence without insisting that it be spoken.',
  },
  {
    id: 'domestic',
    number: '04',
    name: 'Domestic impossibilities',
    shortName: 'At home',
    introduction: 'Modest repairs to the arrangement between a person and an ordinary room.',
  },
];

export const exhibits: readonly Exhibit[] = [
  {
    id: 'portable-horizon',
    accession: 'U.01.001',
    title: 'Portable Horizon',
    room: 'distance',
    maker: 'Mara Venn, maker of map cases',
    imaginedDate: '1932',
    classification: 'Instrument for staying',
    dimensions: '46 x 28 x 9 cm, closed (proposed)',
    summary: 'A traveling case for people who are not going anywhere. Open the lid and a distant line settles at eye level. It does not show another place; it gives this place a little more room.',
    caption: 'The brass line stays level even when the case is carried upstairs.',
    story: [
      "In our imagined account, Mara Venn repaired map cases in a town that visitors mostly passed through. She noticed that every map made departure look like a simple matter of folding. For customers who could not leave, she began making a case with no map inside. It contained only the line at which land appears to end.",
      "Unlatched on a kitchen table, the Portable Horizon offers a distance that belongs to no country. Its small sun is not a lamp. Turning the winding key changes how far away the line feels, not where it goes. The instruction sewn into the lining reads: find a comfortable distance; there is no advantage in the farthest setting.",
      "The first recipient, a fictional upstairs tailor called Iven, kept the case beside a window facing a brick wall. He never mistook it for a view. He said it changed the size of the pause between one task and the next. We display it open because its most interesting part is neither the case nor the horizon, but the unoccupied interval a person might make between them.",
    ],
    provenance: 'IMAGINED: Made in Venn\'s fictional workshop in 1932. Given to the invented tailor Iven Pell in exchange for a coat lining. In this story, the museum receives it with a blank luggage label; no journey is claimed.',
    materials: [
      { name: 'Walnut and linen', note: 'An ordinary case and a replaceable lining: the familiar part of an unfamiliar instrument.' },
      { name: 'Drawn brass', note: 'Proposed for the hairline horizon, which would remain level without a mechanism.' },
      { name: 'Unassigned distance', note: 'The impossible material. It has no landscape, owner, or measurable depth.' },
    ],
    care: 'Keep the hinge free of dust. Do not polish the line until it resembles a destination.',
    question: 'What would make the place you are in feel larger?',
  },
  {
    id: 'tuesday-preserver',
    accession: 'U.02.001',
    title: 'Tuesday Preserver',
    room: 'time',
    maker: 'Orris Bell, household instrument maker',
    imaginedDate: '1916',
    classification: 'Vessel for an ordinary day',
    dimensions: '24 cm high; 14 cm across (proposed)',
    summary: 'A jar that keeps the texture of an uneventful Tuesday: a spoon against a cup, a patch of afternoon light, nothing due quite yet. It preserves neither events nor youth. Its contents are an ordinary day, still ordinary.',
    caption: 'The empty space above the folded day is essential to the seal.',
    story: [
      "The invented Orris Bell distrusted the way memory kept birthdays but discarded the afternoons around them. His Tuesday Preserver was an attempt to keep something too uneventful for a diary. A person placed the open jar in a room and went about their day. The jar was sealed only when everyone had forgotten it was there.",
      "Inside, the day folded itself like newly washed linen. It retained the sound of a spoon touching a cup, the cool side of a table, and the peculiar permission of having nothing urgent to do. It did not retain conversations. Bell considered words poor preserving agents: they tended to turn an ordinary afternoon into a story about someone.",
      "Opening the clasp would not take the owner back. Instead, the present acquired the stored day's unhurried texture until the jar was empty. One fictional owner complained that she had saved a Wednesday by mistake. Bell replied that the instrument had no means of telling. The museum has kept this supposed defect in the label. The weekday matters less than the decision that an unremarkable day is worth keeping.",
    ],
    provenance: 'IMAGINED: A fictional 1916 kitchen trial by Orris Bell, followed by an invented exchange with his neighbor Nella. The supposed jar label names no holiday or notable event. There is no real archival source.',
    materials: [
      { name: 'Glass and porcelain', note: 'A clear jar and a heavy lid, borrowed from the practical language of preserving fruit.' },
      { name: 'Brass clasp', note: 'A visible commitment to leave the contents alone for a while.' },
      { name: 'Folded weekday', note: 'Speculative matter that keeps a mood without storing a recording.' },
    ],
    care: 'Store out of direct nostalgia. A little present-day air will not spoil the contents.',
    question: 'Which unremarkable part of today would you keep?',
  },
  {
    id: 'compass-for-second-thoughts',
    accession: 'U.01.002',
    title: 'Compass for Second Thoughts',
    room: 'distance',
    maker: 'Tavi Rook, fictional route surveyor',
    imaginedDate: '1948',
    classification: 'Instrument of useful hesitation',
    dimensions: '9 x 9 x 2 cm (proposed)',
    summary: 'Two needles, neither of them pointing north. One indicates the direction you have chosen; the other indicates what that choice leaves behind. It cannot tell you which is right. That omission is the point.',
    caption: 'The second needle is shorter, not less important.',
    story: [
      "In the museum's fiction, Tavi Rook spent years drawing the shortest routes between villages. The lines were impeccable. They bypassed shaded benches, difficult conversations, and the house of an old friend. Rook eventually made a compass to describe the parts of a journey that a route could not justify.",
      "The long green needle follows a decision already made. The smaller rust-colored needle turns toward something the decision excludes. Neither responds to magnetic north, and holding the compass flat does not make the needles agree. To use it, one names a choice without disguising it as a necessity. The instrument is silent until that distinction can be made.",
      "Rook's invented notebook describes lending it to a messenger who was considering a shorter round. The small needle pointed not to a road but to an extra ten minutes at one doorstep. The messenger still chose the shorter route. The compass had not failed: it made the cost visible without pretending to settle it. We have left the dial without cardinal letters. A second thought need not be a command to turn around.",
    ],
    provenance: 'IMAGINED: Assembled by the fictional Tavi Rook in 1948 from an unmarked pocket-watch case. Its alleged notebook and messenger are also inventions. The accession places it in a room about direction, not navigation history.',
    materials: [
      { name: 'Brass and mineral glass', note: 'A pocket-sized case sturdy enough to survive being consulted and then ignored.' },
      { name: 'Two independent needles', note: 'No gearing links them; agreement is neither expected nor rewarded.' },
      { name: 'Unchosen possibility', note: 'The impossible field to which the smaller needle responds.' },
    ],
    care: 'Keep away from claims that there was never any alternative.',
    question: 'What does your present direction leave out?',
  },
  {
    id: 'letterweight-for-unsent-words',
    accession: 'U.03.001',
    title: 'Letterweight for Unsent Words',
    room: 'unsaid',
    maker: 'Sella Mor, fictional stone carver',
    imaginedDate: '1927',
    classification: 'Temporary keeper of a sentence',
    dimensions: '18 x 12 x 7 cm (proposed)',
    summary: 'A basalt weight with room for one sentence that is not ready to leave the desk. Slide the sentence into its seam and the paper becomes blank. The words are not destroyed; the stone agrees to carry them for a while.',
    caption: 'The slit accepts words, not paper. The envelope remains outside.',
    story: [
      "Sella Mor, an invented carver of plain house numbers, was asked to make a paperweight for a desk beside an open window. She delivered a stone that held down more than paper. A sentence placed beneath it lost its ink but not its meaning. The meaning settled into a small chamber no chisel could have reached.",
      "The owner could go to the market, answer another letter, or sleep without rehearsing the sentence. At a later time, tapping the stone twice returned the words to a fresh sheet. They came back exactly as written, which was sometimes a disappointment. The letterweight did not improve an apology or make a difficult truth easier to receive.",
      "In the object's imagined history, its first keeper retrieved the same sentence on eleven occasions and sent a quite different one on the twelfth. The museum does not supply either sentence. Making the private words public would confuse the object with the life it is meant to serve. We show it on an empty envelope: evidence of a pause, not a promise that silence is always the kinder choice.",
    ],
    provenance: 'IMAGINED: Carved in 1927 by the fictional Sella Mor for an unnamed correspondent. The eleven retrievals belong to this invented story, not to a surviving record. No real private letters are represented.',
    materials: [
      { name: 'Water-worn basalt', note: 'An unshowy surface that can be held in one hand without demanding attention.' },
      { name: 'Felt underside', note: 'Protects the desk; it is the only component that would wear out in ordinary use.' },
      { name: 'Unspoken sentence', note: 'Held as weight rather than sound, ink, or a digital recording.' },
    ],
    care: 'Retrieve the contents occasionally. Do not mistake safekeeping for an answer.',
    question: 'What might you say differently after leaving it on the desk?',
  },
  {
    id: 'hinge-for-an-absent-room',
    accession: 'U.04.001',
    title: 'Hinge for an Absent Room',
    room: 'domestic',
    maker: 'Deren Ash, fictional cabinet repairer',
    imaginedDate: '1909',
    classification: 'Architectural provision',
    dimensions: '11 x 8 cm, unfolded (proposed)',
    summary: 'One leaf attaches to a door frame; the other attaches to a room that has not been built. The room appears only while no one has decided what it is for. Naming it a study or a spare bedroom makes it close.',
    caption: 'Only the fixed leaf has screws. The other holds an intention.',
    story: [
      "The fictional Deren Ash repaired cupboards in houses where every corner had a job. A table was also a workbench; a bed was also storage. His hinge offered no additional floor area in a survey. Instead, it made an opening onto a room that could exist for as long as its purpose remained undecided.",
      "The room had enough daylight to sit in, but no reliable dimensions. Carrying in a chair was permitted. Carrying in a plan was not. The hinge swung shut at the words 'this could be the office,' leaving the chair neatly outside the frame. It was not opposed to work. It was opposed to the habit of assigning every available space before anyone had experienced it.",
      "In an imagined household trial, the room stayed open through an entire rainy afternoon while two neighbors repaired a kite. It disappeared the moment they called it a workshop. We have mounted only the jamb and hinge. A reconstructed room would settle precisely what the object leaves open. Visitors are invited to look through the missing leaf without deciding what the museum ought to put on the other side.",
    ],
    provenance: 'IMAGINED: A proposed 1909 invention by Deren Ash, whose cabinet trade and household trials are fictional. The jamb shown here belongs to the drawing, not to an actual demolished building.',
    materials: [
      { name: 'Cast brass', note: 'The fixed leaf uses the ordinary proportions of a modest cupboard hinge.' },
      { name: 'Unfinished pine', note: 'A door jamb deliberately left without a room name or a coat of institutional paint.' },
      { name: 'Undecided use', note: 'An impossible supporting material that collapses under a definitive label.' },
    ],
    care: 'Oil sparingly. Resist the temptation to optimize the space beyond it.',
    question: 'Could one small part of your home have no assigned purpose?',
  },
  {
    id: 'listening-thimble',
    accession: 'U.03.002',
    title: 'Listening Thimble',
    room: 'unsaid',
    maker: 'Eda Wren, fictional mender',
    imaginedDate: '1955',
    classification: 'A small aid to attention',
    dimensions: '3 cm high; 2 cm opening (proposed)',
    summary: 'Worn on the smallest finger, this thimble collects the silences in a conversation. Its wearer can feel their shape without filling them. There is no playback, transcription, or way to discover what another person has not chosen to say.',
    caption: 'The hollow interior contains no recording surface.',
    story: [
      "In the invented workroom of Eda Wren, customers often brought a story with the garment they wanted mended. Wren noticed how quickly she reached for a reassuring phrase whenever a customer stopped speaking. She made the Listening Thimble to keep her hands occupied with a different task: attending to the pause itself.",
      "Its copper shell becomes perceptibly heavier during a silence. A comfortable pause feels broad and light; a difficult one feels narrow, with an edge. These sensations reveal nothing about the speaker's hidden thoughts. The thimble is incapable of reading a mind. It helps the listener notice their own urge to interrupt, which is a much smaller and more useful magic.",
      "Wren's fictional instruction card recommends removing the thimble before offering advice. The action gives the wearer one last chance to ask whether advice was wanted. After a conversation, the collected silences fall out as ordinary room air. Nothing can be replayed. The museum displays a bottom view to make this absence explicit: an instrument for listening need not become an instrument for keeping someone else's words.",
    ],
    provenance: 'IMAGINED: Designed in 1955 for Eda Wren\'s fictional mending table. The workroom, customers, and instruction card have been created for this collection. No testimony or recording underlies the object.',
    materials: [
      { name: 'Hammered copper', note: 'A warm, familiar shell with the shallow dimples of an ordinary sewing thimble.' },
      { name: 'Unlined interior', note: 'Intentionally empty: there is nothing on which a conversation could be stored.' },
      { name: 'The weight of a pause', note: 'An imagined sensation available only while its wearer is listening.' },
    ],
    care: 'Empty after each conversation. Never use as evidence of what someone meant.',
    question: 'When did you last let a pause remain a pause?',
  },
  {
    id: 'window-for-borrowed-weather',
    accession: 'U.01.003',
    title: 'Window for Borrowed Weather',
    room: 'distance',
    maker: 'Lio Sedge, fictional glazier',
    imaginedDate: '1939',
    classification: 'An exchange of atmospheres',
    dimensions: '62 cm high; 48 cm diameter (proposed)',
    summary: 'A freestanding window that admits the weather someone has willingly described to you. It borrows no view and reveals no address. A remembered shower arrives as a little rain against the glass, even on a dry afternoon.',
    caption: 'A shallow tray returns the borrowed rain to ordinary water.',
    story: [
      "Our fictional glazier Lio Sedge received letters from a sister who described places through their weather. A city was 'the wind that lifted the market cloth'; a coast was 'rain fine enough to forget.' Sedge made a window for those descriptions, with a wooden stand so that no existing wall would need to be broken.",
      "The glass admits only weather offered freely in words. It cannot be pointed at a distant house or made to reveal what another person is doing. Read a description aloud and the pane gathers its atmosphere: cold brightness, a patch of fog, the tap of a shower. The rest of the room remains itself. There is no portal behind the leadwork.",
      "A small tray catches the rain after it has ceased to belong to the description. Sedge used this water for a plant, an action the museum finds more interesting than a perfect illusion. Something borrowed becomes part of an ordinary act of care. In the story, the sister eventually visits and says the window has got the wind wrong. They keep it anyway, beside a window that opens.",
    ],
    provenance: 'IMAGINED: A 1939 gift between the invented siblings Lio and Anet Sedge. Their correspondence and the weather it describes are original fiction. The window has no connection to a real place or person.',
    materials: [
      { name: 'Leaded glass', note: 'The divided circle keeps each small atmosphere visibly bounded.' },
      { name: 'Oak stand and zinc tray', note: 'A domestic support and a practical place for a few impossible drops.' },
      { name: 'Freely offered description', note: 'The speculative medium; the object cannot borrow an unshared memory.' },
    ],
    care: 'Dry the sill. Ask before borrowing. Open an ordinary window as well.',
    question: 'How would you describe the weather of a place you miss?',
  },
  {
    id: 'rain-receipt',
    accession: 'U.04.002',
    title: 'Rain Receipt',
    room: 'domestic',
    maker: 'Perrin Hale, fictional gutter maker',
    imaginedDate: '1921',
    classification: 'Witness to passing weather',
    dimensions: '31 x 21 x 18 cm (proposed)',
    summary: 'A zinc funnel that issues a receipt for a shower. Instead of a total, the paper lists what the rain briefly touched: a doorstep, a sleeve, the inside of an upturned leaf. No payment is due.',
    caption: 'The paper stays dry. The crank advances it but cannot summon rain.',
    story: [
      "Perrin Hale, an invented gutter maker, worked at the edge of roofs, where a shower becomes a practical problem. He liked the way people noticed rain intensely while it fell and forgot it as soon as they were dry. The Rain Receipt was his attempt to leave a small acknowledgment without turning the weather into a number.",
      "Its funnel accepts one drop at the end of a shower. The mechanism then prints three things the rain touched on its way through the neighborhood. It might name the back of a chair left outside, a bicycle bell, and a weed growing in a wall. It cannot give the drop's complete route, a forecast, or the name of the person beneath an umbrella.",
      "The resulting strip looks like a bill, but the place where a total would appear is blank. Hale's fictional customers kept the receipts in coat pockets until they became soft and illegible. He thought this an appropriate lifetime. We show a fresh strip only to make the idea readable. The object's ambition is not to preserve every shower forever, but to register that an ordinary thing has happened and touched other ordinary things.",
    ],
    provenance: 'IMAGINED: Proposed in 1921 by the fictional Perrin Hale. The neighborhood, customers, and surviving receipt are narrative inventions. The drawing is neither a historic rain gauge nor a functional printer design.',
    materials: [
      { name: 'Folded zinc', note: 'A funnel shaped by the everyday craft of keeping a house dry.' },
      { name: 'Cotton-rag paper', note: 'A short-lived record intended to soften in a pocket, not survive in a vault.' },
      { name: 'Weather-borne attention', note: 'The impossible ink records contact rather than quantity.' },
    ],
    care: 'Clear leaves from the funnel. Do not file the receipts under debts.',
    question: 'What did the last rain touch near you?',
  },
  {
    id: 'foldable-pause',
    accession: 'U.02.002',
    title: 'Foldable Pause',
    room: 'time',
    maker: 'Neris Fold, fictional screen maker',
    imaginedDate: '1963',
    classification: 'Portable interval',
    dimensions: '72 x 22 cm open; 12 x 22 cm closed (proposed)',
    summary: 'A six-panel screen that makes a little extra space between a question and its answer. Unfold it on a table to hold the interval open. The clock keeps moving; the demand for an immediate reply does not.',
    caption: 'The two central panels have been left entirely unmarked.',
    story: [
      "In this invented account, Neris Fold made tabletop screens for people sharing busy rooms. One commission asked for something stranger than privacy: enough space to finish thinking before having to speak. Fold responded with a linen concertina small enough to keep beside a notebook.",
      "Opening the six panels does not stop a clock, freeze a visitor, or delay a train. It loosens the join between a question and the expectation of a reply. Within that interval, a person can discover whether their first answer was an answer at all. The screen works just as well for someone composing a letter alone as for two people sitting across a table.",
      "Fold originally printed prompts on every panel. In the fiction, an early user turned it backward because the helpful phrases were another voice to answer. The final version leaves its center blank. The pause closes when the screen is folded, and no time is owed afterward. We have kept the empty panels prominent in the drawing. Not every aid to thought needs to supply more things to think about.",
    ],
    provenance: 'IMAGINED: A fictional 1963 commission by the invented Neris Fold. The initial printed prototype and its revision exist only in this account. No historical design movement or actual manufacturer is being represented.',
    materials: [
      { name: 'Linen over board', note: 'A quiet surface that can be opened without announcing a performance.' },
      { name: 'Cloth hinges', note: 'Six panels fold to the width of one, with no catch to force them shut.' },
      { name: 'Unclaimed interval', note: 'The speculative material between being asked and being ready.' },
    ],
    care: 'Fold only when ready. Keep the blank panels free of instructions.',
    question: 'Which question would you like a little longer to answer?',
  },
  {
    id: 'shadow-mender',
    accession: 'U.04.003',
    title: 'Shadow Mender',
    room: 'domestic',
    maker: 'Ansa Reed, fictional repairer',
    imaginedDate: '1941',
    classification: 'Loom for an intangible repair',
    dimensions: '38 x 27 x 5 cm (proposed)',
    summary: 'A small loom for a shadow worn thin by being stretched in too many directions. Two ash rails hold the shade while a blunt needle closes the tear. The repair remains visible. It is not intended to make a person look new.',
    caption: 'The pale seam shows only in low afternoon light.',
    story: [
      "Ansa Reed, the fictional maker of this loom, observed that a shadow could be pulled long in the morning and folded under a chair by noon without anyone asking how it was holding up. Her Shadow Mender treats that daily stretching as wear. It is an ordinary repair tool for an impossible kind of cloth.",
      "The owner places a corner of their shadow between the ash rails. Dark thread follows the edges of a tear without tightening them. The needle is deliberately blunt: a sharp instrument might make another opening in what it is meant to mend. The work changes neither a person's body nor the source of light. It gives the shadow enough slack to follow again.",
      "Reed's imagined repair book rejects invisible mending. A pale seam should appear in late-afternoon light, when the repaired portion is stretched longest. In the story, one customer asks for a straighter, more respectable shadow. Reed returns it unrepaired. The loom cannot decide what a person ought to look like. We display it partway through a small mend, with the irregular outline intact and the remaining thread within reach.",
    ],
    provenance: 'IMAGINED: Designed in 1941 by Ansa Reed, an invented repairer. Her customers and repair book are fictional. This accession describes a speculative drawing, not a surviving tool or a documented treatment.',
    materials: [
      { name: 'Ash rails and brass pegs', note: 'A simple frame that holds the edges without requiring a regular shape.' },
      { name: 'Blunt steel needle', note: 'Proposed as a tool for joining, not piercing; its eye takes a generous thread.' },
      { name: 'Thread spun from shade', note: 'The impossible material, with a pale joining thread that makes repair visible.' },
    ],
    care: 'Leave a little slack. Never trim a shadow to fit the frame.',
    question: 'What would a repair look like if it did not have to disappear?',
  },
];

export function roomFor(id: RoomId): MuseumRoom {
  const room = rooms.find((item) => item.id === id);
  if (!room) throw new Error(`Unknown museum room: ${id}`);
  return room;
}

export function catalogEntry(exhibit: Exhibit): string {
  const room = roomFor(exhibit.room);
  return [
    'THE MUSEUM OF UNMADE THINGS',
    'A fictional collection of speculative design',
    '',
    `${exhibit.accession} | ${exhibit.title}`,
    `Room ${room.number}: ${room.name}`,
    `Invented maker: ${exhibit.maker}`,
    `Imagined date: ${exhibit.imaginedDate}`,
    `Classification: ${exhibit.classification}`,
    `Dimensions: ${exhibit.dimensions}`,
    '',
    'WALL LABEL',
    exhibit.summary,
    '',
    'DRAWING CAPTION',
    exhibit.caption,
    '',
    'THE OBJECT STORY',
    ...exhibit.story.flatMap((paragraph) => [paragraph, '']),
    'IMAGINED PROVENANCE',
    exhibit.provenance,
    '',
    'MATERIALS (PROPOSED)',
    ...exhibit.materials.map((material) => `${material.name}: ${material.note}`),
    '',
    'CARE, IN PRINCIPLE',
    exhibit.care,
    '',
    'A QUESTION TO TAKE AWAY',
    exhibit.question,
    '',
    fictionNotice,
  ].join('\n');
}

export function fullCatalog(): string {
  return [
    'THE MUSEUM OF UNMADE THINGS',
    'The permanent collection | Reading edition',
    `${exhibits.length} original imagined objects in ${rooms.length} rooms`,
    '',
    fictionNotice,
    '',
    'CURATORIAL NOTE',
    'These objects begin with small needs that ordinary design cannot quite reach: a little distance without departure, a pause without an excuse, a repair that does not have to disappear. Their impossibility is a way of making the need visible, not a claim that a machine can resolve it.',
    '',
    'The collection favors modest tools over grand solutions. Each drawing borrows the visual language of a practical object, then leaves one essential material impossible. Read the proposed use, question it, and keep only what is useful.',
    '',
    ...exhibits.flatMap((exhibit) => ['='.repeat(64), '', catalogEntry(exhibit), '']),
  ].join('\n');
}

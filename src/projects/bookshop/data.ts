export const SCENE_IDS = [
  'threshold', 'counter', 'reading-room', 'tide-atlas', 'map-pocket',
  'mending-manual', 'sewing-table', 'borrowers-book', 'name-strip',
  'back-stair', 'cellar', 'rain-window', 'unclaimed-parcel', 'letter',
  'last-clock', 'closing-ledger', 'decision', 'street-preparation',
  'road-preparation', 'ending-street', 'ending-road', 'ending-keeper',
] as const;

export type SceneId = typeof SCENE_IDS[number];

export const FACTS = {
  chart: {
    kind: 'item', label: 'A fold of dry river',
    detail: 'A paper route to the cellar. The stairs are drawn where the water is not.',
  },
  thread: {
    kind: 'item', label: 'Three yards of red thread',
    detail: 'Earned by repairing a broken binding. Enough to sew one roof to its house.',
  },
  names: {
    kind: 'item', label: "The borrowers' names",
    detail: 'A long strip of paper: people who once lived on Bellwether Lane, still owed a door.',
  },
  key: {
    kind: 'item', label: 'The brass street key',
    detail: 'Retrieved from the cellar. It opens the shop onto a real street, if the roof can hold.',
  },
  book: {
    kind: 'item', label: 'The unclaimed orchard book',
    detail: 'A wrapped, unfinished volume. It can carry a travelling library out of the shop.',
  },
  address: {
    kind: 'item', label: 'Your old return address',
    detail: 'A square of envelope in your own handwriting. A destination, not an obligation.',
  },
  witness: {
    kind: 'discovery', label: 'Someone is waiting outside',
    detail: 'Mina answered to her name. She will bring a ladder, a loaf, and a second pair of hands.',
  },
  'map-left': {
    kind: 'discovery', label: 'The atlas stayed whole',
    detail: 'You left the fold in its binding. The cellar route is not in your pocket.',
  },
  'parcel-left': {
    kind: 'discovery', label: 'The parcel stayed on the shelf',
    detail: 'You did not accept responsibility for the travelling book.',
  },
  'letter-burned': {
    kind: 'discovery', label: 'The letter went into the stove',
    detail: 'You chose not to take your old address into the morning.',
  },
  'clock-heard': {
    kind: 'discovery', label: 'The hour belongs to the reader',
    detail: 'Nothing here advances with real time. Dawn arrives only when you choose an ending.',
  },
  'roof-mended': {
    kind: 'discovery', label: 'The roof is attached to the world',
    detail: 'The thread is spent; the brass key is in the street door.',
  },
  homeward: {
    kind: 'discovery', label: 'The first delivery is homeward',
    detail: 'You chose your old address as the travelling library\'s first stop.',
  },
  outward: {
    kind: 'discovery', label: 'The first delivery is somewhere new',
    detail: 'You chose the eastern footpath, following the orchard book.',
  },
} as const;

export type FactId = keyof typeof FACTS;

export interface Condition {
  all?: readonly FactId[];
  none?: readonly FactId[];
  visited?: readonly SceneId[];
  unvisited?: readonly SceneId[];
}

export interface Effects {
  add?: readonly FactId[];
  remove?: readonly FactId[];
}

export interface Passage {
  text: string;
  when?: Condition;
}

export interface Choice {
  id: string;
  label: string;
  note?: string;
  target: SceneId;
  when?: Condition;
  effects?: Effects;
  unavailable?: string;
  hideWhenUnavailable?: boolean;
  group?: string;
}

export interface Scene {
  id: SceneId;
  title: string;
  place: string;
  paragraphs: readonly (string | Passage)[];
  choices: readonly Choice[];
  effects?: Effects;
  ending?: {
    number: string;
    name: string;
    consequence: string;
  };
}

export interface ShelfBook {
  id: string;
  title: string;
  shortTitle: string;
  author: string;
  binding: 'river' | 'wine' | 'moss' | 'ochre' | 'linen' | 'coal';
  shelfmark: string;
  scene: SceneId;
  jacket: string;
  excerpt: readonly string[];
}

export const BOOKS: readonly ShelfBook[] = [
  {
    id: 'atlas', title: 'An Atlas of Water That Has Not Arrived',
    shortTitle: 'Water That Has Not Arrived', author: 'Sella Fen',
    binding: 'river', shelfmark: 'I', scene: 'tide-atlas',
    jacket: 'A survey of future riverbeds, with corrections in blue pencil. The maps are most accurate in places the surveyor refused to leave.',
    excerpt: [
      'To mark a flood, begin with the objects that will not float. Draw the stove, the iron bed, the stone dog on the library steps. These will be your landmarks when the street signs have gone.',
      'Do not colour the whole sheet blue. Someone will still need to know where the stairs were. Leave the width of a pencil between the water and the house, even if the house has asked for less.',
    ],
  },
  {
    id: 'repairs', title: 'Small Repairs for Impossible Houses',
    shortTitle: 'Small Repairs', author: 'Oswin Tern',
    binding: 'wine', shelfmark: 'II', scene: 'mending-manual',
    jacket: 'A practical manual for tenants of wandering buildings. Includes roof stitches, reluctant hinges, and the maintenance of a shared threshold.',
    excerpt: [
      'A roof that has lost confidence will lift at the corners. Do not weigh it down with stones. It knows what stones are and has already considered the matter.',
      'First ask who expects to sleep underneath it. Speak each answer into the thread. A running stitch is sufficient for a shed; a house will require a second person to hold the ladder, if one can be found.',
    ],
  },
  {
    id: 'borrowers', title: 'The Borrowers of Bellwether Lane',
    shortTitle: 'The Borrowers of Bellwether Lane', author: 'Ida Pell',
    binding: 'moss', shelfmark: 'III', scene: 'borrowers-book',
    jacket: 'A lending register with no column for fines. In the back, the clerk has written down what each borrower was doing when the street disappeared.',
    excerpt: [
      'Mina Sorrell: one oven book, flour in the gutter. Returned with a correction to the temperature. Asked that the correction be kept, though it was written on a bus ticket.',
      'Leon Bex: a book of birds for his brother, who had never seen a swallow. Returned late. A swallow had been seen. No further action was considered necessary.',
    ],
  },
  {
    id: 'letters', title: 'A Field Guide to Unposted Letters',
    shortTitle: 'Unposted Letters', author: 'Vera Kett',
    binding: 'ochre', shelfmark: 'IV', scene: 'letter',
    jacket: 'Correspondence classified by the thing that prevented its sending. A thumb-worn guide to apologies, announcements, and addresses that still exist.',
    excerpt: [
      'The ordinary unsent letter makes its nest in a drawer. Disturb it as little as possible. It is living on a version of the afternoon that its writer cannot afford to replace.',
      'If you find one bearing your own address, you are not required to answer. You may fold it into a smaller shape and keep only the way home. This is not the same thing as agreeing to go.',
    ],
  },
  {
    id: 'orchard', title: 'The Orchard Between Stations',
    shortTitle: 'The Orchard Between Stations', author: 'Emil Rusk',
    binding: 'linen', shelfmark: 'V', scene: 'unclaimed-parcel',
    jacket: 'An unfinished account of an orchard that grows in the intervals of a railway timetable. The final gathering has not yet been written.',
    excerpt: [
      'At the first station there was one apple tree, growing through the bench. At the second there was a woman selling the same apples before they had ripened. The conductor bought two and put them in his hat.',
      'Nobody could agree who owned the orchard. In the end they gave a key to every passenger who had ever carried a bucket of water to it. The key opened nothing. That was not its purpose.',
    ],
  },
  {
    id: 'hour', title: 'The Hour Left Over',
    shortTitle: 'The Hour Left Over', author: 'D. Carrow',
    binding: 'coal', shelfmark: 'VI', scene: 'last-clock',
    jacket: 'A thin monograph on the time remaining after a clock has been stopped. Written in a watchmaker\'s kitchen, without a working watch.',
    excerpt: [
      'The baker measures the last hour in loaves. The night porter measures it in keys still unclaimed. Neither should be corrected by a person who has spent it looking at a dial.',
      'An hour kept for someone else does not become larger. It becomes furnished. There is a chair in it now, and a small table, and a place for the person who has not arrived.',
    ],
  },
];

export const SCENES: readonly Scene[] = [
  {
    id: 'threshold', title: 'A light under the door', place: 'On the step',
    paragraphs: [
      'The rain has washed the numbers off every door except this one. Six. A brass digit, loose at the bottom, turning slightly when the wind comes down the lane. Yesterday there was a wall here. You remember because you rested your shopping bag against it to mend the handle.',
      'Tonight there is a bookshop. Its window is the colour of tea held up to a lamp. A ladder leans against the shelves inside; on the lowest rung sits a cup with a spoon still standing in it. Someone has written LAST in the space above BOOKSHOP, but the paint is older than the glass.',
      'In your coat is a letter you have been carrying for eleven days. It is addressed to the house where you grew up. You have not posted it because the house was cleared for the new reservoir, and because you are not sure which of these facts the letter is meant to repair.',
      'The notice on the door says: OPEN UNTIL THE LAST PAGE. Underneath, in a smaller hand: Wet coats welcome. You put a palm against the wood. On the other side, someone puts down a cup.',
    ],
    choices: [
      { id: 'enter', label: 'Push the door with your shoulder', note: 'There is no timer. Read at your own pace.', target: 'counter' },
    ],
  },
  {
    id: 'counter', title: 'The woman with the pencil', place: 'At the counter',
    paragraphs: [
      'The woman behind the counter has a carpenter\'s pencil tucked into the roll of her sleeve. She is rubbing a rectangle of clean wood into a much older counter, patiently, with the side of her thumb. A nameplate says NELL. The word PROPRIETOR has been crossed out so thoroughly that it is the first word you notice.',
      '"I keep it," she says, following your glance. "That is different." She takes your coat only long enough to shake the water into a tin basin. The basin contains three dead leaves and a small, entirely dry railway ticket.',
      'Bellwether Lane, she explains, was flooded when the reservoir gates closed. The houses went; the people moved. The books had not finished being borrowed, so the shop refused to follow. Now its last keeper is leaving. At dawn it must open somewhere real, travel in someone\'s keeping, or find a person willing to stay.',
      '"Nothing is for sale tonight. But you may take what you have properly read." She nods at your coat. "You will find the pockets larger than you remember."',
    ],
    choices: [
      { id: 'ask-hour', label: 'Ask what will happen at dawn', target: 'last-clock' },
      { id: 'browse', label: 'Carry your coat into the reading room', target: 'reading-room' },
    ],
  },
  {
    id: 'reading-room', title: 'A chair pulled out for you', place: 'The reading room',
    paragraphs: [
      'The reading table has four chairs and five rings left by cups. Its legs have been shortened one by one to suit a floor that slopes towards the river. You sit on the only chair without a book on it. The lamp makes a small amber country of the tabletop.',
      'These are not the books the town thought important enough to save. There is a manual with a broken spine, an atlas too large for its shelf, a lending register. A parcel occupies the space where a dictionary ought to be. All of them have been handled; all of them will let you stop.',
      '"Read for a use, if you can," Nell calls from the counter. "You will have to decide what becomes of the place. The shelves can give you more than one way to do it." You can hear the river under the floor, moving furniture in its sleep.',
      { text: 'The paper in your pockets makes a dry, companionable noise. What you have taken will stay with this visit. A book already read can be revisited by turning back your bookmark, but not by quietly taking its gift a second time.', when: { visited: ['closing-ledger'] } },
    ],
    choices: [
      { id: 'read-atlas', label: 'An Atlas of Water That Has Not Arrived', note: 'Sella Fen. A route through the water.', group: 'Take a book to the table', target: 'tide-atlas', when: { unvisited: ['tide-atlas'] }, hideWhenUnavailable: true },
      { id: 'read-repairs', label: 'Small Repairs for Impossible Houses', note: 'Oswin Tern. Something useful for the roof.', group: 'Take a book to the table', target: 'mending-manual', when: { unvisited: ['mending-manual'] }, hideWhenUnavailable: true },
      { id: 'read-borrowers', label: 'The Borrowers of Bellwether Lane', note: 'Ida Pell. Find out who the shop belongs to.', group: 'Take a book to the table', target: 'borrowers-book', when: { unvisited: ['borrowers-book'] }, hideWhenUnavailable: true },
      { id: 'read-parcel', label: 'Lift down the unclaimed parcel', note: 'The Orchard Between Stations. A book without a reader.', group: 'Take a book to the table', target: 'unclaimed-parcel', when: { unvisited: ['unclaimed-parcel'] }, hideWhenUnavailable: true },
      { id: 'read-letter', label: 'Look up your letter in the field guide', note: 'Vera Kett. Decide what to do with your old address.', group: 'Take a book to the table', target: 'letter', when: { unvisited: ['letter'] }, hideWhenUnavailable: true },
      { id: 'take-stair', label: 'Find the back staircase', note: 'The street key is somewhere below the shop.', group: 'Elsewhere in the shop', target: 'back-stair', when: { all: ['chart'], unvisited: ['cellar'] }, unavailable: 'Take the dry-river fold from the atlas to find the stairs.' },
      { id: 'call-window', label: 'Call a borrower through the window', note: 'A name might reach farther than a light.', group: 'Elsewhere in the shop', target: 'rain-window', when: { all: ['names'], unvisited: ['rain-window'] }, unavailable: 'Copy the borrowers\' names before calling to the street.' },
      { id: 'read-clock', label: 'Read beside the stopped clock', note: 'The Hour Left Over. Learn the terms of this last hour.', group: 'Elsewhere in the shop', target: 'last-clock', when: { unvisited: ['last-clock'] }, hideWhenUnavailable: true },
      { id: 'open-ledger', label: 'Go to the closing ledger', note: 'Consider an ending. You can still come back to the shelves.', group: 'When you are ready', target: 'closing-ledger', when: { unvisited: ['closing-ledger'] }, hideWhenUnavailable: true },
      { id: 'return-ledger', label: 'Return to the three entries', note: 'Your discoveries may have opened another possibility.', group: 'When you are ready', target: 'decision', when: { visited: ['closing-ledger'] }, hideWhenUnavailable: true },
    ],
  },
  {
    id: 'tide-atlas', title: 'The river in the binding', place: 'With Sella Fen\'s atlas',
    paragraphs: [
      'The atlas opens at a street plan drawn before the reservoir. Sella Fen has marked each house in black and each argument about the reservoir in blue. By the end of Bellwether Lane the blue is so thick that the river seems to have arrived ahead of itself.',
      'Between pages forty and forty-one is a foldout. Its paper is dry in a way that makes the rest of the room feel damp. It shows the underside of the bookshop: a staircase, six jars of nails, and a door marked STREET, though the door is underground.',
      'A note in the gutter says: This map is also the last dry portion of the riverbed. Remove along the perforation. The atlas will lose one place; you will gain a way into it. You hold the page up to the lamp. Behind its thin outline of a door is the shadow of a key.',
    ],
    choices: [
      { id: 'take-fold', label: 'Separate the fold along its perforation', note: 'Take the cellar route; leave a gap in the atlas.', target: 'map-pocket' },
      { id: 'leave-fold', label: 'Leave the atlas whole', note: 'You will not have the route to the street key on this path.', target: 'reading-room', effects: { add: ['map-left'] } },
    ],
  },
  {
    id: 'map-pocket', title: 'A country small enough to carry', place: 'At the reading table',
    effects: { add: ['chart'] },
    paragraphs: [
      'The perforation parts with the small, definite sound of a letter being opened. In the atlas, the space you have made fills with a pale wash of water. It does not reach the other pages.',
      'You fold the map twice. A grit of river sand slips from it onto the table: one white stone, one black stone, the red crumb of a brick. In the corner of the map, the staircase turns under the place where you are sitting. You have the odd sensation of balancing your feet above your own thumb.',
      'Nell brings a saucer for the sand. "That was a decent street," she says. "It had a terrible drain and a good baker. People tend to remember only one of those things." She slides the saucer into the gap in the atlas, as if giving the page something to come home to.',
    ],
    choices: [
      { id: 'go-down', label: 'Follow the little staircase on the map', target: 'back-stair' },
      { id: 'return-room', label: 'Pocket the map and return to the shelves', target: 'reading-room' },
    ],
  },
  {
    id: 'mending-manual', title: 'Instructions with flour on them', place: 'With Oswin Tern\'s manual',
    paragraphs: [
      'Small Repairs for Impossible Houses is bound in red cloth, except where someone has repaired the cloth with a piece of an apron. Flour is pressed into the seam. The chapter on roofs has been opened so often that it no longer waits for your hand.',
      '"To keep a house in one place," it begins, "attach it to the people who expect to find it." There follows a perfectly ordinary drawing of a running stitch. Under the drawing is a less ordinary instruction: use the names, not the bodies. Tern has underlined this twice.',
      'The book\'s own spine is coming loose. Inside the broken hinge lies a spool of red thread. You could take the spool, but the last leaves would fall out. On the sewing table beside the stove, a needle has been left through a scrap of felt, ready for a hand.',
    ],
    choices: [
      { id: 'mend-binding', label: 'Repair the book before taking the thread', note: 'There will be enough left for the shop\'s roof.', target: 'sewing-table' },
      { id: 'leave-manual', label: 'Set the manual safely on its side', note: 'Leave the thread with its book. The roof will need another future.', target: 'reading-room' },
    ],
  },
  {
    id: 'sewing-table', title: 'Six stitches and a knot', place: 'Beside the stove',
    effects: { add: ['thread'] },
    paragraphs: [
      'The needle is blunt, made for paper rather than skin. You use the holes that are already there. Through, under, back. The first stitch is ugly. The second is no better, but the leaves are beginning to stand together instead of falling away from one another.',
      'At the sixth stitch, the book settles flat. You can feel the difference through the table. Nell examines the work without picking it up. "Not invisible," she says. "Better than invisible. The next person will know where it needed help."',
      'You measure three yards of thread against your arm and wind them onto a card from an old button box. On the card someone has pencilled: for keeping. The remaining spool fits into the repaired hinge. Nothing has been made new; two things are now usable.',
    ],
    choices: [
      { id: 'return-room', label: 'Put the red thread in your coat pocket', target: 'reading-room' },
    ],
  },
  {
    id: 'borrowers-book', title: 'No column for fines', place: 'With Ida Pell\'s register',
    paragraphs: [
      'The register is heavier than it looks. Its pages have the polished edges of a book handled every day by the same person. Ida Pell ruled five columns: NAME, BOOK, TAKEN, RETURNED, and ANYTHING ELSE. The fifth column occupies half the sheet.',
      'Mina Sorrell borrowed an oven book and returned it with the temperature corrected. Leon Bex kept a bird guide until his brother saw a swallow. Mrs. Dant borrowed the same romance every winter, not because she forgot the ending but because she liked knowing where February was going.',
      'The final page is dated on the morning the reservoir gates closed. Under RETURNED, Ida wrote: Not yet. Under ANYTHING ELSE: A borrower is not a person who owes a book. A borrower is a person to whom the door is still open. A roll of till paper lies beside the register, long enough for every name.',
    ],
    choices: [
      { id: 'copy-names', label: 'Copy the names, including the difficult ones', note: 'Take the people of the lane into account.', target: 'name-strip' },
      { id: 'close-register', label: 'Close the register without making a copy', note: 'You will not be able to give the shop back to its borrowers on this path.', target: 'reading-room' },
    ],
  },
  {
    id: 'name-strip', title: 'Enough paper for everyone', place: 'At the reading table',
    effects: { add: ['names'] },
    paragraphs: [
      'You write until the strip reaches your knee, then the floor. You nearly leave off a name written in a different hand at the very bottom. No book is listed beside it. Under ANYTHING ELSE, someone has put: Only comes in to get warm. You copy that name too.',
      'The ink dries brown. When you lift the strip, the names hold the slight warmth of a loaf wrapped for the walk home. The shop seems to have acquired people in the spaces between its furniture: someone standing aside for someone else, someone waiting to ask.',
      '"You may call through the window," Nell says. "It is not certain they will hear you. Most have quite reasonable lives now, somewhere else." She takes a second cup from under the counter anyway. You roll the names around your finger, careful not to crease anyone in half.',
    ],
    choices: [
      { id: 'call-out', label: 'Take the names to the rain-dark window', target: 'rain-window' },
      { id: 'return-room', label: 'Keep the names and return to the shelves', target: 'reading-room' },
    ],
  },
  {
    id: 'back-stair', title: 'The step that is not there', place: 'Behind the atlas shelf',
    paragraphs: [
      'On the wall behind the atlas shelf is a rectangle the colour of a picture that has been taken away. Your map puts a staircase there. You hold it at arm\'s length, then sideways, then against the wall. A stair appears beneath your right foot with the resigned creak of something asked to work after retirement.',
      'Below it are eleven more. The map has drawn twelve, so you count twice. On the ninth step hangs a small sign: RIVER LEVEL. On the tenth: DO NOT BE IMPRESSED. You can hear water pressing against the other side of the plaster, but the stairs themselves are dusty.',
      'Nell stays at the top. "The key is brass," she tells you. "The silver one opens a cabinet we no longer have. Leave that one. It gets people hopeful." Your folded piece of river makes a dry path down the middle of the dark.',
    ],
    choices: [
      { id: 'enter-cellar', label: 'Count all twelve steps and enter the cellar', target: 'cellar', when: { all: ['chart'] }, unavailable: 'The folded river is needed to keep the stairs dry.' },
      { id: 'return-room', label: 'Return upstairs for now', target: 'reading-room' },
    ],
  },
  {
    id: 'cellar', title: 'The door below the river', place: 'In the cellar',
    effects: { add: ['key'] },
    paragraphs: [
      'The cellar smells of apples that were eaten years ago. Six jars of nails stand precisely where the map promised. On a hook beside them hang two keys, one brass, one silver. You take the brass one. It is warm only along the teeth, as if a thumb has just traced them.',
      'The underground door has a letter slot. Through it you see Bellwether Lane in ordinary daylight: the drain, the baker\'s awning, a bicycle against a post. There are no people. The lane is waiting for a reason to be real again, and a remembered street by itself is apparently not reason enough.',
      'A label on the key explains the rest. STREET DOOR. FIT FROM INSIDE. SECURE ROOF FIRST. On its reverse, in Nell\'s carpenter-pencil hand: A key is permission, not a plan. You close your fingers around it and leave the silver key undisturbed.',
    ],
    choices: [
      { id: 'return-room', label: 'Bring the brass key up into the lamplight', target: 'reading-room' },
    ],
  },
  {
    id: 'rain-window', title: 'An answer in the rain', place: 'At the front window',
    effects: { add: ['witness'] },
    paragraphs: [
      'You wipe a circle in the mist on the glass. Outside is not quite the street you entered from. There is a bus shelter where the opposite wall should be. A woman in a bakery coat is standing under it with a paper bag held flat against her chest.',
      'You try the first name on your strip. "Mina?" The woman looks up, not startled but annoyed in the particular way people are when hope interrupts a carefully arranged disappointment. "Has she finally opened?" she asks. You shake your head. "Not yet."',
      'Mina considers this. Then she puts the bag on the step. Inside is a loaf, still warm through the paper. "I have a ladder," she says. "If this is about that roof." She walks off into the rain before you can answer. A minute later you hear the scrape of ladder feet against the wall. Someone is staying close enough to help.',
    ],
    choices: [
      { id: 'return-room', label: 'Tell Nell that someone has come back', target: 'reading-room' },
    ],
  },
  {
    id: 'unclaimed-parcel', title: 'Please deliver by hand', place: 'Under the orchard book',
    paragraphs: [
      'The parcel is wrapped in brown paper repaired with stamps that have never been issued. Its label reads THE ORCHARD BETWEEN STATIONS, FOR THE NEXT PERSON GOING ANYWHERE. Beneath that is a line for a signature. It has been left blank so firmly that you can feel the intention in it.',
      'Nell tells you that Emil Rusk died before finishing the last chapter. He left the book a railway timetable and instructions to find its own readers. It has been waiting ever since for someone willing to carry it without knowing where the last stop is.',
      '"The whole shop could travel in that," she says. "Not the furniture. The useful part." You lift one corner of the parcel. The shelves lean towards it very slightly, like plants towards a window. Accepting it would make a road possible. It would not oblige you to take the road.',
    ],
    choices: [
      { id: 'accept-book', label: 'Sign for the parcel and carry it unopened', note: 'Accept the book. Unlock the possibility of a travelling library.', target: 'reading-room', effects: { add: ['book'] } },
      { id: 'leave-parcel', label: 'Leave the signature line for someone else', note: 'The travelling ending will remain closed on this path.', target: 'reading-room', effects: { add: ['parcel-left'] } },
    ],
  },
  {
    id: 'letter', title: 'A destination, not an obligation', place: 'With Vera Kett\'s field guide',
    paragraphs: [
      'The field guide opens before you touch it. Between COMMON APOLOGIES and ANNOUNCEMENTS TOO LATE TO BE USEFUL is a page headed LETTERS ADDRESSED TO PLACES. Below the heading is a neat drawing of the envelope in your coat.',
      'You take out the real envelope. You remember writing the letter at your kitchen table, moving a plate aside to make room. It tells the old house that you have learned to fix the rattling sash in your new one. It also asks, though not in those words, whether leaving was a kind of disloyalty.',
      'The guide offers no reply. Instead it marks a square around your return address: the place where you live now, still dry, with a window you repaired yourself. This portion may be kept, says a footnote. The remainder is suitable for kindling. You can preserve a way home or let the whole letter go. Neither action will put the old house back.',
    ],
    choices: [
      { id: 'keep-address', label: 'Tear off and keep your return address', note: 'A travelling library could make its first delivery there.', target: 'reading-room', effects: { add: ['address'] } },
      { id: 'burn-letter', label: 'Let the stove have the whole letter', note: 'Choose the next road without carrying an old destination.', target: 'reading-room', effects: { add: ['letter-burned'] } },
    ],
  },
  {
    id: 'last-clock', title: 'The hour left over', place: 'Beneath the stopped clock',
    effects: { add: ['clock-heard'] },
    paragraphs: [
      'The clock above the stove has no minute hand. Its hour hand points to a small drawing of a chair. On the mantel lies D. Carrow\'s book, opened at a sentence Nell has underlined: An hour kept for someone else becomes furnished.',
      '"It will not run out while you read," she says. "Dawn is a thing you do here, not a thing that catches you." She turns the clock to show a cavity where the mechanism should be. Inside are two screws, a receipt for coal, and a biscuit that has achieved the hardness of a tile.',
      'She has kept the shop for thirty-one years. Her sister lives two towns away, in a flat above a bicycle repairer. There is a room ready for her. "I want to learn the noises of an ordinary place," she says. "A bus going past. Someone dropping a fork upstairs. Nothing that needs interpreting."',
      'You return the clock to its shelf. The hand still points to the chair. Nell has told you what leaving means to her. The books are waiting to find out what it will mean to you.',
    ],
    choices: [
      { id: 'return-room', label: 'Leave the hour open and browse the shelves', target: 'reading-room' },
      { id: 'consider-ending', label: 'Ask Nell to bring out the closing ledger', target: 'closing-ledger' },
    ],
  },
  {
    id: 'closing-ledger', title: 'The account that money cannot settle', place: 'Back at the counter',
    paragraphs: [
      'Nell clears a place on the counter. The rectangle she was polishing is where the ledger has stood for thirty-one years. She lays the book there again, exactly inside its pale footprint, then takes it off and lays it sideways. A very small rehearsal of leaving.',
      'There are three entries on the last page. Give the door back to the street. Let the books travel. Keep the place yourself. None has a price beside it. Nell says a price would suggest that you could pay and have nothing further to do.',
      'The first needs a key, a sound roof, and the names of people entitled to come in. The second needs a book that has agreed to be carried. The third needs you. She has put this last because she does not want your arrival to be mistaken for consent.',
      { text: 'The brass key rests against the button card in your pocket. The rolled names press between them. You have enough to make the first entry possible, though not enough to make it easy.', when: { all: ['key', 'thread', 'names'] } },
      { text: 'The parcel shifts against your coat. Somewhere inside it a page turns towards a railway platform. The second entry is more than an idea now.', when: { all: ['book'] } },
    ],
    choices: [
      { id: 'read-entries', label: 'Read the three entries carefully', note: 'The final choice is on the next page.', target: 'decision' },
      { id: 'keep-looking', label: 'Leave the ledger open and keep looking', note: 'There is still time to read anything you have not chosen yet.', target: 'reading-room' },
    ],
  },
  {
    id: 'decision', title: 'What a door is for', place: 'The last open page',
    paragraphs: [
      'The ledger does not tell you which entry is generous. Nell has crossed out that word wherever an earlier keeper used it. In the margin she has written specific obligations instead: ladders, carrying, winter coal. Things a person can actually promise.',
      'A shop on a street would belong to its readers; you would have to let them change it. A library on the road would reach people this room never could; the room itself would be lost. To stay would preserve the smallest things, down to the cup ring and the faulty drawer. It would also make them your mornings.',
      'You set what you have brought on the counter. Outside, the rain pauses between two kinds of weather. Nell puts the pencil beside your hand and waits without pretending not to.',
      { text: 'Through the glass you can see Mina\'s ladder. She is eating the heel of the loaf, patiently. Whatever you decide, she will know that someone answered.', when: { all: ['witness'] } },
    ],
    choices: [
      {
        id: 'choose-street', label: 'Give the door back to the street',
        note: 'Spend the thread, fit the key, and open the shop to the people on your strip of names.',
        target: 'street-preparation', when: { all: ['key', 'thread', 'names'] },
        unavailable: 'This needs the atlas route and cellar key, the repair manual\'s thread, and a copy of the borrowers\' names.',
      },
      {
        id: 'choose-road', label: 'Carry the library into the morning',
        note: 'Keep the books in circulation. Leave this particular room behind.',
        target: 'road-preparation', when: { all: ['book'] },
        unavailable: 'Accept the unclaimed orchard parcel from the reading-room shelf first.',
      },
      {
        id: 'choose-keeper', label: 'Write your name in Nell\'s place',
        note: 'An ending: let Nell leave, and accept the daily work of keeping this room.',
        target: 'ending-keeper',
      },
      { id: 'not-yet', label: 'Not yet. Return to the reading room.', note: 'Nothing is decided until you choose it.', target: 'reading-room' },
    ],
  },
  {
    id: 'street-preparation', title: 'A running stitch for a roof', place: 'Between the rafters',
    effects: { remove: ['thread', 'key'], add: ['roof-mended'] },
    paragraphs: [
      'You thread the blunt needle with the red length from your button card. At the first rafter the roof lifts, just as the manual said it would. It is surprisingly light. Beyond it is not sky but a page of very fine print, the terms on which a place is allowed to disappear.',
      'You put the needle through the roof and back through the wall. Before each stitch you read a name. Mina Sorrell. Leon Bex. Mrs. Dant. The person who only came in to get warm. The names do not become nails or stars. They remain names, which is what makes the work so slow and so necessary.',
      { text: 'Mina holds the ladder and corrects your pronunciation twice. When your arm tires, she takes the needle. There is nothing in the manual about which of you has to finish.', when: { all: ['witness'] } },
      { text: 'There is nobody to hold the ladder, so you lash it to a shelf with your coat belt. Twice you climb down to check the knot. The work takes longer alone, but the names keep their place on the paper.', when: { none: ['witness'] } },
      'The final knot uses the last of the thread. Downstairs you fit the brass key into the front door, where it has always belonged. Nell turns the sign over. The blank side waits for a more ordinary word.',
    ],
    choices: [
      { id: 'open-street', label: 'Turn the key towards morning', target: 'ending-street', when: { all: ['roof-mended', 'names'] }, unavailable: 'The roof must be mended and the borrowers remembered.' },
    ],
  },
  {
    id: 'road-preparation', title: 'How to pack a room', place: 'At the cleared reading table',
    paragraphs: [
      'You untie the parcel without tearing the paper. Inside is a book the colour of an uncut apple. When you open it, the shelves release a long, papery breath. Titles lift from the spines, one at a time, and settle between its leaves. The bindings stay behind, light and empty as coats on pegs.',
      'It is not possible to take everything. The ladder will not fit. The table\'s five cup rings will not fit. You wrap a spoon in a piece of the parcel paper because a spoon, at least, is a thing for which you can make room. Nell puts a railway ticket between the pages.',
      '"You will have to stop," she says. "Not just travel. Sit somewhere long enough for people to ask what you are carrying." The book grows no heavier, but you adjust your hold on it.',
      { text: 'The return address in your pocket has become legible through the envelope. You could start at the place you already live, without pretending that it is the place you lost.', when: { all: ['address'] } },
      { text: 'Ash shifts in the stove where you put your letter. The next destination need not be an answer to the last one.', when: { all: ['letter-burned'] } },
    ],
    choices: [
      { id: 'go-homeward', label: 'Make the first delivery to your own address', note: 'Bring the travelling library home before carrying it farther.', target: 'ending-road', when: { all: ['address'] }, effects: { add: ['homeward'] }, unavailable: 'Keep the return address from your letter to choose this first stop.' },
      { id: 'go-outward', label: 'Take the eastern footpath to the first station', note: 'Let a new place be the library\'s first stop.', target: 'ending-road', effects: { add: ['outward'] } },
    ],
  },
  {
    id: 'ending-street', title: 'The door on the street', place: 'Morning, Bellwether Lane',
    ending: { number: 'I', name: 'A place returned', consequence: 'The shop belongs to its borrowers. The thread is spent and the key stays in the door.' },
    paragraphs: [
      'The first thing to come through the door is a draught. Not an enchanted wind: a perfectly ordinary current of cold air that lifts a receipt and makes Nell complain. Then comes the smell of a drain, and baking, and someone\'s bicycle brakes in the wet.',
      'Bellwether Lane has not replaced the reservoir. It has made a turn off the present-day street, a short lane where there was room for one. The old houses are still gone. Nobody is asked to leave the lives they made afterwards. There is simply a door they can use again.',
      { text: 'Mina writes OPEN on the blank side of the sign. She makes the O too wide and the N too narrow, and refuses to start again. By ten she has proposed moving the reading table. You find that you mind. You help her move it anyway.', when: { all: ['witness'] } },
      { text: 'You pin the copied names inside the window. The first person to recognise one is a man walking a small, uncooperative dog. He returns with his sister, who immediately proposes moving the reading table. You find that you mind. You help them move it anyway.', when: { none: ['witness'] } },
      { text: 'The orchard book goes on a low shelf marked TO GO OUT. A room returned to the street has no excuse to keep all its stories indoors.', when: { all: ['book'] } },
      { text: 'Nell leaves for her sister\'s flat with a bag small enough to fit beneath a bus seat. Mina wraps what is left of the loaf for her journey.', when: { all: ['witness'] } },
      { text: 'Nell leaves for her sister\'s flat with a bag small enough to fit beneath a bus seat. The man with the dog walks her to the stop, telling her which bus no longer runs on Sundays.', when: { none: ['witness'] } },
      'That afternoon the repaired roof leaks over the dictionary shelf. You put a basin underneath and write it in the work book. There is going to be a work book.',
    ],
    choices: [],
  },
  {
    id: 'ending-road', title: 'A library with muddy shoes', place: 'Beyond the lane',
    ending: { number: 'II', name: 'A place carried', consequence: 'The books leave in your keeping. The room is gone; the library will need you to stop and share it.' },
    paragraphs: [
      'Outside, the door closes with the click of a suitcase. When you look back there is a wall, still wet from the night\'s rain. You can see the place where you once rested a shopping bag to mend its handle. This time you do not mistake the absence for nothing having happened.',
      { text: 'Your first stop is your own kitchen. You put the orchard book on the table where you wrote the letter. At noon a neighbour comes to borrow a pan and stays to read about a house that needed its hinges persuaded. The first loan is entered on the back of the gas bill.', when: { all: ['homeward'] } },
      { text: 'At the first station, you sit beside the closed kiosk and put the book on your knees. A track worker asks whether it is a timetable. "Partly," you say. He misses one train reading Ida Pell\'s register. Before the next arrives, he writes down an address where you would be welcome.', when: { all: ['outward'] } },
      { text: 'Mina has written three bakery addresses on the parcel paper. "They open early," she told you. "Tell them I sent you. Don\'t let them give you yesterday\'s rolls." The library has acquired a route more useful than a railway line.', when: { all: ['witness'] } },
      'Some evenings you miss the table so precisely that your hands expect its edge. The spoon helps less than you hoped. But the book opens a little wider each time someone returns to it. The last chapter of the orchard remains unfinished, now in several different handwritings.',
      'Nell sends a postcard from her sister\'s. On the front is an unremarkable roundabout. On the back: The upstairs neighbour plays the trumpet badly. I am very happy.',
    ],
    choices: [],
  },
  {
    id: 'ending-keeper', title: 'The handwriting after Nell\'s', place: 'Your first morning at the counter',
    ending: { number: 'III', name: 'A place kept', consequence: 'Nell is free to leave. You accept the shop, including the ordinary work and the life it will ask of you.' },
    paragraphs: [
      'Your name looks temporary underneath Nell\'s. The pencil has made one letter too dark; you resist the wish to rub it out. Nell reads it, puts a finger on the page to keep her place, and tells you where the fuse box is.',
      'That is the first lesson. The second is that the stove draws badly in an east wind. The third concerns a drawer that must be lifted before it can be pulled. There is no ceremony. She gives you the small practical instructions with which one person leaves another in charge of a life.',
      { text: 'Your return address is still in your pocket. You pin it above the counter, not as a route you have betrayed but as a place you must remember to write to. Staying will require arrangements, not the disappearance of everyone who knew you before.', when: { all: ['address'] } },
      { text: 'You bank the stove over the last ash of your letter. You have not recovered the old house. You have agreed to maintain a different one, and this distinction seems worth keeping clear.', when: { all: ['letter-burned'] } },
      { text: 'Mina taps on the window with two bowls nested in her hands. "For lunch," she mouths. You make a note beside the list of fuses: let other people help.', when: { all: ['witness'] } },
      { text: 'The unclaimed parcel still waits on its shelf. You straighten its label. You are its keeper now, not necessarily its carrier. One evening the right person may put a hand on the door.', when: { all: ['parcel-left'] } },
      'Nell leaves after showing you how the lamp comes apart for cleaning. For a while you stand in the room listening to the river. Then you wash both cups, put the kettle on, and move the chair back from the table. Outside, someone stops in the rain to read the notice.',
    ],
    choices: [],
  },
];

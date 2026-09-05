export const wordCategories = [
  { id: 'rooms', label: 'Rooms & rituals', description: 'The habits a room teaches you.' },
  { id: 'routes', label: 'Routes & returns', description: 'Leaving, arriving, and the bits between.' },
  { id: 'traces', label: 'Things we keep', description: 'Objects with a little time caught in them.' },
  { id: 'company', label: 'Being with others', description: 'The small distances between people.' },
  { id: 'change', label: 'Time & change', description: 'Noticing that something has already shifted.' },
  { id: 'in-between', label: 'In-between moments', description: 'When one part of you is a little ahead of another.' },
] as const;

export type WordCategory = (typeof wordCategories)[number]['id'];

export interface DictionaryEntry {
  id: string;
  word: string;
  pronunciation: string;
  partOfSpeech: 'noun' | 'verb' | 'adjective';
  category: WordCategory;
  definition: string;
  example: string;
  observation: string;
  related: readonly string[];
}

// All headwords, definitions, and examples are original fictional writing.
// Pronunciations are informal English syllable guides, not historical claims.
export const entries: readonly DictionaryEntry[] = [
  {
    id: 'afterstep',
    word: 'afterstep',
    pronunciation: 'AF-ter-step',
    partOfSpeech: 'noun',
    category: 'routes',
    definition: 'The first step toward an old destination, taken by habit after your reason for going there has ended.',
    example: 'Three weeks after moving, I still made an afterstep toward the bakery on my old street before remembering which way home was.',
    observation: 'Your feet can be the last part of you to receive the news.',
    related: ['mapmolt', 'pocketward', 'keyafter'],
  },
  {
    id: 'almostory',
    word: 'almostory',
    pronunciation: 'awl-MOS-tuh-ree',
    partOfSpeech: 'noun',
    category: 'company',
    definition: 'A harmless error in a shared memory that you leave uncorrected because everyone has grown fond of telling it that way.',
    example: 'In the family almostory, we ate our picnic in a thunderstorm. It was actually the station sprinkler, but I no longer interrupt.',
    observation: 'Not a lie you set out to tell. A story that has acquired a slightly different address.',
    related: ['namehover', 'hushfare', 'shelfheld'],
  },
  {
    id: 'awayettle',
    word: 'awayettle',
    pronunciation: 'uh-WAY-et-ul',
    partOfSpeech: 'noun',
    category: 'rooms',
    definition: 'The second of belonging you feel when a kettle in an unfamiliar kitchen makes the same small click as the one at home.',
    example: 'On my first morning of house-sitting, a little awayettle reached me from the kitchen before I remembered whose house this was.',
    observation: 'Sometimes it is the lid, not the whistle. Recognition does not always need the whole sound.',
    related: ['guestgrain', 'doorhush', 'windowkin'],
  },
  {
    id: 'borrowglow',
    word: 'borrowglow',
    pronunciation: 'BOR-oh-gloh',
    partOfSpeech: 'noun',
    category: 'company',
    definition: 'A brief change in confidence brought on by wearing someone else\'s coat, as if its familiar posture came with it.',
    example: 'In Ada\'s heavy green coat I had enough borrowglow to ask the shopkeeper to open the locked cabinet.',
    observation: 'Returning the coat can feel like giving back a very small permission.',
    related: ['yesterfit', 'guestgrain', 'underhello'],
  },
  {
    id: 'cupremain',
    word: 'cupremain',
    pronunciation: 'KUP-rih-mayn',
    partOfSpeech: 'noun',
    category: 'traces',
    definition: 'A guest\'s cup left unwashed for a little while, because clearing it would make their departure feel finished.',
    example: 'I washed everything except the blue mug; that cupremain could stay beside the sink until morning.',
    observation: 'The tea is cold. That is not quite the point.',
    related: ['doorhush', 'lastwarm', 'ticketender'],
  },
  {
    id: 'doorhush',
    word: 'doorhush',
    pronunciation: 'DOR-hush',
    partOfSpeech: 'noun',
    category: 'rooms',
    definition: 'The particular quiet just after a visitor\'s latch clicks shut, before you make the first ordinary noise of being alone again.',
    example: 'I stood through the doorhush with two plates in my hands, then turned on the tap.',
    observation: 'It lasts until a cupboard, a cough, or a radio lets the room begin its next sentence.',
    related: ['cupremain', 'hushfare', 'outquiet'],
  },
  {
    id: 'errandrift',
    word: 'errandrift',
    pronunciation: 'EH-run-drift',
    partOfSpeech: 'noun',
    category: 'routes',
    definition: 'An unnecessary extra block walked after the last errand, when you are no longer required anywhere and are not yet ready to go home.',
    example: 'With the parcel posted and the bread bought, I took an errandrift past the closed swimming pool.',
    observation: 'The bag in your hand gives an aimless walk a convincing disguise.',
    related: ['quieturn', 'waitweight', 'afterstep'],
  },
  {
    id: 'framepale',
    word: 'framepale',
    pronunciation: 'FRAYM-payl',
    partOfSpeech: 'noun',
    category: 'traces',
    definition: 'The unfaded rectangle left by a picture taken off a wall; a place remembering what it held more precisely than you do.',
    example: 'Once the painting was packed, its framepale made the empty room look unexpectedly furnished.',
    observation: 'A trace can be made of what did not happen: sunlight that never reached the paint.',
    related: ['keyafter', 'cupremain', 'roomtide'],
  },
  {
    id: 'guestgrain',
    word: 'guestgrain',
    pronunciation: 'GEST-grayn',
    partOfSpeech: 'noun',
    category: 'rooms',
    definition: 'The small knowledge you accumulate while staying in someone else\'s home: the complaining stair, the reluctant tap, the drawer that is not for spoons.',
    example: 'By Sunday I had enough guestgrain to get a glass of water without waking the dog or opening the wrong cupboard.',
    observation: 'You can learn the grain of a place without ever owning a piece of it.',
    related: ['awayettle', 'borrowglow', 'visitide'],
  },
  {
    id: 'hushfare',
    word: 'hushfare',
    pronunciation: 'HUSH-fair',
    partOfSpeech: 'noun',
    category: 'company',
    definition: 'The last deliberately unimportant sentence in a long goodbye, said because the important things are finished but neither person has reached for the door.',
    example: '"That umbrella might be yours," I offered as a hushfare, though we both knew it was not.',
    observation: 'Weather is often asked to do this small piece of work.',
    related: ['doorhush', 'namehover', 'visitide'],
  },
  {
    id: 'inboxweather',
    word: 'inboxweather',
    pronunciation: 'IN-boks-weh-ther',
    partOfSpeech: 'noun',
    category: 'in-between',
    definition: 'A change in the atmosphere of your morning caused by a sender\'s name, before you have opened the message or learned what it says.',
    example: 'An email from my old workshop brought such inboxweather that I let my toast cool while looking at the unopened subject line.',
    observation: 'The message itself may turn out to be about a spare set of chairs.',
    related: ['waitweight', 'yesidue', 'namehover'],
  },
  {
    id: 'keyafter',
    word: 'keyafter',
    pronunciation: 'KEE-af-ter',
    partOfSpeech: 'noun',
    category: 'traces',
    definition: 'The hesitation before letting go of a key that still looks perfectly capable of opening a door you no longer have a right or a reason to enter.',
    example: 'The landlord had changed the lock years ago, but keyafter kept the little brass key in my desk.',
    observation: 'An obsolete key does not look obsolete. This is part of the trouble.',
    related: ['afterstep', 'framepale', 'pocketward'],
  },
  {
    id: 'lastwarm',
    word: 'lastwarm',
    pronunciation: 'LAST-warm',
    partOfSpeech: 'noun',
    category: 'change',
    definition: 'The warmth still held by a chair after someone leaves it, encountered when you move into their place a moment too soon.',
    example: 'I sat down to finish the crossword and found my father\'s lastwarm still in the chair.',
    observation: 'A very brief overlap between being here and having been here.',
    related: ['cupremain', 'doorhush', 'framepale'],
  },
  {
    id: 'mapmolt',
    word: 'mapmolt',
    pronunciation: 'MAP-mohlt',
    partOfSpeech: 'verb',
    category: 'routes',
    definition: 'To outgrow a shortcut because your new routines no longer take you to either end of it, even though the path itself has not changed.',
    example: 'After the evening classes ended, I mapmolted the alley behind the cinema; saving three minutes no longer saved me anything.',
    observation: 'A city can lose a passage without laying a single brick.',
    related: ['afterstep', 'errandrift', 'yesterfit'],
  },
  {
    id: 'namehover',
    word: 'namehover',
    pronunciation: 'NAYM-huv-er',
    partOfSpeech: 'noun',
    category: 'company',
    definition: 'The pause before writing an old nickname, when you are no longer sure whether your closeness still gives you permission to use it.',
    example: 'There was a long namehover at the top of the birthday card before I wrote her full first name.',
    observation: 'The pen is waiting for an answer the address book cannot provide.',
    related: ['hushfare', 'almostory', 'underhello'],
  },
  {
    id: 'outquiet',
    word: 'outquiet',
    pronunciation: 'OWT-kwy-et',
    partOfSpeech: 'noun',
    category: 'rooms',
    definition: 'The silence of a familiar sound failing to arrive at its usual hour, which reveals that you had been listening for it all along.',
    example: 'The first outquiet after the upstairs neighbor moved came at six, when nobody rolled a suitcase across the ceiling.',
    observation: 'Some routines only become audible when they stop.',
    related: ['awayettle', 'windowkin', 'doorhush'],
  },
  {
    id: 'pocketward',
    word: 'pocketward',
    pronunciation: 'POK-it-werd',
    partOfSpeech: 'noun',
    category: 'change',
    definition: 'A reflexive pocket check for something you have intentionally handed back, rather than lost: a work pass, a borrowed key, a visitor\'s badge.',
    example: 'All the way home from my last shift, pocketward kept sending my hand toward a pass I had already returned.',
    observation: 'An empty pocket can be correct and still feel like a mistake.',
    related: ['afterstep', 'keyafter', 'yesidue'],
  },
  {
    id: 'quieturn',
    word: 'quieturn',
    pronunciation: 'KWY-uh-turn',
    partOfSpeech: 'verb',
    category: 'routes',
    definition: 'To turn off the music a little before arriving, so that your own thoughts can reach the destination before you have to step through its door.',
    example: 'I quieturned two streets before the house and let the last part of the drive be only tires and rain.',
    observation: 'Not because the music is wrong. Because the next room will ask you to be present.',
    related: ['errandrift', 'doorhush', 'waitweight'],
  },
  {
    id: 'roomtide',
    word: 'roomtide',
    pronunciation: 'ROOM-tyde',
    partOfSpeech: 'noun',
    category: 'rooms',
    definition: 'The slow drift of a shared room toward one person\'s habits while the other is away, noticed most clearly on their return.',
    example: 'A week of roomtide had moved my books onto both ends of the sofa and her reading lamp beside my chair.',
    observation: 'Usually not a territorial claim. More often, the quiet gravity of convenience.',
    related: ['guestgrain', 'framepale', 'visitide'],
  },
  {
    id: 'shelfheld',
    word: 'shelfheld',
    pronunciation: 'SHELF-held',
    partOfSpeech: 'adjective',
    category: 'traces',
    definition: 'Of an unread book: kept because beginning it still feels like a small future appointment with the person who gave it to you.',
    example: 'The atlas stayed shelfheld for years, its penciled dedication doing more work than any of the maps.',
    observation: 'This is not quite the same thing as meaning to read it soon.',
    related: ['ticketender', 'almostory', 'cupremain'],
  },
  {
    id: 'ticketender',
    word: 'ticketender',
    pronunciation: 'TIK-it-en-der',
    partOfSpeech: 'noun',
    category: 'traces',
    definition: 'A canceled ticket kept as evidence that an unmade journey was once real enough to have a seat number and a departure time.',
    example: 'The ferry never sailed, but its ticketender remained behind my library card for the rest of the winter.',
    observation: 'You are keeping a reservation, but no longer with the travel company.',
    related: ['zipstill', 'shelfheld', 'yesidue'],
  },
  {
    id: 'underhello',
    word: 'underhello',
    pronunciation: 'UN-der-heh-loh',
    partOfSpeech: 'noun',
    category: 'company',
    definition: 'The almost-greeting exchanged with a regular stranger before either of you has decided that seeing each other every morning counts as knowing each other.',
    example: 'For a month the woman at the bus stop and I traded an underhello: half a nod, then a careful interest in the road.',
    observation: 'The first actual hello may make both people pretend to be a little surprised.',
    related: ['windowkin', 'namehover', 'borrowglow'],
  },
  {
    id: 'visitide',
    word: 'visitide',
    pronunciation: 'VIZ-ih-tyde',
    partOfSpeech: 'noun',
    category: 'change',
    definition: 'The turn during a visit when counting the days until you can go home becomes counting how few mornings you have left here.',
    example: 'Visitide arrived over Thursday\'s breakfast, and suddenly I wanted to learn exactly how my aunt made the eggs.',
    observation: 'The return ticket has not changed. Only the direction in which you are reading it.',
    related: ['guestgrain', 'hushfare', 'roomtide'],
  },
  {
    id: 'waitweight',
    word: 'waitweight',
    pronunciation: 'WAYT-wayt',
    partOfSpeech: 'noun',
    category: 'in-between',
    definition: 'The disproportionate space a small appointment occupies in the hours before it, making even a ten-minute task feel impossible to begin.',
    example: 'The plumber was due at three; waitweight had somehow claimed the whole morning and a perfectly usable lunch break.',
    observation: 'An empty hour is not always an available hour.',
    related: ['inboxweather', 'errandrift', 'quieturn'],
  },
  {
    id: 'windowkin',
    word: 'windowkin',
    pronunciation: 'WIN-doh-kin',
    partOfSpeech: 'noun',
    category: 'company',
    definition: 'An unseen neighbor whose lighted window keeps similar hours to yours, providing company without an introduction or even a visible face.',
    example: 'During the late shifts, the square of yellow across the courtyard became my windowkin.',
    observation: 'You know almost nothing about each other, except that neither room is quite the only one awake.',
    related: ['underhello', 'outquiet', 'awayettle'],
  },
  {
    id: 'yesidue',
    word: 'yesidue',
    pronunciation: 'YES-ih-dyoo',
    partOfSpeech: 'noun',
    category: 'in-between',
    definition: 'The small preparations your mind keeps making for an invitation you have already declined, as if an earlier yes had left a faint outline.',
    example: 'I had said I could not come, but yesidue still had me checking the last train home from the dinner.',
    observation: 'A decision can be settled before all its little errands have heard.',
    related: ['waitweight', 'ticketender', 'pocketward'],
  },
  {
    id: 'yesterfit',
    word: 'yesterfit',
    pronunciation: 'YES-ter-fit',
    partOfSpeech: 'adjective',
    category: 'change',
    definition: 'Of a garment: still the right size for your body, but suited to a version of your life you no longer inhabit.',
    example: 'The interview jacket was perfectly yesterfit: the sleeves were right, but its idea of me was not.',
    observation: 'Nothing needs mending. That can make the decision harder.',
    related: ['borrowglow', 'mapmolt', 'pocketward'],
  },
  {
    id: 'zipstill',
    word: 'zipstill',
    pronunciation: 'ZIP-stil',
    partOfSpeech: 'adjective',
    category: 'routes',
    definition: 'Of a packed bag: left closed after a journey is postponed, so that departure can remain a possibility rather than become a task to undo.',
    example: 'After the snow canceled our train, the suitcase stayed zipstill beside the door until Tuesday.',
    observation: 'Unpacking sometimes feels more final than the cancellation.',
    related: ['ticketender', 'yesidue', 'visitide'],
  },
];

export const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
export const availableLetters = [...new Set(entries.map((entry) => entry.word[0].toUpperCase()))];
export const favoritesStorageKey = 'odd-index:almost:favorites:v1';

export interface StoredFavorites {
  version: 1;
  ids: string[];
}

export interface LexiconFilters {
  search: string;
  letter: string;
  category: WordCategory | 'all';
  keptOnly: boolean;
}

export function validateFavorites(value: unknown): value is StoredFavorites {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.version === 1
    && Array.isArray(candidate.ids)
    && candidate.ids.length <= entries.length
    && candidate.ids.every((id: unknown) => typeof id === 'string' && entriesById.has(id))
    && new Set(candidate.ids).size === candidate.ids.length;
}

export function filterEntries(filters: LexiconFilters, favorites: ReadonlySet<string>): DictionaryEntry[] {
  const terms = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    if (filters.keptOnly && !favorites.has(entry.id)) return false;
    if (filters.letter && !entry.word.toUpperCase().startsWith(filters.letter)) return false;
    if (filters.category !== 'all' && filters.category !== entry.category) return false;
    const searchable = `${entry.word} ${entry.definition} ${entry.example}`.toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

export function categoryLabel(category: WordCategory): string {
  return wordCategories.find((item) => item.id === category)?.label ?? category;
}

export function formatEntry(entry: DictionaryEntry): string {
  const related = entry.related.map((id) => entriesById.get(id)?.word).filter(Boolean);
  return [
    entry.word,
    `${entry.pronunciation} | ${entry.partOfSpeech} | ${categoryLabel(entry.category)}`,
    '',
    entry.definition,
    '',
    `In a sentence: "${entry.example}"`,
    `A small note: ${entry.observation}`,
    `See also: ${related.join(', ')}`,
    '',
    'A Dictionary of Almost - an original fictional coinage, not an attested language term.',
  ].join('\n');
}

export function surpriseEntry(currentId: string | null, random: () => number = Math.random): DictionaryEntry {
  const alternatives = entries.filter((entry) => entry.id !== currentId);
  const pool = alternatives.length ? alternatives : entries;
  const entry = pool[Math.floor(random() * pool.length)];
  if (!entry) throw new Error('The dictionary needs at least one entry to open at random.');
  return entry;
}

export type DestinationId =
  | 'aster-quay'
  | 'bellwether-steps'
  | 'morrowmere'
  | 'threadfall'
  | 'orchard-of-tides'
  | 'paper-fen'
  | 'cinderstep'
  | 'lantern-end';

export interface Destination {
  id: DestinationId;
  name: string;
  region: string;
  point: { x: number; y: number };
  postalCode: string;
  title: string;
  caption: string;
  date: string;
  weather: string;
  custom: string;
  teaser: string;
  salutation: string;
  paragraphs: readonly string[];
  signoff: string;
  sender: string;
  address: readonly string[];
  enclosure: string;
  marginNote: string;
}

export const destinations: readonly Destination[] = [
  {
    id: 'aster-quay',
    name: 'Aster Quay',
    region: 'The blue coast',
    point: { x: 65, y: 72 },
    postalCode: 'AQ / 01',
    title: 'The chair at the end of the pier',
    caption: 'Where the harbor keeps a light for stragglers.',
    date: 'The third day of the rain',
    weather: 'Rain until supper. A little blue after.',
    custom: 'A spare chair for the last person off the ferry.',
    teaser: 'Nobody asked whether I was expected. They just moved the kettle closer.',
    salutation: 'Dear Kit,',
    paragraphs: [
      `The ferry arrived eleven minutes after the harbor clock, which is apparently the correct way to arrive. Aster Quay is built on old enamel barges bolted together with pieces of blue-painted bridge. When the tide turns, the whole main street makes a noise like someone carefully opening a biscuit tin. I thought you would appreciate a town that announces its intentions.`,
      `There is a chair at the end of every pier. Not a bench: a proper kitchen chair, with a cushion brought indoors when it rains. The harbor clerk told me these are for whoever gets off the last boat. I tried to explain that I was only passing through. She said that passing through is tiring too, and handed me a cup with a very serious saucer.`,
      `My room is above the Bureau of Spare Rope. At six, its keeper lowers a basket of rolls to the night fishermen; at seven, somebody reels up the empty basket and a small written criticism of the crust. Yesterday's complaint was that there had not been enough of it. The baker has pinned the note in her window. I have never seen anyone look so pleased about an official grievance.`,
      `I am writing on one of the pier chairs now, with my coat over my knees. Nobody asked whether I was expected. They just moved the kettle closer. I keep thinking about your kitchen, and how I always stand in the doorway as if I need an appointment. When I get back, remind me that I am allowed to sit down. You are allowed to do that too.`,
    ],
    signoff: 'Leaving the chair out for you,',
    sender: 'Mara',
    address: ['Kit', 'The room above the bicycle shop', '17 Ordinary Street', 'Home, approximately'],
    enclosure: 'One blue thread from the ferry cushion.',
    marginNote: 'The corner got wet. The important part did not.',
  },
  {
    id: 'bellwether-steps',
    name: 'Bellwether Steps',
    region: 'The stair country',
    point: { x: 180, y: 48 },
    postalCode: 'BS / 02',
    title: 'A landing is a place, too',
    caption: 'A hillside town with time between the steps.',
    date: 'Monday, after the stairs returned',
    weather: 'A dry wind carrying somebody else\'s laundry.',
    custom: 'Lunch on the landing, never on the climb.',
    teaser: 'A landing is not a failed staircase. It is where you put the shopping down.',
    salutation: 'Dear Kit,',
    paragraphs: [
      `I have climbed into a town the color of apricot jam. Every house in Bellwether Steps has a front door on one street and a kitchen window on the next street up. Shopping travels in little baskets on pulleys. People travel the long way, carrying the things that cannot be put in baskets: hot soup, a sleeping child, unusually large opinions.`,
      `On Sundays the public stairs are unbolted and rearranged. Nobody can agree whether this began as a safety inspection or an attempt to make the postmaster take a holiday. Either way, Monday's first municipal duty is to chalk fresh arrows on the walls. I followed an old arrow this morning and arrived in a woman's pantry. She gave me an onion for the inconvenience, though I am not sure whose.`,
      `My host, Leda, takes lunch on the landing halfway to her own flat. There is a shelf for the plates and a bell you ring if you have made too much. Today a man from the roof-repair office came down with two forks and no explanation. We ate tomatoes while the town climbed around us. Leda says a landing is not a failed staircase. It is where you put the shopping down.`,
      `You wrote that everyone seems to be getting somewhere while you are still deciding. I wish I could send you this landing rather than a picture of it. There is room for three chairs and a pot of basil, which seems a respectable amount of somewhere. No need to answer with a plan. Tell me what you had for lunch.`,
    ],
    signoff: 'Halfway up, quite happily,',
    sender: 'Mara',
    address: ['Kit', 'Above the bicycle shop', '17 Ordinary Street', 'No need to hurry upstairs'],
    enclosure: 'A paper arrow, pointing toward lunch.',
    marginNote: 'Please do not trust any directions written on a Sunday.',
  },
  {
    id: 'morrowmere',
    name: 'Morrowmere',
    region: 'The stillwater reach',
    point: { x: 318, y: 61 },
    postalCode: 'MM / 03',
    title: 'The morning can wait',
    caption: 'Still water, late breakfasts, an unhurried moon.',
    date: 'A morning with two moons',
    weather: 'Pearl-colored fog, lifting by the second breakfast.',
    custom: 'No sweeping the boardwalk before the moon is gone.',
    teaser: 'For once, being awake did not have to become being useful.',
    salutation: 'Dear Kit,',
    paragraphs: [
      `The lake at Morrowmere holds on to the moon after the sky has finished with it. I cannot offer you a sensible explanation. I can report that the reflection was still there at breakfast, caught between two laundry poles, and that the waiter moved our table so I could see. The houses stand on blue stilts. Beneath each one is a second house, less expensive to maintain.`,
      `There is a rule against sweeping the boardwalk until the last moon has gone. The posted reason is to avoid disturbing the water. The woman who sells brushes says the real reason is that her grandfather hated getting up early, but the council had already paid for a very handsome sign. Whatever its origin, the rule means the entire town spends its first hour doing very little with considerable dignity.`,
      `I woke before dawn and went outside, prepared to feel lonely about it. A man in slippers was fishing for his own umbrella. He loses it every Tuesday because he uses it to check the lake's depth, and every Tuesday he forgets the string. We watched the handle drift under a bridge. He said it was a fine umbrella but a disappointing measuring instrument. Then he offered me half his orange.`,
      `I remember you saying that the nights have been long lately. I cannot shorten them from here. But I sat beside that water without making a list, and for once, being awake did not have to become being useful. If you find yourself in the kitchen at four, consider this permission to eat an orange very slowly. Somewhere in this invented distance, I will sit with you.`,
    ],
    signoff: 'Until the water lets go of the moon,',
    sender: 'Mara',
    address: ['Kit', 'The quiet window over the bicycle shop', '17 Ordinary Street', 'Deliver after breakfast'],
    enclosure: 'A drawing of the umbrella, not to scale.',
    marginNote: 'The moon in the picture is the second one.',
  },
  {
    id: 'threadfall',
    name: 'Threadfall',
    region: 'The high crossings',
    point: { x: 346, y: 171 },
    postalCode: 'TF / 04',
    title: 'What the knots are for',
    caption: 'A town held together by things worth mending.',
    date: 'The day the west wind changed its mind',
    weather: 'Crosswinds, with a brief spell of flying socks.',
    custom: 'Leave a length of thread with whatever you borrow.',
    teaser: 'Nothing here is held together by pretending it has never come apart.',
    salutation: 'Dear Kit,',
    paragraphs: [
      `Threadfall hangs between two cliffs on ropes thicker than my waist. The houses are light wooden boxes, painted coral so the bridge inspectors can see them in fog. Each has a little wind sock instead of a weather vane. At dusk they all point toward the bakery, which is either a local wind pattern or a remarkably persuasive smell.`,
      `Before crossing, you must visit the municipal knot inspector. She does not weigh your luggage; she asks whether anything in it will roll. I confessed to three oranges from Morrowmere. She wrapped each one in a sock and stamped my ticket with a small picture of a sensible knot. Halfway over, the bridge began to hum. Nobody else looked concerned, so I tried to hear it as music.`,
      `My coat tore on a nail outside the post office. The clerk lent me a needle, and I asked if he had any matching thread. He looked genuinely puzzled. Repairs here are made in a different color so the next person knows where to be gentle. His own sleeve was a map of yellow seams. Nothing here is held together by pretending it has never come apart.`,
      `I have been carrying our last argument around like something breakable that ought not to rattle. Perhaps I can put it down plainly: I am sorry I made leaving sound easier than staying. Neither of us needed to win that conversation. I will come home with an orange in each sock and one rather conspicuous red seam. You can tell me where to be gentle.`,
    ],
    signoff: 'Tied on, not tied down,',
    sender: 'Mara',
    address: ['Kit', 'The room above the bicycle shop', '17 Ordinary Street', 'Handle the seam gently'],
    enclosure: 'Enough red thread for a small repair.',
    marginNote: 'Do not untie the envelope in a crosswind.',
  },
  {
    id: 'orchard-of-tides',
    name: 'Orchard of Tides',
    region: 'The salt gardens',
    point: { x: 289, y: 253 },
    postalCode: 'OT / 05',
    title: 'Breakfast, when the sea permits',
    caption: 'The trees wear the tide around their ankles.',
    date: 'Low water, just before toast',
    weather: 'Salt mist and a sun the color of a peach stone.',
    custom: 'Set one more place than the table appears to need.',
    teaser: 'She said a table should be slightly more hopeful than its owners.',
    salutation: 'Dear Kit,',
    paragraphs: [
      `Here the orchard grows in seawater. At low tide the trunks stand on the sand in their white salt stockings; at high tide you pick fruit from a boat. The apples have thin porcelain skins and taste faintly of the sea. They must be carried in wool-lined baskets, which explains why the shepherd and the orchard keeper share an office and rarely agree on its opening hours.`,
      `Breakfast is served according to the tide table, not the clock. I was invited for toast at what I considered a perfectly unreasonable hour, and found twelve cheerful people eating by lantern light. The jam was pink, the butter was salty, and the woman beside me had come straight from rescuing a ladder. Unsecured ladders are the principal civic nuisance. There is a committee, naturally.`,
      `My host puts an extra plate out at every meal. Not for a ghost or an absent sailor: for anyone who mistakes the orchard path for the road to the ferry. I asked how often that happens. She said a table should be slightly more hopeful than its owners. That is not an answer a statistician could use, but it has been a very good answer for me.`,
      `I have your note. Thank you for telling me about the blue cup. Please do not throw it away because of the broken handle; it already survived the shelf collapsing and your brief enthusiasm for pottery repair. Put a stem of something in it. If the trees here can find a use for a sea where the ground should be, I think our kitchen can find a use for a cup that cannot hold tea.`,
    ],
    signoff: 'With salt on absolutely everything,',
    sender: 'Mara',
    address: ['Kit', 'Above the bicycle shop', '17 Ordinary Street', 'Beside the blue cup'],
    enclosure: 'A tide table with breakfast circled.',
    marginNote: 'The small stain is jam. I checked.',
  },
  {
    id: 'paper-fen',
    name: 'Paper Fen',
    region: 'The folded lowlands',
    point: { x: 168, y: 225 },
    postalCode: 'PF / 06',
    title: 'Instructions for an imperfect boat',
    caption: 'Fold along the water. Leave room for the rain.',
    date: 'Between the first and second showers',
    weather: 'Soft rain; a dry square beneath every eave.',
    custom: 'Give a departing neighbor a useful fold.',
    teaser: 'It floated badly, then better. Nobody mistook that for a character flaw.',
    salutation: 'Dear Kit,',
    paragraphs: [
      `The roofs in Paper Fen are folded, not built. The paper is made from reeds, rubbed with wax, and quite capable of keeping the rain out, provided nobody gets ambitious with the creases. The houses have wide pleated eaves and little folded chimneys. Every spring the flood office issues a notice asking residents not to turn their sheds into boats without first disconnecting the stove.`,
      `The stationer showed me a sheet that becomes a bowl, a hat, or a moderately convincing duck. He was disappointed that I chose the bowl. I tried to explain about the oranges, but by then he had folded me a duck as well. People here give visitors a useful fold when they leave. I have already been given a seed packet, a funnel, and something that may be a municipal parking restriction.`,
      `A child on the towpath asked me to help launch her boat. One side was taller than the other, and it leaned as if listening to the water. We moved a pebble twice and folded the corner back. It floated badly, then better. Nobody mistook that for a character flaw. When it finally rounded the reeds, she waved goodbye with both hands, entirely unconcerned about getting it back.`,
      `I thought about all the letters I started before this journey and never posted because the sentences were not quite right. Perhaps a sentence only needs to carry one honest thing across. Here is mine: I miss you. Not elegantly or at the right time of day. Just often, and in the middle of ordinary things. I am folding this one before I can improve it out of existence.`,
    ],
    signoff: 'Along the dotted line,',
    sender: 'Mara',
    address: ['Kit', 'The room above the bicycle shop', '17 Ordinary Street', 'Unfold here'],
    enclosure: 'A slightly uneven boat, flattened for travel.',
    marginNote: 'Fold it back into a boat after reading, if you like.',
  },
  {
    id: 'cinderstep',
    name: 'Cinderstep',
    region: 'The ember country',
    point: { x: 78, y: 204 },
    postalCode: 'CS / 07',
    title: 'The warmth we borrow',
    caption: 'An ember-colored town with a spare place by the oven.',
    date: 'Friday, while the kilns were cooling',
    weather: 'A clear sky and a fine dusting of red clay.',
    custom: 'Borrow the oven\'s last warmth. Return it with bread.',
    teaser: 'The warmth had already been paid for. The kindness was in noticing who needed it.',
    salutation: 'Dear Kit,',
    paragraphs: [
      `Cinderstep smells of hot clay and orange peel. The town is cut into a rust-red hill, with black stone stairs worn smooth down the middle. Every doorstep holds a pot that did not quite come out as intended. The potters use them for keys, cuttings, and rainwater. The grandest house on the square has a very lopsided bowl beside its very straight brass nameplate.`,
      `The communal kilns fire on Thursdays. On Fridays, when they are cooling, people bring bread dough, wet boots, and elderly dogs to borrow the remaining heat. There is a schedule nailed to a post: bread first, boots on the shelf, dogs wherever they are comfortable. I sat between a basket of socks and a terrier who had plainly reserved my spot before I arrived.`,
      `The kiln keeper has a ledger, but it records what people baked rather than what they owe. She says it helps when someone cannot remember their own good idea. We found a page headed 'pear cake, less sugar this time' and another that simply said 'bread for the new neighbor.' The warmth had already been paid for. The kindness was in noticing who needed it.`,
      `I bought a small clay handle from a potter who sells the parts before the pots. It will not fit the blue cup, and she warned me twice, so please do not mistake this for a repair plan. I bought it because it fits exactly in my palm. Sometimes a useful thing has not met its use yet. I think I am ready to come home before I have worked out all of mine.`,
    ],
    signoff: 'Still warm from the kiln,',
    sender: 'Mara',
    address: ['Kit', 'Above the bicycle shop', '17 Ordinary Street', 'Keep somewhere warm'],
    enclosure: 'A thumbprint in a scrap of red clay.',
    marginNote: 'There may be clay dust. There is always clay dust.',
  },
  {
    id: 'lantern-end',
    name: 'Lantern End',
    region: 'The far blue',
    point: { x: 123, y: 133 },
    postalCode: 'LE / 08',
    title: 'Leave the little light on',
    caption: 'The last stop is a good place to begin coming home.',
    date: 'The longest blue evening',
    weather: 'Dry snow, with a sky full of small clearings.',
    custom: 'Light the low lantern for someone on their way.',
    teaser: 'I used to think coming home required a better version of the person who left.',
    salutation: 'Dear Kit,',
    paragraphs: [
      `At Lantern End the snow is blue until you bring it inside, when it becomes the usual inconvenience. Houses are painted dark so people can find their own doors. Every porch has two lanterns: a high one to light the street and a low one to show that somebody is expected. The low lanterns are made from waxed onion paper. Even the light has a faint memory of soup.`,
      `The tram has two stops and a conductor who announces the view between them. Tonight the view was 'same hill, but with a fox.' At the terminus, passengers hand in any mittens they found along the way. These are clipped to a line behind the ticket desk. You may take an unmatched pair without paperwork. A matching pair requires the conductor to make a small congratulatory speech.`,
      `I have booked the morning boat. My bag contains less than I meant to bring back and rather more thread. I used to think coming home required a better version of the person who left. Someone braver, tidier, able to explain the whole journey over dinner. But the woman at the guesthouse asked only whether I would like an egg before I go. Yes, I said. That was enough preparation for the moment.`,
      `Leave the little light on, if you are awake. If you are asleep, leave it off; I know where the spare key lives. We can put the blue cup on the windowsill and go out for bread. I have plenty to tell you, but none of it needs to happen on the doorstep. First, I would like to sit in the kitchen. First, I would like to hear how you have been.`,
    ],
    signoff: 'On my way,',
    sender: 'Mara',
    address: ['Kit', 'The light above the bicycle shop', '17 Ordinary Street', 'I know the rest of the way'],
    enclosure: 'A tram ticket, good for one remembered fox.',
    marginNote: 'This is the last postcard. It is not a goodbye.',
  },
];

export interface SavedLetters {
  version: 1;
  ids: DestinationId[];
}

export const storageKey = 'letters-from-elsewhere:kept:v1';

export function isDestinationId(value: unknown): value is DestinationId {
  return typeof value === 'string' && destinations.some((destination) => destination.id === value);
}

export function isSavedLetters(value: unknown): value is SavedLetters {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.ids) || record.ids.length > destinations.length) return false;
  return record.ids.every(isDestinationId)
    && new Set(record.ids).size === record.ids.length
    && Object.keys(record).every((key) => key === 'version' || key === 'ids');
}

export function letterWordCount(destination: Destination): number {
  return destination.paragraphs.join(' ').trim().split(/\s+/).length;
}

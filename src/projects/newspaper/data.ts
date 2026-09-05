export type SectionId = 'city' | 'off-world' | 'living' | 'culture' | 'opinion';
export type IllustrationId = 'cloud' | 'seeds' | 'train' | 'river' | 'repair' | 'shadow' | 'clock';

export interface NewspaperSection {
  id: SectionId;
  name: string;
  description: string;
  number: string;
}

export interface Story {
  id: string;
  section: SectionId;
  kicker: string;
  title: string;
  standfirst: string;
  author: string;
  role: string;
  dateline: string;
  illustration: IllustrationId;
  imageDescription: string;
  caption: string;
  paragraphs: string[];
  pullQuote: string;
  sidebar: {
    title: string;
    items: { label: string; text: string }[];
    note: string;
  };
}

export const edition = {
  date: '18 September 2086',
  isoDate: '2086-09-18',
  place: 'Port Meridian · Earth',
  number: 'Vol. 01 / No. 01',
  theme: 'The things we hold in common',
};

export const sections: NewspaperSection[] = [
  { id: 'city', name: 'City & commons', number: '01', description: 'Who gets the shade, who hears the train, and how a city makes room for its people.' },
  { id: 'off-world', name: 'Off-world', number: '02', description: 'Letters from beyond Earth, where even the smallest living thing needs a carefully written agreement.' },
  { id: 'living', name: 'Living systems', number: '03', description: 'The other inhabitants of Port Meridian, and the infrastructure we are learning to share.' },
  { id: 'culture', name: 'Culture', number: '04', description: 'Sounds worth mending, shadows worth studying, and the everyday work of paying attention.' },
  { id: 'opinion', name: 'Opinion', number: '05', description: 'An argument for leaving something unfinished, unbooked, and available to a stranger.' },
];

export const stories: Story[] = [
  {
    id: 'cloud-library',
    section: 'city',
    kicker: 'The public sky',
    title: 'You can now borrow a cloud',
    standfirst: 'Port Meridian has opened the sky to library-card holders. The difficult part is deciding who gets the shade.',
    author: 'Inez Vale',
    role: 'City correspondent',
    dateline: 'East Washhouse, Port Meridian',
    illustration: 'cloud',
    imageDescription: 'An engraved cityscape beneath a billowing artificial shade cloud, suspended by four cables. A vermilion sun hangs above the rooftops.',
    caption: 'Cloud No. 3 over the east washhouse. The tethers move the shade; the cloud does not make rain. Original editorial drawing.',
    paragraphs: [
      'At seven on Monday morning, Amara Pell took a library card out of her apron and borrowed ninety minutes of sky. By eight, a pale, pleated canopy had arrived above the east washhouse courtyard. The benches cooled. Three people who had been waiting inside brought their baskets outdoors.',
      'Cloud No. 3 is not a cloud in the meteorological sense. It is a quilt of reclaimed sail mesh, suspended from cables between municipal service towers. Its overlapping pockets catch the breeze without becoming a sail. A small travelling carriage pulls it along a fixed route, filtering roughly a third of the direct sunlight below. There is no rain setting.',
      'The city’s six canopies were bought for heat emergencies. This month, the library began lending their spare hours. A resident chooses a public stopping place, checks the wind forecast with a librarian, and names someone who will meet the shade attendant. There is no charge. Clinics can recall a canopy at any time, a condition printed in unusually large type on the receipt.',
      'The first week exposed a problem that no cable could solve. Advance bookings filled before the washhouse workers finished their morning shifts. A rooftop supper club reserved three consecutive evenings, although its terrace already had an awning. On Thursday, librarians suspended private celebrations and moved half the available sessions to same-day, in-person lending. The supper club has appealed.',
      'Maintenance foreman Len Aras is more concerned about the unglamorous part of the sky. Salt collects in the pulleys. Nesting birds pull at loose stitching. Above a steady wind of six metres per second, the attendant must fold the whole apparatus into its tower, even if a birthday cake is still being cut beneath it. The trial budget includes two additional riggers, not merely the cloth.',
      'Pell wants the library to publish where the shade actually lands, rather than just who borrowed it. At the washhouse, the moving edge stopped short of the bench used by older residents. She and the attendant shifted the stopping mark by four metres. “A cloud is a public service,” she said, moving her basket. “It should notice where people sit.”',
    ],
    pullQuote: 'A cloud is a public service. It should notice where people sit.',
    sidebar: {
      title: 'A borrower’s field guide',
      items: [
        { label: '90 minutes', text: 'The maximum ordinary loan. A heat-emergency recall takes priority.' },
        { label: 'Six canopies', text: 'Each follows a fixed cable route. Borrow the shade, not a destination.' },
        { label: 'No rain', text: 'These are fabric sunshades. Weather itself remains outside the catalogue.' },
      ],
      note: 'An imagined municipal scheme, not a real service or weather forecast.',
    },
  },
  {
    id: 'moon-seed-library',
    section: 'off-world',
    kicker: 'Letter from the lunar night',
    title: 'A seed library at the edge of the lunar night',
    standfirst: 'At Faraday Station, a packet of lentils comes with a return envelope. A failed harvest is also an acceptable return.',
    author: 'Sora Finch',
    role: 'Off-world correspondent',
    dateline: 'Faraday Station, Moon',
    illustration: 'seeds',
    imageDescription: 'A cutaway lunar greenhouse holds a single branching seedling above orderly seed drawers. Earth is a small vermilion crescent over the cratered horizon.',
    caption: 'A seed, a sealed bed, a borrowed atmosphere. Faraday’s collection lives below the radiation shielding, not in exposed lunar soil.',
    paragraphs: [
      'The smallest item on the cargo manifest weighed four grams. It arrived at Faraday Station in a paper envelope, inside a sealed canister, inside a courier’s sock. The sock was for padding. The twelve lentil seeds were for the Moon’s first lending library of living plants.',
      'Librarian Mei Sol keeps the catalogue on a wall beside the station’s water ledger. Borrowers can request one packet and a tray in the shared growing room. They may return twice as many viable seeds, or a careful account of why the plants did not survive. Failure reports sit beside successful harvests, with the same shelf space and the same ink.',
      'This is less sentimental than it sounds. Every bed uses imported growing material. Water lost through leaves must be caught on a cooled panel and returned to the tank. New arrivals spend a full growth cycle in a separate room while the station checks for unwelcome microbes. A flourishing plant that contaminates a neighbouring crop is not considered a success.',
      'Sol’s first borrower, lift mechanic Tomas Ede, grew a lentil that flowered during the long lunar night. His second crop failed when a door gasket leaked and the room became too dry. He returned the dead stems and a drawing of the gasket. The next borrower found the fault before planting. “That drawing fed someone,” Sol said.',
      'A restaurant consortium has offered to finance a larger room in exchange for exclusive rights to the first locally adapted variety. The station council has refused for now. Its draft charter says a seed may be borrowed but its descendants cannot be made private. Opponents point out that a charter cannot purchase a replacement humidity pump.',
      'Meanwhile, the collection grows slowly. Sol has reserved a drawer for a bitter bean sent by her mother, who insists it belongs in a particular kind of Earth rain. There will be no rain at Faraday. There may be a cooled panel, a patient gardener, and a note explaining the difference. The envelope already has a return address.',
    ],
    pullQuote: 'That drawing fed someone.',
    sidebar: {
      title: 'What comes back',
      items: [
        { label: 'A successful loan', text: 'Return viable seeds and a short record of light, water, and growing conditions.' },
        { label: 'An unsuccessful loan', text: 'Return observations. A failed crop does not create a seed debt.' },
        { label: 'A common inheritance', text: 'The proposed charter keeps future varieties available to the station.' },
      ],
      note: 'Faraday Station and its seed-lending charter are fictional.',
    },
  },
  {
    id: 'quiet-line',
    section: 'city',
    kicker: 'On the morning line',
    title: 'The 07:12 arrives without making an entrance',
    standfirst: 'A quieter commuter train is a feat of engineering. Making sure nobody misses it is a different kind of work.',
    author: 'Tamsin Reed',
    role: 'Transport correspondent',
    dateline: 'North Loop terminus',
    illustration: 'train',
    imageDescription: 'A side-on drawing of a commuter train shows a spring-isolated passenger floor, a striped boarding edge, and a vermilion light band at the doors.',
    caption: 'Quiet below, legible above: isolated floors reduce vibration while a continuous light band marks an open door.',
    paragraphs: [
      'For twenty years, the North Loop’s first train announced itself by rattling the teaspoons in Nadi Venn’s kitchen. This week the teaspoons stayed still. Venn nearly missed the 07:12. The new carriage had done precisely what its designers promised, and removed the alarm clock nobody had admitted to using.',
      'The quiet comes from several modest changes rather than one miraculous motor. A second floor rests on laminated springs above the chassis. Wheel surfaces are checked at the end of every shift, before tiny flat spots become a daily percussion section. Cooling fans now push air through broad, slow ducts instead of narrow grilles. The loudest remaining noise inside is usually a coat zip.',
      'At stations, a light band follows the opening doors. A handrail gives three gentle pulses before they close, for passengers who choose to use the tactile cue. Neither replaces the spoken warning. Emergency announcements still interrupt everything, and drivers retain an ordinary horn. Quiet, the operating manual insists, is a comfort setting, not a safety system.',
      'The difficult debate concerns the small bell that sounds before departure. Neighbours want it removed at the residential stops. The access panel, which includes blind commuters and people with hearing loss, wants it kept alongside the other signals. A trial with lights alone left several passengers relying on strangers to tell them which train was leaving.',
      'Conductors have won a second concession: twenty-two additional seconds of boarding time at the busiest platforms. People who cannot hear a train approaching need time to find its doors. The revised timetable means the final service reaches the depot later, so the city has agreed to pay the cleaning shift rather than quietly shorten it.',
      'Venn has put a clock beside the kettle. She likes being able to talk to her daughter without leaning across the seat, and dislikes the phrase “silent carriage,” which some passengers have mistaken for an instruction. Conversation is allowed. So are children, laughter, and a stubborn little departure bell. The point was to quiet the machinery, not the people.',
    ],
    pullQuote: 'The point was to quiet the machinery, not the people.',
    sidebar: {
      title: 'Quiet is not silent',
      items: [
        { label: 'Under the seat', text: 'A spring-isolated floor interrupts the path of wheel vibration.' },
        { label: 'At the door', text: 'Light, sound, and an optional tactile cue communicate the same event.' },
        { label: 'On the timetable', text: 'Longer boarding time is funded, including the later cleaning shift.' },
      ],
      note: 'A fictional transport report. The systems are part of this imagined city.',
    },
  },
  {
    id: 'river-door',
    section: 'living',
    kicker: 'Our non-human neighbours',
    title: 'A door in the sea wall, reserved for eels',
    standfirst: 'The new flood barrier has a narrow passage that humans cannot use. Its opening hours are already rearranging the harbour.',
    author: 'Alma Quill',
    role: 'Living systems editor',
    dateline: 'The east tidal gate',
    illustration: 'river',
    imageDescription: 'An overhead diagram shows a narrow winding fish passage beside a massive sea wall, with three eels moving along a vermilion-marked route.',
    caption: 'Not an opening in the main barrier: a separate, baffled channel lets the migration pass at a controlled difference in water level.',
    paragraphs: [
      'From the promenade, the eel door looks like a missing paving stone. Below it, a dark channel curls around the east flood barrier and meets the river beyond the pumps. It is the only route through the new sea wall that does not ask its traveller to have a ticket, a motor, or a human destination.',
      'The door opens around slack water, when the difference in level on either side is small. Baffles slow the flow. A rough lining gives young eels places to rest. Salinity probes tell the gatekeeper when conditions are suitable, but a person still checks the channel for litter before each opening. Last night the obstruction was a glove.',
      'Migration steward Ada Noll had wanted a larger passage. The engineers wanted a shorter one, easier to inspect. The compromise takes a bend beneath the harbour office, adding two maintenance hatches and a permanent expense to the port’s accounts. Noll calls those hatches the most important part of the agreement. “A right of passage without a cleaning budget is just a hole in a drawing.”',
      'There are human consequences. During migration windows, the harbour delays the small freight lock beside the channel so a sudden rush of water cannot sweep through it. A flour barge missed its preferred unloading slot on Tuesday. The bakers’ cooperative is asking for earlier notices, not for the eel door to close.',
      'The arrangement also leaves slightly less space in the barrier’s service corridor. To retain the planned flood margin, the city raised a stretch of the east walkway by eight centimetres and rebuilt its access ramps. Those changes cost more than the passage itself. The final bill is displayed at the gate, including the portion assigned to accessibility work.',
      'Nobody knows how many eels will use the route this season. The counter records a moving shape, not a name, and sometimes mistakes weed for a traveller. Noll publishes a range instead of a triumphant total. Near midnight she lifted the glove out, checked the water, and opened the door. The harbour waited eleven minutes. Something small went home.',
    ],
    pullQuote: 'A right of passage without a cleaning budget is just a hole in a drawing.',
    sidebar: {
      title: 'The passage agreement',
      items: [
        { label: 'Separate channel', text: 'The principal flood barrier stays closed during an eel opening.' },
        { label: 'Shared timetable', text: 'The adjoining freight lock pauses during the migration window.' },
        { label: 'Funded care', text: 'Inspections, clearing, and accessible walkway changes are in the budget.' },
      ],
      note: 'This fictional design is an editorial illustration, not flood-control guidance.',
    },
  },
  {
    id: 'repair-choir',
    section: 'culture',
    kicker: 'Listening room',
    title: 'At the repair hall, a second life has a sound',
    standfirst: 'A neighbourhood concert is being played by objects that almost became rubbish. The musicians are also the maintenance crew.',
    author: 'Dev Sen',
    role: 'Culture correspondent',
    dateline: 'House of Second Sounds',
    illustration: 'repair',
    imageDescription: 'An old table fan, a kettle, a radio, and a winding spool sit on a repair bench, joined by a curling vermilion sound line.',
    caption: 'The evening’s unlikely ensemble: four fans, a kettle, two shutters, and a bucket. No synthetic voices required.',
    paragraphs: [
      'The first note at the House of Second Sounds comes from a table fan with an uneven blade. It is not allowed to spin in that condition. Instead, repairer Jo Maren taps its unplugged guard with a wooden beater. Four other fans answer. Behind them, a kettle provides a surprisingly dignified drum.',
      'Saturday’s concert will raise money for the repair hall’s winter rent. Every instrument was once brought to the counter in the hope that it could be made useful again. Some returned to their kitchens. Others could not safely be repaired, and were stripped of electrical parts before joining the ensemble. The programme lists what failed beside the name of each object.',
      'Maren began collecting sounds after replacing the motor in a neighbour’s old extractor fan. The new motor was efficient and almost inaudible. The neighbour was grateful, then unexpectedly sad. Her father had cooked under the old fan for forty years. Its particular wobble had become part of her memory of dinner.',
      'The hall does not promise to resurrect that kind of past. It can record a sound before a repair, or preserve a harmless mechanical quirk. It will not keep a dangerous bearing for the sake of atmosphere. There is now a question on the intake form: “Is there anything about this object you would miss if we made it different?”',
      'Not everyone wants yesterday’s noises back. Residents above the hall objected to the first rehearsal, especially a pair of metal shutters. The players moved practice to early evening and built a padded frame so the vibrations no longer travelled through the party wall. Tickets for the upstairs households are free, but attendance is not the price of having their complaint taken seriously.',
      'The finale uses a bucket that leaks too slowly to be a good bucket. Water falls into a shallow dish while the fans turn their guards toward the audience. Afterwards, the instruments will be available to inspect, with repair notes and parts diagrams. Maren hopes people leave humming. She would be just as pleased if they leave knowing how to replace a washer.',
    ],
    pullQuote: 'Is there anything about this object you would miss if we made it different?',
    sidebar: {
      title: 'Before the first note',
      items: [
        { label: 'Make it safe', text: 'Unrepairable electrical objects are disconnected and stripped before use.' },
        { label: 'Keep the record', text: 'Each instrument has a fault history and an explanation of its new role.' },
        { label: 'Listen upstairs', text: 'Rehearsal hours and vibration isolation were agreed with neighbours.' },
      ],
      note: 'The repair hall and concert are fictional. There are no tickets for sale.',
    },
  },
  {
    id: 'shadow-school',
    section: 'culture',
    kicker: 'An education in looking',
    title: 'Night school begins with the last of the light',
    standfirst: 'On a library roof, adults are learning to read shadows. The lesson is less about finding north than noticing who loses the sun.',
    author: 'Oren Moss',
    role: 'Neighbourhood correspondent',
    dateline: 'West Library roof',
    illustration: 'shadow',
    imageDescription: 'A rooftop stick casts a long dark shadow across stepped buildings. Two small figures mark its edge while the low sun is drawn in vermilion.',
    caption: 'A stick, a chalk line, and a second observation. The West Library class studies change rather than trusting a single shadow.',
    paragraphs: [
      'At half past six, the night-school class places a stick in a bucket of sand. Teacher Rhea Dast asks twelve adults where its shadow will be in twenty minutes. A retired courier points toward the water. A teenager points at a ventilation pipe. Everyone is required to make a chalk mark before checking a screen.',
      'The course began as a practical response to a week of navigation outages. Its first lesson, however, is that a shadow is not a dependable street address. The sun changes its path with the season. Tall buildings hide it. A single observation can mislead. Students take a second reading, write down the time, and compare it with a printed map.',
      'Dast refuses to turn the class into an argument against technology. She uses the library’s projection table when it helps. A blind student works with a raised map and a partner who records the shadow’s position in words. The objective is to have more than one way to understand a place, not to declare one kind of attention morally superior.',
      'By the third lesson, the students have begun following shade beyond the roof. Their notebooks show that a proposed storage tower would darken the nursery yard earlier in winter than the planning diagram suggests. The diagram measured sunlight at the centre of the yard. The children spend much of their time near its sheltered western wall.',
      'The tower cooperative has agreed to move a rooftop equipment room, recovering some of the lost light. It cannot move the whole building without losing homes below. The nursery has asked for a second outdoor space instead of claiming that every shadow is a failure. The next public meeting will include the class’s observations, clearly labelled with dates and limitations.',
      'Back on the roof, the teenager’s chalk mark turns out to be closest. The courier laughs and asks to try again tomorrow. Before packing away, Dast draws a circle around the bucket so nobody will trip over it in the dark. The class ends with a modest distinction: knowing where the light goes is not the same as deciding who should get it.',
    ],
    pullQuote: 'The objective is to have more than one way to understand a place.',
    sidebar: {
      title: 'From the class notebook',
      items: [
        { label: 'Observe twice', text: 'Record the time and season. One shadow does not tell the whole story.' },
        { label: 'Name the limit', text: 'A rooftop observation cannot stand in for every corner of a yard.' },
        { label: 'Make it shared', text: 'Raised maps and spoken descriptions belong in the same classroom.' },
      ],
      note: 'An original fictional neighbourhood report, not a navigation lesson.',
    },
  },
  {
    id: 'unallocated-hour',
    section: 'opinion',
    kicker: 'The editorial',
    title: 'Keep an hour that belongs to nobody',
    standfirst: 'A common resource needs a timetable. It also needs room for the person who could not get to the timetable first.',
    author: 'The editorial desk',
    role: 'Editorial · an argument, not a report',
    dateline: 'Port Meridian',
    illustration: 'clock',
    imageDescription: 'A clock face has an open segment at its upper right. A vermilion arc extends beyond the circle, suggesting an hour left unallocated.',
    caption: 'Room in the timetable is not the absence of a plan. It can be a deliberate part of one.',
    paragraphs: [
      'There is now a booking window for sitting under a cloud. Soon, if the harbour committee gets its way, there may be one for the warm benches outside the ferry hall. Every proposal arrives with a sensible explanation. Shade is scarce. Heat costs money. A queue is also a kind of allocation, and often an unfair one.',
      'Yet a city in which every useful minute has already been assigned is difficult to enter. The person leaving an unpredictable care shift cannot confidently reserve Tuesday afternoon. A child does not know three days in advance when she will need somewhere to be sad. Not all legitimate needs come with a calendar invitation.',
      'The cloud library’s decision to keep some sessions for same-day borrowing is a good start, not a complete solution. In-person queues favour those who can stand in them. Online queues favour those who can watch a screen. A fair public service needs several doors, including a staffed telephone and someone empowered to make an exception without asking for a life story.',
      'We propose a small experiment: reserve one hour in each ordinary lending day for walk-up use, with priority decided by a paid attendant and a published set of principles. Keep an accessible waiting place nearby. Record who is turned away and why, without collecting names. Review the arrangement with the people who could not use it, not just those who did.',
      'This is not an argument for leaving ambulances unassigned or pretending staff have infinite time. Emergency shade must still go to clinics first. Attendants need predictable wages and breaks. The unallocated hour belongs to the public only if the labour supporting it is properly allocated and paid for. Otherwise, “flexibility” is merely an expense passed to the least powerful person.',
      'There will be quiet afternoons when no one comes. The committee should resist calling them waste. A spare chair is useful before somebody sits in it. A city needs a little capacity to receive the unexpected: a late ferry, a difficult day, a stranger with no appointment. We can plan for that without planning the stranger out of existence.',
    ],
    pullQuote: 'A spare chair is useful before somebody sits in it.',
    sidebar: {
      title: 'Our proposed experiment',
      items: [
        { label: 'Leave an opening', text: 'One ordinary hour for walk-up use, alongside advance and same-day loans.' },
        { label: 'Pay for the work', text: 'Fund attendants, an accessible waiting place, and a telephone route.' },
        { label: 'Count the absence', text: 'Ask why people were turned away. An empty slot is not automatically waste.' },
      ],
      note: 'This editorial discusses the invented policies of an imagined city.',
    },
  },
];

export function getStory(id: string): Story | undefined {
  return stories.find((story) => story.id === id);
}

export function getSection(id: string): NewspaperSection | undefined {
  return sections.find((section) => section.id === id);
}

export function readingMinutes(story: Story): number {
  return Math.max(1, Math.ceil(story.paragraphs.join(' ').split(/\s+/).length / 180));
}

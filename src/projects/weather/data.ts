export const expedition = {
  date: '18 Mothmonth · Year 07',
  edition: 'Northern traverse / Field edition 028',
  note: 'Fixed fictional day. Never your local time.',
} as const;

export const watches = [
  { id: 'dawn', name: 'Dawn', time: '06:00', description: 'The first instrument round' },
  { id: 'noon', name: 'Noon', time: '12:00', description: 'The long-light instrument round' },
  { id: 'dusk', name: 'Dusk', time: '18:00', description: 'The blue-hour instrument round' },
  { id: 'night', name: 'Night watch', time: '23:00', description: 'The final instrument round' },
] as const;

export type WatchId = (typeof watches)[number]['id'];
export type Landscape = 'stair' | 'orchard' | 'desert' | 'marsh' | 'range' | 'shelf';

export interface Forecast {
  short: string;
  condition: string;
  warmth: number;
  wind: number;
  direction: string;
  veils: number;
  reading: number;
  summary: string;
  route: string;
  fieldNote: string;
  kit: string[];
  packingNote: string;
}

export interface PackingItem {
  id: string;
  name: string;
  reason: string;
}

export interface Destination {
  id: string;
  number: string;
  name: string;
  region: string;
  grid: string;
  map: [number, number];
  landscape: Landscape;
  tagline: string;
  geographyTitle: string;
  geography: [string, string];
  approach: string;
  station: string;
  observer: string;
  instrument: string;
  section: string;
  diagramDescription: string;
  features: [string, string, string];
  measure: {
    name: string;
    unit: string;
    definition: string;
    maximum: number;
  };
  packing: PackingItem[];
  forecasts: Record<WatchId, Forecast>;
}

export const sharedUnits = [
  {
    name: 'Hearth reading',
    symbol: '°h',
    definition: 'An invented comfort scale: 0 is frost on a sleeping kettle; 20 is a sun-warmed stone. Negative values feel colder. There is no conversion to Celsius or Fahrenheit.',
  },
  {
    name: 'Wind pull',
    symbol: 'ribbons',
    definition: 'The number of ribbons held taut on a twelve-ribbon vane. 0 is still; 12 is the strongest pull this fictional instrument can show. The direction describes the local flow.',
  },
  {
    name: 'Sky opacity',
    symbol: 'veils',
    definition: 'The number of hidden bars in a ten-bar sightglass. 0 means a perfectly clear view; 10 means the sky is completely obscured. More veils means less visibility.',
  },
] as const;

export const destinations: Destination[] = [
  {
    id: 'pelagic-stair',
    number: '01',
    name: 'Pelagic Stair',
    region: 'Westward Archipelago',
    grid: 'B / 4',
    map: [91, 222],
    landscape: 'stair',
    tagline: 'An island with a sea below it. And another, less obedient sea above.',
    geographyTitle: 'Where the sea forgets to fall.',
    geography: [
      'Nine basalt landings rise out of the Lower Sea, each worn smooth by a different century of boots. Above them hangs the Upper Sea: a shallow ocean held against the underside of the sky. Its tide is pulled by a moon that the islanders insist is somewhere beneath their feet.',
      'Rain here is a return journey. Droplets leave puddles, hesitate at eye level, then hurry upward in silver columns. The stair-keepers collect drinking water under the eaves and build their chimneys sideways. At a high upper tide, the little lighthouse illuminates fish passing over its roof.',
    ],
    approach: 'The survey boat ties up at Landing One. Follow the pale handrail to the observatory; the unrailed stair belongs to the tide, not to visitors.',
    station: 'Landing Nine Observatory',
    observer: 'Iona Vell, keeper of the upper gauge',
    instrument: 'A brass stair-gauge sighted against the underside of the Upper Sea.',
    section: 'Section A–A′ · the two-sea crossing',
    diagramDescription: 'Basalt steps climb from a dark lower ocean toward a suspended upper sea. A striped lighthouse stands on the highest landing. Yellow droplets and an upward arrow trace the returning rain.',
    features: ['Upper Sea / tide boundary', 'Returning rain / upward travel', 'Landing Nine / fixed gauge'],
    measure: {
      name: 'Sky-tide height',
      unit: 'rungs',
      definition: 'One marked interval on the lighthouse stair-gauge. More rungs places the underside of the Upper Sea higher above the landings; the lower shore stays fixed.',
      maximum: 12,
    },
    packing: [
      { id: 'tether', name: 'Cork tether', reason: 'Clips a loose bag to the handrail when the rain begins to lift things.' },
      { id: 'cape', name: 'Under-brim cape', reason: 'Its second brim keeps upward rain out of collars and pockets.' },
      { id: 'boots', name: 'Felt-soled boots', reason: 'The landings remain slick after the droplets have left them.' },
      { id: 'cup', name: 'Inverted sample cup', reason: 'A lidded cup held upside down catches the returning rain.' },
    ],
    forecasts: {
      dawn: {
        short: 'Rising drizzle',
        condition: 'The rain is going up.',
        warmth: 9, wind: 3, direction: 'Shore → sky', veils: 2, reading: 6,
        summary: 'A gentle return-rain lifts from the lower landings. The Upper Sea rests six rungs above its low mark; gaps between the droplets leave the lighthouse clearly visible.',
        route: 'The pale handrail route is open. Pause at Landing Three to watch the first droplets turn; the upper steps are still wet.',
        fieldNote: '06:00. Turned the collection cup upside down. It filled before the kettle boiled. One small fish crossed the lantern beam, swimming very deliberately against the weather.',
        kit: ['boots', 'cup'],
        packingNote: 'This is the best sample-taking watch. Keep the inverted cup ready and choose the felt soles for the damp lower stair.',
      },
      noon: {
        short: 'High sky-tide',
        condition: 'A sea at full height.',
        warmth: 17, wind: 6, direction: 'Landing → Upper Sea', veils: 4, reading: 11,
        summary: 'The upper tide climbs to eleven rungs. Broad ropes of returning rain pull at coat hems, and their spray hides four bars of the sightglass.',
        route: 'Stay on the sheltered side of Landing Five. The outer stair is closed in the expedition log until the upward pull eases.',
        fieldNote: '12:00. The Upper Sea has taken the eleventh mark. We tied down the empty buckets, not the full ones. The lighthouse now casts its shadow onto the underside of a wave.',
        kit: ['tether', 'cape'],
        packingNote: 'Fasten the cork tether before stepping out. The under-brim cape matters more than a conventional umbrella in this upward shower.',
      },
      dusk: {
        short: 'Silver return',
        condition: 'The tide lets go.',
        warmth: 12, wind: 4, direction: 'West stair → sky', veils: 3, reading: 8,
        summary: 'The sky-tide settles to eight rungs and the thick rain-ropes loosen into silver threads. A westward surface draft bends their ascent toward the lantern.',
        route: 'The handrail route has reopened to Landing Nine. The western edges are slippery where the rain is departing sideways.',
        fieldNote: '18:00. Three rungs lost since the noon round. The rain leans west now; the keeper has turned the chimney another quarter-turn. Supper smells faintly of the sea above.',
        kit: ['boots', 'cape'],
        packingNote: 'Keep the cape’s lower brim fastened against the slanting rain. Felt soles are still useful even as the steps begin to dry.',
      },
      night: {
        short: 'Suspended drops',
        condition: 'A pause between oceans.',
        warmth: 5, wind: 1, direction: 'A faint upward drift', veils: 1, reading: 3,
        summary: 'The Upper Sea hangs low at three rungs. Most droplets linger above the stair before rising, and the almost-clear gap between oceans holds a scattering of reflected stars.',
        route: 'Remain within the lantern’s marked pool. The tide is quiet, but the stair beyond Landing Nine is not mapped at this watch.',
        fieldNote: '23:00. A bead of water stayed beside the third step for seven pendulum swings. Its reflection contained a star I could not find in either sky. Left the cup beneath it.',
        kit: ['cup', 'boots'],
        packingNote: 'Bring the cup for slow, suspended samples. Keep the felt soles on: quiet weather does not make the unlit landings less slick.',
      },
    },
  },
  {
    id: 'glass-orchard',
    number: '02',
    name: 'The Glass Orchard',
    region: 'Vitreous Lowlands',
    grid: 'C / 3',
    map: [181, 179],
    landscape: 'orchard',
    tagline: 'A forest grown from lightning, bearing a delicate and rather noisy harvest.',
    geographyTitle: 'Every branch remembers a storm.',
    geography: [
      'The orchard occupies a bowl of pale clay where lightning once struck the same hill for a hundred summers. Its trees have transparent trunks and angular, hollow leaves. Nothing here grows quickly. A new branch is considered a useful landmark only after three generations have agreed on its direction.',
      'When the air warms, the branches release small glass beads instead of pollen. By dusk, the ground rings with their arrival. The village paths are lined with felt, and the gardeners communicate with paper flags during a heavy harvest. No one has yet found a seed inside a bead.',
    ],
    approach: 'Enter through the felt gate on the eastern clay road. The marked path passes between the old trees; the bright-looking shortcuts are beds of fallen glass.',
    station: 'Felt Gate Listening House',
    observer: 'Mara Quill, orchard listener',
    instrument: 'A felt-lined sample cup and a bell with one carefully measured swing.',
    section: 'Section B–B′ · the listening grove',
    diagramDescription: 'Faceted glass trees stand on pale rolling terraces. Angular beads fall between the branches. Large geometric crowns and finer distant trunks show the depth of the orchard.',
    features: ['Glass crowns / bead source', 'Glassfall / sample column', 'Felt path / quiet approach'],
    measure: {
      name: 'Glassfall',
      unit: 'chimes',
      definition: 'One glass bead caught in the listening cup during a single swing of the station bell. More chimes means denser glassfall, not louder sound.',
      maximum: 24,
    },
    packing: [
      { id: 'cloak', name: 'Felt shoulder cloak', reason: 'Soft shoulders keep the falling beads from collecting at the collar.' },
      { id: 'cup', name: 'Padded listening cup', reason: 'Collects beads one by one without adding a second ringing note.' },
      { id: 'visor', name: 'Smoke-glass visor', reason: 'Tones down the multiplied sunlight inside the old glass crowns.' },
      { id: 'earwraps', name: 'Quiet earwraps', reason: 'Useful when the evening harvest turns the entire bowl into a bell.' },
    ],
    forecasts: {
      dawn: {
        short: 'Four soft chimes',
        condition: 'A very small harvest.',
        warmth: 7, wind: 2, direction: 'Clay rim → grove', veils: 1, reading: 4,
        summary: 'The cool branches release four beads per bell swing. Light passes cleanly through the crowns, and a small inward breeze carries each note toward the listening house.',
        route: 'The eastern felt path is open. Stay beneath the younger trees for a clear view of the first bead release.',
        fieldNote: '06:00. Four arrivals in the cup, all the color of weak tea. The oldest tree gave one low note, though nothing fell from it. The apprentice marked this as a greeting.',
        kit: ['cup', 'cloak'],
        packingNote: 'Take the padded cup for a quiet sample round. The felt cloak catches the few stray beads without disturbing the grove’s first notes.',
      },
      noon: {
        short: 'Prism shower',
        condition: 'Sunlight breaks into beads.',
        warmth: 16, wind: 4, direction: 'East → hollow crowns', veils: 2, reading: 14,
        summary: 'Warm glass sheds fourteen beads per swing. The crowns split the high light into bright angular patches; a steady easterly shakes loose the smaller branches.',
        route: 'Use the covered felt walk. The western viewing platform is too bright for the observatory’s unshaded sightglass.',
        fieldNote: '12:00. Fourteen chimes and two false rainbows. A bead rolled uphill along a beam of light until we lowered the shade. The clay beneath it remained perfectly level.',
        kit: ['visor', 'cloak'],
        packingNote: 'The smoke-glass visor is the useful addition at noon. Keep the shoulder cloak spread over straps, where the brighter beads like to settle.',
      },
      dusk: {
        short: 'Ringing harvest',
        condition: 'The whole grove is ringing.',
        warmth: 10, wind: 6, direction: 'Upper grove → felt gate', veils: 4, reading: 22,
        summary: 'Cooling branches release the day’s largest harvest: twenty-two chimes. A stronger downslope draft fills the path with crossing beads and softens the distant grove behind four veils.',
        route: 'Observe from the listening house veranda. The open grove path is closed in the atlas during the ringing harvest.',
        fieldNote: '18:00. Twenty-two beads in one swing. We raised the blue paper flag and stopped speaking. The orchard answered a question nobody had written down.',
        kit: ['earwraps', 'cloak'],
        packingNote: 'Use the quiet earwraps for the ringing watch. The cloak is still useful on the veranda, where the downslope beads reach the rail.',
      },
      night: {
        short: 'Quiet branches',
        condition: 'Only the old trees answer.',
        warmth: 4, wind: 1, direction: 'A slow inward breath', veils: 1, reading: 2,
        summary: 'The harvest subsides to two chimes. Cold crowns hold their remaining beads, and the faint breeze is too weak to stir anything but the smallest glass leaves.',
        route: 'The marked path is open as far as the first listening post. The deeper grove is left undisturbed for the night count.',
        fieldNote: '23:00. Two clear beads, nine swings apart between samples. In the silence afterward I heard the clay settling beneath the oldest trunk. That sound is not in our glossary.',
        kit: ['cup', 'cloak'],
        packingNote: 'Bring the padded cup and leave the earwraps in the bag. A warm layer beneath the felt cloak makes this slow listening watch more comfortable.',
      },
    },
  },
  {
    id: 'brass-desert',
    number: '03',
    name: 'The Brass Desert',
    region: 'Inner Leeward',
    grid: 'E / 4',
    map: [298, 228],
    landscape: 'desert',
    tagline: 'The dunes do not move very far. Their songs travel for days.',
    geographyTitle: 'A landscape tuned by the wind.',
    geography: [
      'Every grain in the Inner Leeward is a tiny curled sheet of brass. Wind passing over a dune makes its surface hum, while wind passing through it produces a chord. The survey charts show ridges as musical staves; a place name is incomplete without the note on which it is usually heard.',
      'The desert’s only permanent shelter is a low ceramic house, built without a single metal nail. Its keeper records the dunes before sunrise and again after they cool. The oldest route follows three quiet valleys, although a valley may change its key without moving an inch.',
    ],
    approach: 'Follow the white ceramic posts from the eastern rim to the listening house. Do not substitute a familiar tune for the marked survey route.',
    station: 'Ceramic House No. 3',
    observer: 'Orr Fen, keeper of the tuning fork',
    instrument: 'A twelve-tooth brass fork that separates the dune chorus into distinct voices.',
    section: 'Section C–C′ · the resonant dunes',
    diagramDescription: 'Sweeping ridges of brass sand overlap in a striped basin. Concentric sound arcs rise from the largest dune. A tall tuning-fork instrument stands beside the ceramic survey house.',
    features: ['Singing ridge / resonant face', 'Chorus arcs / distinct voices', 'Ceramic house / quiet reference'],
    measure: {
      name: 'Dune chorus',
      unit: 'voices',
      definition: 'The number of distinct tones separated by the station’s twelve-tooth tuning fork. More voices means a more complex chorus, not a decibel reading.',
      maximum: 12,
    },
    packing: [
      { id: 'earwraps', name: 'Felt earwraps', reason: 'Keep the many-voiced evening chorus outside your notebook thoughts.' },
      { id: 'bottle', name: 'Ceramic water flask', reason: 'A non-metal flask does not sing along with the dunes.' },
      { id: 'stakes', name: 'White route stakes', reason: 'Mark a return across ridges whose familiar songs may change key.' },
      { id: 'gaiters', name: 'Canvas grain-gaiters', reason: 'Keep the little curled grains out of boot seams and buckles.' },
    ],
    forecasts: {
      dawn: {
        short: 'Low three-part hum',
        condition: 'The dunes clear their throats.',
        warmth: 6, wind: 2, direction: 'East rim → basin', veils: 1, reading: 3,
        summary: 'Cool brass carries a low three-voice chord. Two ribbons lift on the vane, just enough to sound the upper ridges without raising a screen of grains.',
        route: 'The three-valley survey route is open. The quiet first ridge is the best place to compare the individual notes.',
        fieldNote: '06:00. Three voices, the lowest almost below hearing. Set the flask on a folded cloth; even the ceramic table seemed eager to join in. No grains crossed the eastern post.',
        kit: ['bottle', 'stakes'],
        packingNote: 'Take the ceramic flask and a pair of white stakes for the quiet valley walk. Earwraps can stay packed during this low chorus.',
      },
      noon: {
        short: 'Bright brass haze',
        condition: 'Seven voices in the heat.',
        warmth: 29, wind: 7, direction: 'East → west ridge', veils: 5, reading: 7,
        summary: 'Heated grains curl more tightly and the chorus expands to seven voices. A seven-ribbon crosswind lifts brass dust, hiding half the sightglass bars.',
        route: 'The exposed ridge walk is closed for this watch. Read the fork from the ceramic house’s shaded eastern recess.',
        fieldNote: '12:00. Seven teeth of the fork are answering. The horizon has become a pale, vibrating line. A loose buckle sang the same note for the entire instrument round.',
        kit: ['bottle', 'gaiters'],
        packingNote: 'Keep the ceramic flask close and the canvas gaiters fastened. The atlas recommends the shaded house, not a midday dune crossing.',
      },
      dusk: {
        short: 'Twelve-voice chorus',
        condition: 'Every ridge has a voice.',
        warmth: 18, wind: 9, direction: 'West ridge → basin', veils: 6, reading: 12,
        summary: 'The returning wind excites all twelve measured voices. Cooling outer grains and warm inner layers sing different notes, while a dense grain-haze blurs the basin.',
        route: 'Remain at the listening house. The chorus masks the route bells and the white posts are difficult to distinguish beyond the first ridge.',
        fieldNote: '18:00. All twelve teeth answered at once. The great dune held its chord long after the gust passed. We put the notebook on felt because its binding had begun to hum.',
        kit: ['earwraps', 'gaiters'],
        packingNote: 'This is the earwrap watch. Keep gaiters on for the short walk between the veranda and the instrument, where grains are still drifting.',
      },
      night: {
        short: 'Five cooling notes',
        condition: 'A chord left in the sand.',
        warmth: 2, wind: 3, direction: 'Basin → eastern rim', veils: 2, reading: 5,
        summary: 'The wind falls to three ribbons and the grain-haze settles. Five resonant notes remain in the cooling dunes, each fading at a slightly different pace.',
        route: 'The first two ceramic posts are visible again. The expedition stays inside that marked loop until the next dawn survey.',
        fieldNote: '23:00. Five voices remain, but none belongs to the ridge that made it. Walked to the second post and heard yesterday’s low note under tonight’s chord.',
        kit: ['bottle', 'stakes'],
        packingNote: 'Pack the flask and route stakes for the small marked loop. The two-degree hearth reading calls for a warm layer beneath the expedition coat.',
      },
    },
  },
  {
    id: 'umbra-marsh',
    number: '04',
    name: 'Umbra Marsh',
    region: 'Noonless Basin',
    grid: 'D / 2',
    map: [250, 124],
    landscape: 'marsh',
    tagline: 'Here, a reflection needs a little time to make up its mind.',
    geographyTitle: 'Water with a very long memory.',
    geography: [
      'Umbra lies in a shallow basin that the sun crosses but never quite illuminates. Its black pools reflect objects several pendulum beats after they have moved. A departing heron can remain in the water for a full minute, which makes counting birds a matter of patience rather than eyesight.',
      'Raised paths join islands of blue reeds. Each path has a bell at both ends so that travelers can tell a present footstep from a reflected one. The basin’s fog thickens toward night, and shadows begin to trail their owners like dark, reluctant ribbons.',
    ],
    approach: 'Enter by the paired-bell boardwalk. Stay on its chalked centerline; reflected planks are neither a second path nor a shortcut.',
    station: 'The Paired-Bell Hut',
    observer: 'Sella Mire, reflection surveyor',
    instrument: 'A white reference staff, its reflection, and a slow sixteen-beat pendulum.',
    section: 'Section D–D′ · the delayed reflection',
    diagramDescription: 'Blue reed islands and a crooked reference tree rise from dark flat water. Their reflections are displaced to the right. Low fog bands cross the basin, and a dotted span measures the shadow’s delay.',
    features: ['Reference tree / present position', 'Lagging reflection / delayed image', 'Blue reeds / boardwalk edge'],
    measure: {
      name: 'Shadow lag',
      unit: 'beats',
      definition: 'Pendulum beats between moving the white reference staff and seeing its reflection move. More beats means a longer delay. This is fictional time, not a claim about optics.',
      maximum: 16,
    },
    packing: [
      { id: 'bells', name: 'Paired walking bells', reason: 'One bell answers the other from the actual ends of the boardwalk.' },
      { id: 'chalk', name: 'Blue path chalk', reason: 'Renews the centerline when the reflected planks look more convincing.' },
      { id: 'lamp', name: 'Hooded paper lamp', reason: 'Keeps a small, steady light on the nearest real plank.' },
      { id: 'book', name: 'Wax-leaf notebook', reason: 'Records the delay without letting the persistent fog soak the page.' },
    ],
    forecasts: {
      dawn: {
        short: 'Two-beat reflections',
        condition: 'Almost in step with the world.',
        warmth: 6, wind: 2, direction: 'North reeds → bell hut', veils: 3, reading: 2,
        summary: 'A light reedward breeze thins the fog to three veils. Reflections follow after two beats, close enough that a patient observer can match each bird to its image.',
        route: 'The paired-bell boardwalk is open to the reference tree. Check the blue centerline where the planks pass over open water.',
        fieldNote: '06:00. Raised the staff; the water answered on the second beat. Counted six herons and six delayed herons. This is the first balanced count of the traverse.',
        kit: ['chalk', 'book'],
        packingNote: 'Bring the chalk and wax-leaf notebook for the clearest reflection survey. The lamp can stay hooded in the first pale light.',
      },
      noon: {
        short: 'Six-beat drift',
        condition: 'The water falls behind.',
        warmth: 12, wind: 1, direction: 'A faint southerly', veils: 5, reading: 6,
        summary: 'The small breeze weakens and fog gathers in the warmer basin. Reflections need six beats to catch up; half of the sightglass bars are now hidden.',
        route: 'Use only the short loop between the paired bells. A reflection of the northern bridge remains visible after the bridge itself disappears in fog.',
        fieldNote: '12:00. Six beats between the lifted staff and its reply. The north bridge vanished first; its reflection stayed another six beats, making the water look briefly more useful than the land.',
        kit: ['bells', 'chalk'],
        packingNote: 'Take both walking bells and renew the chalk line on the short loop. Do not follow the more distinct-looking reflected bridge.',
      },
      dusk: {
        short: 'Long shadow-fog',
        condition: 'Shadows arrive after their owners.',
        warmth: 8, wind: 1, direction: 'Along the boardwalk', veils: 7, reading: 11,
        summary: 'The lag lengthens to eleven beats while blue-hour fog conceals seven sightglass bars. Even the reeds seem to move twice: first in air, then much later in water.',
        route: 'The survey has withdrawn to the hut’s front platform. The boardwalk beyond the near bell is closed in this watch’s log.',
        fieldNote: '18:00. Came indoors and saw my shadow still waiting at the tree. It followed on beat eleven. The apprentice rang the near bell twice, which improved nobody’s count.',
        kit: ['bells', 'lamp'],
        packingNote: 'Use the hooded lamp on the platform and keep the paired bells together. This is a hut-side observation, not a marsh crossing.',
      },
      night: {
        short: 'Sixteen-beat stillness',
        condition: 'The marsh keeps yesterday’s pose.',
        warmth: 3, wind: 0, direction: 'Still / no vane movement', veils: 9, reading: 16,
        summary: 'No ribbons rise on the vane. Nine veils of fog leave only the nearest pool visible, and the reference reflection waits the full sixteen-beat instrument cycle.',
        route: 'Observe through the hut’s low window. No night walk is recorded; the near bell is the last visible point on the survey.',
        fieldNote: '23:00. Sixteen beats. Closed the shutter and watched its reflection remain open. Left a note for morning: wait for the water to finish before resetting the staff.',
        kit: ['lamp', 'book'],
        packingNote: 'Keep the lamp low beside the wax-leaf notebook. The walking kit stays in the hut while the final delay count is made.',
      },
    },
  },
  {
    id: 'folded-range',
    number: '05',
    name: 'The Folded Range',
    region: 'Northern Accordion',
    grid: 'C / 1',
    map: [165, 66],
    landscape: 'range',
    tagline: 'Mountains creased like paper. Snow with ambitions of its own.',
    geographyTitle: 'A mountain is a crease in the sky.',
    geography: [
      'The Northern Accordion is made of thin, pale mountain faces folded against one another. From the south the range looks vast; from the east it is almost invisible. The saddles are called hinges, and the expedition maps are always stored flat for reasons the local guides decline to explain.',
      'Snow arrives in the valleys and climbs. Individual flakes gather at a ledge, wait for an upward gust, then spring to the next one. By evening the summits wear white caps while the valley floors are bare. The observatory measures ambition with a twelve-step snow ladder.',
    ],
    approach: 'Take the broad southern hinge to the ladder house. The narrow east-facing folds are outside the expedition’s marked route.',
    station: 'Twelve-Step Ladder House',
    observer: 'Tavi Crease, high-snow recorder',
    instrument: 'A dark twelve-step ladder set against the rising snow column.',
    section: 'Section E–E′ · the ascending snow line',
    diagramDescription: 'Tall, sharply folded mountain faces overlap like pale paper. Snow rises along their creases instead of falling from the sky. A dark stepped ladder and yellow upward tracks mark the ascent.',
    features: ['Folded faces / mountain hinges', 'Rising snow / uphill track', 'Snow ladder / twelve-step gauge'],
    measure: {
      name: 'Snow ascent',
      unit: 'upsteps',
      definition: 'The highest ledge reached by a standard snowflake on the twelve-step ladder before it settles. More upsteps means snow climbs farther, not a greater depth of snowfall.',
      maximum: 12,
    },
    packing: [
      { id: 'hooks', name: 'Hinge-line hooks', reason: 'Keep the expedition satchel on the broad marked handline.' },
      { id: 'ballast', name: 'Pocket ballast', reason: 'Stops loose paper samples from joining the upward snow.' },
      { id: 'glass', name: 'Dark snowglass', reason: 'Makes white flakes legible against the pale mountain faces.' },
      { id: 'gloves', name: 'Wool instrument gloves', reason: 'Leave enough finger movement to reset the cold ladder gauge.' },
    ],
    forecasts: {
      dawn: {
        short: 'Three-step flurries',
        condition: 'Snow considers the first ledge.',
        warmth: -7, wind: 3, direction: 'Valley → lower hinge', veils: 2, reading: 3,
        summary: 'A three-ribbon uphill draft carries the first flakes to the third step. The high folds remain bare and clearly outlined above the low, hesitant flurries.',
        route: 'The broad southern hinge is open to the ladder house. Keep the gauge reset low; no flake has reached the upper handline.',
        fieldNote: '06:00. Three upsteps, then a long pause. The flakes gathered on the third ledge like walkers deciding whether to continue. The fourth step remained perfectly dark.',
        kit: ['gloves', 'glass'],
        packingNote: 'Use the wool gloves for the cold instrument reset and the dark snowglass to distinguish low flakes against the pale hinge.',
      },
      noon: {
        short: 'Upward flurries',
        condition: 'The snowfall is climbing.',
        warmth: -1, wind: 6, direction: 'South hinge → high folds', veils: 5, reading: 8,
        summary: 'The warmer hinge air lifts six ribbons and sends snow to step eight. Passing columns obscure five sightglass bars but leave the southern approach intermittently clear.',
        route: 'Stay on the broad handline between the hinge and the house. The higher cut-through has been removed from this watch’s route.',
        fieldNote: '12:00. Eight upsteps. A blank page escaped the clipboard and climbed with the snow, keeping a very respectable pace. Recovered it against the eighth rung.',
        kit: ['hooks', 'ballast'],
        packingNote: 'Clip the satchel with the hinge-line hooks and weight the loose pages. The noon updraft is strong enough to recruit a notebook.',
      },
      dusk: {
        short: 'Summit-bound snow',
        condition: 'Every flake wants a summit.',
        warmth: -5, wind: 8, direction: 'All hinges → summits', veils: 7, reading: 12,
        summary: 'An eight-ribbon lift drives flakes to the full twelve-step height. The summit folds disappear behind climbing snow while the valley floor is swept almost bare.',
        route: 'Make the observation from the ladder house window. The exposed hinge route is closed until the climbing column falls back below step eight.',
        fieldNote: '18:00. The twelfth step is white. Beyond it, snow continues toward a summit we can no longer see. Our instrument has reached its limit; the mountain has not.',
        kit: ['ballast', 'gloves'],
        packingNote: 'Weight the charts even indoors near the observation window. Keep the instrument gloves ready; this watch is recorded from the house.',
      },
      night: {
        short: 'Low climbing frost',
        condition: 'The summits keep their snow.',
        warmth: -11, wind: 2, direction: 'Lower valley → fifth ledge', veils: 3, reading: 5,
        summary: 'The lift weakens to two ribbons. New flakes reach only the fifth step, while the evening’s snow stays perched on the summits above three thin veils.',
        route: 'The house’s lower observation platform has reopened. The expedition does not cross the cold upper hinges during the night watch.',
        fieldNote: '23:00. Five upsteps for fresh snow. The summit cap has stayed where dusk left it, as if nailed to the crease. The ladder gives a small wooden complaint at every reset.',
        kit: ['gloves', 'hooks'],
        packingNote: 'The wool gloves are essential to the fictional eleven-below hearth reading. Clip the satchel to the lower platform’s handline.',
      },
    },
  },
  {
    id: 'lantern-shelf',
    number: '06',
    name: 'Lantern Shelf',
    region: 'Far Night Coast',
    grid: 'B / 2',
    map: [77, 116],
    landscape: 'shelf',
    tagline: 'At the edge of the dark ocean, the aurora can be wound onto a spool.',
    geographyTitle: 'Light becomes something to carry.',
    geography: [
      'A long shelf of chalk-blue ice projects over an ocean too dark to show its own horizon. Above it, ribbons of aurora condense into fine, luminous thread. The thread has no weight until someone tries to carry it away; then it becomes exactly as heavy as the memory it illuminates.',
      'The coast’s small observatory keeps its windows shuttered through the bright hours. At night the keeper opens a narrow collecting slit and winds the descending light onto empty spools. Older spools are wrapped in blackout cloth so their forgotten stories do not keep the newer ones awake.',
    ],
    approach: 'Follow the black guide-rope along the inland face to the shutter house. The projecting outer shelf is reserved for unmanned collectors.',
    station: 'The Shutter House',
    observer: 'Neri Wisp, keeper of condensed light',
    instrument: 'A palm-wide spool turned once during each swing of the coast bell.',
    section: 'Section F–F′ · the light-catching coast',
    diagramDescription: 'A faceted ice shelf projects above a dark ocean. Long, curved aurora curtains descend from the sky, gathering as yellow threads near a small shuttered observatory on the cliff.',
    features: ['Aurora curtain / thread source', 'Shutter house / light collector', 'Outer shelf / unoccupied ice'],
    measure: {
      name: 'Aurora fall',
      unit: 'spools',
      definition: 'Palm-wide spools filled with condensed sky-thread during one coast-bell swing. More spools means a heavier fall of fictional light, not an astronomical brightness measurement.',
      maximum: 18,
    },
    packing: [
      { id: 'wrap', name: 'Blackout spool wrap', reason: 'Keeps collected light from spilling its stories into the rest of the kit.' },
      { id: 'spool', name: 'Empty wooden spool', reason: 'Gathers the sky-thread without the tangles made by a loose bundle.' },
      { id: 'jar', name: 'Insulated sample jar', reason: 'Holds the short-lived drops that form where warm light touches ice.' },
      { id: 'mittens', name: 'Felt collecting mittens', reason: 'Guide cold luminous thread without snagging it on coat buttons.' },
    ],
    forecasts: {
      dawn: {
        short: 'Last light-threads',
        condition: 'The night is being reeled in.',
        warmth: 1, wind: 3, direction: 'Ocean → inland shelf', veils: 3, reading: 5,
        summary: 'The aurora thins to five spools per bell swing. A light onshore draft bends the remaining threads inland, and the shelf emerges through three translucent veils.',
        route: 'The inland guide-rope is open to the shutter house. The keeper is collecting the last threads before closing the upper slit.',
        fieldNote: '06:00. Five spools, each paler than the last. One thread held an image of a boat approaching from inland. Wrapped it before the apprentice could recognize the passengers.',
        kit: ['spool', 'wrap'],
        packingNote: 'Bring an empty spool and blackout wrap for the last night-threads. The quieter dawn fall is the easiest collection round to follow.',
      },
      noon: {
        short: 'A single pale thread',
        condition: 'The sky closes its curtains.',
        warmth: 6, wind: 2, direction: 'Along the inland face', veils: 1, reading: 1,
        summary: 'Only one pale spool of thread falls during a bell swing. The sky is nearly clear; the warmest hearth reading of the day turns stray light at the ice edge into small glowing drops.',
        route: 'The inland survey path is clear. Collection moves to the house’s shaded drip tray; the outer ice is not a visitor route.',
        fieldNote: '12:00. One spool from a thread almost too pale to see. The drip tray held three luminous drops. By the time I fetched the notebook they had forgotten their color.',
        kit: ['jar', 'wrap'],
        packingNote: 'Take the insulated jar for the short-lived light-drops in the shaded tray. Keep yesterday’s spools covered even when the new fall looks faint.',
      },
      dusk: {
        short: 'Gathering aurora',
        condition: 'The first curtains take weight.',
        warmth: 0, wind: 5, direction: 'Dark ocean → collecting slit', veils: 4, reading: 9,
        summary: 'Nine spools descend per swing as the aurora gathers into broad curtains. A five-ribbon onshore flow bends them toward the collecting slit and blurs the far shelf behind four veils.',
        route: 'Follow the inland rope directly to the house. The keeper has begun the paired-spool collection and the outer platform is closed.',
        fieldNote: '18:00. Nine spools and the first heavy curtain. A coil brightened whenever anyone mentioned home. We moved it to the far cupboard and agreed to discuss the weather.',
        kit: ['spool', 'mittens'],
        packingNote: 'Use the collecting mittens and keep a spare spool within reach. The keeper’s dusk method winds two spools alternately to avoid tangles.',
      },
      night: {
        short: 'Heavy lightfall',
        condition: 'A sky full of unfinished stories.',
        warmth: -4, wind: 7, direction: 'Ocean → shutter house', veils: 6, reading: 18,
        summary: 'The fall reaches eighteen spools, the coast’s heaviest recorded watch in this edition. Seven ribbons pull toward the house while overlapping aurora curtains hide six sightglass bars.',
        route: 'Observe inside the shutter house through the collecting slit. The guide-rope beyond the door is lost behind the thick descending light.',
        fieldNote: '23:00. Eighteen spools. The shelves are glowing through two layers of cloth. For a moment the whole room remembered a summer none of us had lived through.',
        kit: ['wrap', 'mittens'],
        packingNote: 'Keep the blackout wrap open beside the collecting mittens. This heavy watch is worked inside the house, one covered spool at a time.',
      },
    },
  },
];

export function getDestination(id: string): Destination | undefined {
  return destinations.find((destination) => destination.id === id);
}

export function isWatchId(value: string): value is WatchId {
  return watches.some((watch) => watch.id === value);
}

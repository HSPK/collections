export type StationId = 'laundromat' | 'library' | 'orbit' | 'orchard';

export interface Station {
  id: StationId;
  number: string;
  frequency: string;
  name: string;
  shortName: string;
  color: string;
  invitation: string;
  character: string;
  place: string;
  sketchCaption: string;
  storyTitle: string;
  story: readonly string[];
  objects: readonly string[];
  recipe: readonly { name: string; detail: string }[];
  notes: readonly { heading: string; text: string }[];
  programs: readonly { time: string; title: string; description: string }[];
}

export const stations: readonly Station[] = [
  {
    id: 'laundromat',
    number: '01',
    frequency: '88.4',
    name: 'Midnight Laundromat',
    shortName: 'Laundromat',
    color: '#9b452e',
    invitation: 'A warm window at the wet end of the street.',
    character: 'Slow machinery · porcelain drips',
    place: 'The last shop on Cinder Street, beside the turning circle',
    sketchCaption: 'Machine 04. The empty chair is not reserved.',
    storyTitle: 'Leave a little room in the drum.',
    story: [
      'The laundromat occupies the narrow space between a closed bakery and the place where the night bus turns around. Inside, the windows are warm enough to turn rain into a second, blurrier street. Mara, who keeps the keys, has put a blue enamel bowl under the ceiling’s only drip. She moves it two inches to the left each winter. The building seems to be traveling very slowly.',
      'At the folding table, a ferry mechanic smooths a sheet with both forearms. Nobody asks whose bed it belongs to. Machine 04 carries a handwritten instruction: leave a little room in the drum. This is useful advice for clothes and, Mara thinks, for the rest of an evening. Between cycles, the washers settle into a low, uneven hum. A loose button turns once more after everything else has stopped.',
      'There are three things to do before closing: empty the lint drawer, straighten the chair facing the door, and check the pocket jar for bus fare. The shop never keeps money found in clothes. Tonight the jar contains two coins, a brass screw, and a folded drawing of a dog. Mara leaves the light over the drawing on. The next shift will know what to do with the screw.',
    ],
    objects: ['Blue enamel drip bowl', 'Pocket jar, lid missing', 'One mended folding chair'],
    recipe: [
      { name: 'Turning drums', detail: 'Low sine and triangle tones, with a slow, shallow change in loudness. No recorded machinery.' },
      { name: 'Water in the pipes', detail: 'Locally made noise softened by a low-pass filter and a second, slower swell.' },
      { name: 'The enamel bowl', detail: 'Small falling sine tones, spaced unevenly, with rounded attacks instead of sharp clicks.' },
      { name: 'Rinse cycle', detail: 'An occasional short, filtered-noise swell. The cycles overlap without forming a beat.' },
    ],
    notes: [
      { heading: 'The pocket jar', text: 'Do not sort the objects by value. Sort them by whether someone might come back. The dog drawing has been here nine days and remains in the second category.' },
      { heading: 'A small repair', text: 'The left rear foot of Machine 04 rests on a square of cork. Replacing it with metal makes the whole shop hum in sympathy. Cork is part of the instrument now.' },
      { heading: 'Weather indoors', text: 'A fast drip does not always mean more rain. Sometimes the roof has simply remembered a little water. Empty the bowl before deciding what kind of night it is.' },
    ],
    programs: [
      { time: '00:10', title: 'The pocket inventory', description: 'Mara writes down what the day left behind. A key with no teeth is described as “possibly a keepsake,” never “useless.”' },
      { time: '02:40', title: 'One more rinse', description: 'The ferry mechanic waits for the final sheet. The street outside belongs to buses, puddles, and a bakery delivery that is always early.' },
      { time: '04:55', title: 'Chairs off the floor', description: 'A quiet sweep under the machines. The bowl is emptied, the cork checked, and the light above the pocket jar left on for the morning keeper.' },
    ],
  },
  {
    id: 'library',
    number: '02',
    frequency: '93.7',
    name: 'Underwater Library',
    shortName: 'Library',
    color: '#366264',
    invitation: 'There is still a reading room below the tide.',
    character: 'Muffled glass · water · soft paper',
    place: 'Reading Room B, twelve meters below the old harbor',
    sketchCaption: 'Shelf B / 12 m. Books remain on the dry side of the glass.',
    storyTitle: 'Please return the tide table.',
    story: [
      'The library was built on the quay before the harbor decided to keep the quay. A glass passage now leads down from the tram stop to Reading Room B. The books are dry. The view is not. Every morning, Ivo wipes salt from the outside of the entrance bell and places a clean towel beside the return slot. The bell sounds smaller underwater, as if it is being polite.',
      'Shelf B holds atlases of streets that can still be seen through the window. Their blue pencil amendments are never erased; a new coastline is drawn next to the old one. Readers use smooth stones to keep the pages open. One stone has migrated from the geology shelf to poetry and back again so often that it has its own circulation card.',
      'The principal concern is not a leak. It is the crab that sits on the exterior ledge during afternoon reading. Whenever a page turns, the crab moves one leg. Ivo suspects it is learning to count. He has put the tide table against the window, but cannot tell whether this is helpful or rude. At closing, he leaves the desk lamp pointed toward the harbor and stamps all overdue notices with the same word: whenever.',
    ],
    objects: ['A stone with a library card', 'Coastline in blue pencil', 'Towel beside the return slot'],
    recipe: [
      { name: 'The submerged room', detail: 'Two soft sine tones behind a low-pass filter, swelling together very slowly.' },
      { name: 'Water beyond the glass', detail: 'A narrow band of locally generated noise, with its filter drifting gently up and down.' },
      { name: 'Shelf resonances', detail: 'Long, rounded tones with a slight pitch bend. Their upper frequencies are deliberately muffled.' },
      { name: 'A page turns', detail: 'Brief, quiet band-pass noise with an eased envelope; synthetic paper, not a field recording.' },
    ],
    notes: [
      { heading: 'Circulation policy', text: 'The page-weight stone may be borrowed, but not taken upstairs. Its card lists “entire harbor” as a previous address. No one has asked for a smaller one.' },
      { heading: 'At the window', text: 'The crab favors the index, not the illustrations. Put the book far enough from the glass that its reflection does not cover the words. This is ordinary courtesy.' },
      { heading: 'Humidity ledger', text: 'Readings are taken at the same corner of the same table. A wet sleeve once produced three weeks of unnecessary maintenance. The ledger now includes a sleeve column.' },
    ],
    programs: [
      { time: '07:15', title: 'Coastline corrections', description: 'A penciled survey of the view from Shelf B. Today the old taxi rank receives a small blue border and the annotation “good for eels.”' },
      { time: '13:30', title: 'Reading to the ledge', description: 'Ivo props an index against the window. Inside, a page turns. Outside, the crab considers the next number.' },
      { time: '20:05', title: 'The dry-book check', description: 'A towel, a lamp, and a slow walk along the shelves. All books stay in the reading room tonight; the harbor may keep its stories a little longer.' },
    ],
  },
  {
    id: 'orbit',
    number: '03',
    frequency: '101.2',
    name: 'Low Orbit Shipping',
    shortName: 'Low orbit',
    color: '#695337',
    invitation: 'A small dispatch office with a very long view.',
    character: 'Quiet subcarrier · soft packets · chimes',
    place: 'Dispatch cabin 6, on the fictional courier ring Larch',
    sketchCaption: 'Cabin 06. The cup is attached; the spoon is not.',
    storyTitle: 'Nothing urgent in the next container.',
    story: [
      'Cabin 6 is a shipping office with a planet where the loading yard ought to be. Len sits at a desk bolted to two walls, checking the manifest for a cargo of seed trays, replacement stair treads, and one very patient cello case. The case is empty. Its owner is sending it ahead so that, on arrival, there will already be something familiar in the room.',
      'Dispatch is mostly waiting. A thin carrier tone holds the channel open; small groups of notes mark local, imaginary packet checks. They do not encode messages. Between them, Len catches a wandering spoon with a loop of thread. The office cup has a proper tether, but the spoon’s paperwork was apparently overlooked. It has now visited every surface in the cabin except the ceiling, which Len refuses to distinguish from the floor.',
      'The difficult item is a parcel labeled keep upright, containing a sapling that has no opinion on the matter. Len turns it toward the window for half of each shift, then toward the desk lamp for the other half. Before handing over, he adds a line to the cargo notes: leaves intact; orientation negotiable. Far below, a bank of clouds resembles packing wool. Nobody in this office is allowed to throw anything overboard.',
    ],
    objects: ['A tethered enamel cup', 'Parcel: orientation negotiable', 'A spoon on borrowed thread'],
    recipe: [
      { name: 'An open channel', detail: 'Very quiet low sine tones and a shallow, slow swell. There is no continuous static bed.' },
      { name: 'Local packet checks', detail: 'Two or three short, rounded sine pulses separated by small silences. They carry no encoded data.' },
      { name: 'Arrival marker', detail: 'An occasional soft chime with three fading sine partials. No alarm, signal sample, or recognizable tune.' },
      { name: 'Room to wait', detail: 'Long gaps are part of this recipe. Nothing is fetched, and the fictional schedule does not trigger sounds.' },
    ],
    notes: [
      { heading: 'The empty case', text: 'Do not consolidate this shipment. The cello case travels alone because its purpose is to arrive first. “Empty” is a description of its contents, not its importance.' },
      { heading: 'Orientation', text: 'The sapling has grown toward the lamp by three millimeters. Turn the parcel, not the label. A second keeper has added “ask the tree again tomorrow.”' },
      { heading: 'Loose equipment', text: 'The spoon is now checked at shift change alongside the air seals. Small routines make a cabin habitable. Its thread must never share the cup’s knot.' },
    ],
    programs: [
      { time: 'Shift 01', title: 'The long manifest', description: 'Len reads the descriptions, not the destination codes. Six crates of stair treads are evidence that somewhere, people expect to keep going upstairs.' },
      { time: 'Shift 02', title: 'A parcel turns', description: 'The sapling faces the planet. The empty case moves one berth closer to departure. The spoon receives a new length of thread.' },
      { time: 'Shift 03', title: 'Cabin handover', description: 'A quiet inventory of objects that should still be attached. The incoming keeper signs for the cargo, the cup, and the view.' },
    ],
  },
  {
    id: 'orchard',
    number: '04',
    frequency: '107.6',
    name: 'Salt Orchard',
    shortName: 'Salt orchard',
    color: '#586443',
    invitation: 'The trees have learned to keep the sea company.',
    character: 'Low wind · wooden bells · leaf rustle',
    place: 'The inland side of the sea wall, beyond the last milepost',
    sketchCaption: 'Row 07. The smallest bell is carved from a fallen branch.',
    storyTitle: 'A windbreak made of patient trees.',
    story: [
      'On the inland side of the sea wall, the orchard leans away from a sea it cannot quite see. Its fruit is small and its gates are heavy. Each tree wears a wooden bell made from a branch that fell in a previous winter. The bells do not ring together. Nessa, the keeper, says this is how she can tell whether the wind is crossing the rows or traveling along them.',
      'The first task is to brush salt from the young leaves with a dry, soft paintbrush. Water would do it faster, but the well must last until the next delivery. A chipped green mug marks how much each sapling may have. Nessa fills it to the painted line, then gives the smallest tree an extra spoonful from her own flask. The tree is not told about this arrangement.',
      'Near the seventh row, a gate swings freely without ever quite closing. It has been measured, planed, and discussed. The current theory is that it is waiting for someone. Nessa leaves a wooden wedge beneath it and ties the day’s notes to the fence, above the reach of curious sheep. By evening, the bells have dried. Their voices are a little higher. Tomorrow she will decide whether that counts as weather.',
    ],
    objects: ['Paintbrush for the leaves', 'Green mug with a fill line', 'A gate with a wooden wedge'],
    recipe: [
      { name: 'Wind through the rows', detail: 'Locally generated noise, with deep rumble and sharp hiss filtered away. Its loudness and color drift slowly.' },
      { name: 'Wooden bells', detail: 'Rounded triangle tones with a faint, inexact sine overtone and a short, soft decay.' },
      { name: 'A second branch', detail: 'Some gestures include a quieter answering bell. The intervals vary; there is no repeating melody.' },
      { name: 'Dry leaves', detail: 'Small filtered-noise envelopes between the bells, never a continuous bright rattle.' },
    ],
    notes: [
      { heading: 'Water allowance', text: 'The green mug’s painted line is the official measure. Do not repaint it from memory. Last spring the allowance grew by a finger’s width and nobody admitted responsibility.' },
      { heading: 'Bell making', text: 'Use fallen wood only. A bell should fit loosely around its cord, and the cord should leave room for the branch to grow. A tree is not a convenient hook.' },
      { heading: 'The seventh gate', text: 'Leave the wedge in place until the wind changes. The sheep are indifferent to the gate’s philosophical difficulties and very interested in the notebook.' },
    ],
    programs: [
      { time: '06:20', title: 'Brushwork', description: 'Salt is lifted from one leaf at a time. Nessa listens for the first wooden bell before deciding which row needs attention.' },
      { time: '12:45', title: 'The measured mug', description: 'A careful round of the saplings with the green mug and a private flask. The sea is audible from the ladder, but not from the ground.' },
      { time: '18:10', title: 'Notes above the sheep', description: 'The day’s pages are tied high on the fence. The gate is left undecided, and the smallest bell dries in the last patch of sun.' },
    ],
  },
];

export function stationFromHash(hash: string): number {
  return stations.findIndex((station) => hash === `#station-${station.id}`);
}

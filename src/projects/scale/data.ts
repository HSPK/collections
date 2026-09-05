import { toMetres } from './engine';
import type { Unit } from './engine';

export const sources = {
  dna: {
    publisher: 'Biology LibreTexts',
    title: 'DNA Structure',
    url: 'https://bio.libretexts.org/Bookshelves/Introductory_and_General_Biology/Principles_of_Biology/02%3A_Chapter_2/12%3A_DNA_and_Chromosome_Structure/12.01%3A_DNA_Structure',
  },
  bacterium: {
    publisher: 'National Academies / NCBI Bookshelf',
    title: 'A Biophysical Chemist’s Thoughts on Cell Size',
    url: 'https://www.ncbi.nlm.nih.gov/books/NBK224770/',
  },
  blood: {
    publisher: 'Clinical Methods / NCBI Bookshelf',
    title: 'Peripheral Blood Smear',
    url: 'https://www.ncbi.nlm.nih.gov/books/NBK263/',
  },
  sand: {
    publisher: 'U.S. Geological Survey',
    title: 'Sediment nomenclature — Wentworth grade scale',
    url: 'https://pubs.usgs.gov/of/2006/1195/htmldocs/nomenclature.htm',
  },
  quarter: {
    publisher: 'United States Mint',
    title: 'Coin Specifications',
    url: 'https://www.usmint.gov/learn/coins-and-medals/circulating-coins/coin-specifications',
  },
  tennis: {
    publisher: 'International Tennis Federation',
    title: '2025 Technical Booklet — ball specifications (PDF)',
    url: 'https://www.itftennis.com/media/14104/2025-technical-booklet.pdf',
  },
  whale: {
    publisher: 'NOAA Fisheries',
    title: 'Blue Whale — appearance',
    url: 'https://www.fisheries.noaa.gov/species/blue-whale',
  },
  tree: {
    publisher: 'National Park Service',
    title: 'The General Sherman Tree — statistics',
    url: 'https://www.nps.gov/seki/learn/nature/sherman.htm',
  },
  tower: {
    publisher: 'The Eiffel Tower',
    title: 'Why does the Eiffel Tower change size?',
    url: 'https://www.toureiffel.paris/en/news/history-and-culture/why-does-eiffel-tower-change-size',
  },
  marathon: {
    publisher: 'World Athletics',
    title: 'Marathon',
    url: 'https://worldathletics.org/disciplines/road-running/marathon',
  },
  moon: {
    publisher: 'NASA Science',
    title: 'Moon Facts — size and distance',
    url: 'https://science.nasa.gov/moon/facts/',
  },
  earth: {
    publisher: 'NASA Science',
    title: 'Earth Facts — equatorial diameter',
    url: 'https://science.nasa.gov/earth/facts/',
  },
  sun: {
    publisher: 'NASA Science',
    title: 'Sun Facts — size and stellar neighbours',
    url: 'https://science.nasa.gov/sun/facts/',
  },
  au: {
    publisher: 'Observatoire de Paris',
    title: 'The new definition of the astronomical unit',
    url: 'https://observatoiredeparis.psl.eu/the-new-definition-of-the-astronomical-unit.html',
  },
  galaxy: {
    publisher: 'NASA — Imagine the Universe!',
    title: 'The Milky Way Galaxy',
    url: 'https://imagine.gsfc.nasa.gov/science/objects/milkyway1.html',
  },
} as const;

export type SourceId = keyof typeof sources;

export const domains = [
  { id: 'microscopic', name: 'Microscopic', description: 'The architecture of living matter.', entry: 'dna' },
  { id: 'everyday', name: 'Everyday', description: 'A few things you could hold.', entry: 'sand' },
  { id: 'terrestrial', name: 'On Earth', description: 'Living giants, built heights and routes.', entry: 'whale' },
  { id: 'planetary', name: 'Solar system', description: 'Worlds and the space between them.', entry: 'earth' },
  { id: 'cosmic', name: 'Beyond the Sun', description: 'A neighbouring star; our whole galaxy.', entry: 'milky-way' },
] as const;

export type DomainId = typeof domains[number]['id'];
export type IllustrationId =
  | 'dna' | 'bacterium' | 'blood' | 'sand' | 'quarter' | 'tennis' | 'whale'
  | 'tree' | 'tower' | 'marathon' | 'moon' | 'earth' | 'moon-distance'
  | 'sun' | 'au' | 'proxima' | 'galaxy';

export interface ScaleEntry {
  id: string;
  name: string;
  domain: DomainId;
  kind: 'object' | 'distance';
  measure: string;
  metres: number;
  unit: Unit;
  digits: number;
  approximate: boolean;
  qualification: string;
  illustration: IllustrationId;
  summary: string;
  context: string;
  caveat: string;
  source: SourceId;
  sourceNote: string;
}

/** Canonical lengths are metres. Keep the catalogue ordered from small to large. */
export const catalogue: readonly ScaleEntry[] = [
  {
    id: 'dna', name: 'DNA double helix', domain: 'microscopic', kind: 'object',
    measure: 'Helix diameter', metres: toMetres(2, 'nm'), unit: 'nm', digits: 1,
    approximate: true, qualification: 'Approximate · B-form DNA', illustration: 'dna',
    summary: 'The instructions for living things are written on a remarkably narrow ribbon.',
    context: 'Two molecular strands wind around one another, with paired bases between them. Here we measure the width across the double helix, not the much greater length of a DNA molecule.',
    caveat: 'This is the familiar B-form double helix. DNA can take other conformations; 2 nm is a structural rule of thumb, not an exact boundary around every molecule.',
    source: 'dna',
    sourceNote: 'LibreTexts gives a 2 nm double-helix diameter. The illustration is a schematic, not an atomic model.',
  },
  {
    id: 'e-coli', name: 'E. coli cell', domain: 'microscopic', kind: 'object',
    measure: 'Cell length', metres: toMetres(2, 'um'), unit: 'um', digits: 1,
    approximate: true, qualification: 'Representative cell', illustration: 'bacterium',
    summary: 'A whole bacterial cell is roughly a thousand DNA-helix widths long.',
    context: 'Escherichia coli is often used as a biological reference ruler. This rod-shaped cell has room for DNA, ribosomes and the molecular machinery needed to grow and divide.',
    caveat: 'Length varies with strain, growth conditions and the stage of cell division. This reference is not a maximum or a universal bacterial size.',
    source: 'bacterium',
    sourceNote: 'The National Academies chapter models a typical E. coli cell as 2 µm long and 1 µm in diameter. Only its length is used here.',
  },
  {
    id: 'red-cell', name: 'Red blood cell', domain: 'microscopic', kind: 'object',
    measure: 'Cell diameter', metres: toMetres(7.5, 'um'), unit: 'um', digits: 2,
    approximate: true, qualification: 'Typical human cell', illustration: 'blood',
    summary: 'A flexible, dimpled disc carries oxygen through the body.',
    context: 'A mature human red blood cell is biconcave: thinner in the middle than at its rim. It is not a flat coin, and its shape can change as it squeezes through small blood vessels.',
    caveat: 'This is a typical diameter of a normal human cell, not its thickness. Individual cells and measurements vary.',
    source: 'blood',
    sourceNote: 'Clinical Methods describes normal human red cells as biconcave discs with a mean diameter of about 7.5 µm.',
  },
  {
    id: 'sand', name: 'A grain of sand', domain: 'everyday', kind: 'object',
    measure: 'Example grain diameter', metres: toMetres(0.5, 'mm'), unit: 'mm', digits: 1,
    approximate: true, qualification: 'Chosen example · not an average', illustration: 'sand',
    summary: '“Sand” describes a size class, not one particular mineral.',
    context: 'A sand grain might be quartz, a shell fragment or volcanic material. The 0.5 mm example here is a useful bridge between microscopic structures and things you can see without a microscope.',
    caveat: 'The source defines sand as a range, roughly 0.0625–2 mm. We choose 0.5 mm inside that range; the source does not claim all sand has this diameter.',
    source: 'sand',
    sourceNote: 'USGS gives the Wentworth sand-size interval as greater than 62.5 µm and less than 2 mm. The plotted point is explicitly illustrative.',
  },
  {
    id: 'quarter', name: 'U.S. quarter', domain: 'everyday', kind: 'object',
    measure: 'Coin diameter', metres: toMetres(24.26, 'mm'), unit: 'mm', digits: 4,
    approximate: false, qualification: 'Nominal mint specification', illustration: 'quarter',
    summary: 'A familiar pocket-sized reference with a specified diameter.',
    context: 'Unlike a living cell or a sand grain, a circulating quarter is manufactured to a design specification. Here the ruler crosses the face of the coin; it does not measure the coin’s thickness.',
    caveat: '24.26 mm is the Mint’s nominal specification for the circulating quarter dollar. Wear and manufacturing tolerances are not modelled.',
    source: 'quarter',
    sourceNote: 'The United States Mint coin specification table lists the quarter dollar diameter as 24.26 mm.',
  },
  {
    id: 'tennis-ball', name: 'Tennis ball', domain: 'everyday', kind: 'object',
    measure: 'Ball diameter', metres: toMetres(6.7, 'cm'), unit: 'cm', digits: 2,
    approximate: true, qualification: 'Representative Type 2 ball', illustration: 'tennis',
    summary: 'Even a standard sports ball is allowed a range of sizes.',
    context: 'The International Tennis Federation specifies the properties of tournament tennis balls. A diameter of 6.7 cm lies midway within the allowed interval for a standard Type 2 ball.',
    caveat: 'Type 2 diameters run from 6.54 to 6.86 cm. Other ball types exist, so this is a selected reference rather than a measurement of every tennis ball.',
    source: 'tennis',
    sourceNote: 'The ITF Technical Booklet’s ball specifications give the Type 2 diameter interval. The atlas uses its 6.7 cm midpoint.',
  },
  {
    id: 'whale', name: 'Blue whale', domain: 'terrestrial', kind: 'object',
    measure: 'Body length', metres: 30, unit: 'm', digits: 2,
    approximate: true, qualification: 'Example of a large adult', illustration: 'whale',
    summary: 'An animal that makes a metre feel like a very small unit.',
    context: 'Blue whales filter krill from seawater with baleen plates. They have long, streamlined bodies; the reference here runs from the snout to the end of the tail, not across the flukes.',
    caveat: '30 m represents a large adult, not the species average or a record. Subspecies differ: NOAA reports Antarctic individuals reaching about 110 ft (33.5 m).',
    source: 'whale',
    sourceNote: 'NOAA describes the variation between populations and lengths up to about 110 ft in Antarctic blue whales. The atlas chooses a rounded, plausible large-adult length.',
  },
  {
    id: 'general-sherman', name: 'General Sherman tree', domain: 'terrestrial', kind: 'object',
    measure: 'Height above base', metres: 83.8, unit: 'm', digits: 3,
    approximate: true, qualification: 'Reported tree height', illustration: 'tree',
    summary: 'Its claim to fame is volume, but its height is impressive too.',
    context: 'This giant sequoia grows in California’s Sequoia National Park. The National Park Service describes it as the world’s largest tree by volume—not the world’s tallest tree.',
    caveat: 'We compare its reported height above the base, not trunk diameter, circumference or volume. A living tree is not a fixed manufactured standard.',
    source: 'tree',
    sourceNote: 'The National Park Service’s statistics table gives a height above base of 83.8 m (274.9 ft).',
  },
  {
    id: 'eiffel-tower', name: 'Eiffel Tower', domain: 'terrestrial', kind: 'object',
    measure: 'Height including antennas', metres: 330, unit: 'm', digits: 3,
    approximate: true, qualification: 'Height after the 2022 antenna', illustration: 'tower',
    summary: 'A tower that grew taller long after its builders had finished.',
    context: 'Radio and television antennas have extended the Paris landmark beyond its original height. The number here reaches the top of the antennas, rather than stopping at the viewing platforms.',
    caveat: '330 m includes the antenna installed in 2022. The iron structure also expands and contracts slightly with temperature.',
    source: 'tower',
    sourceNote: 'The official Eiffel Tower website states a current height of 330 m including antennas, and explains thermal changes in size.',
  },
  {
    id: 'marathon', name: 'Marathon course', domain: 'terrestrial', kind: 'distance',
    measure: 'Distance along a course', metres: toMetres(42.195, 'km'), unit: 'km', digits: 5,
    approximate: false, qualification: 'Standard race distance', illustration: 'marathon',
    summary: 'A distance you travel, not the width of a city or an object.',
    context: 'A marathon’s official distance was standardised in 1921. To compare it with a height or a diameter, imagine straightening the entire route into one line.',
    caveat: 'This is the standard course distance. It is not the straight-line separation between start and finish, nor a guarantee of the distance a runner’s GPS records.',
    source: 'marathon',
    sourceNote: 'World Athletics gives the standard marathon distance as 42.195 km.',
  },
  {
    id: 'moon', name: 'The Moon', domain: 'planetary', kind: 'object',
    measure: 'Approximate diameter', metres: toMetres(3_480, 'km'), unit: 'km', digits: 3,
    approximate: true, qualification: 'Rounded planetary dimension', illustration: 'moon',
    summary: 'Our nearby world is much smaller than Earth, but hardly small.',
    context: 'The Moon’s pale highlands and dark volcanic plains record a long geological history. We measure across the body of the Moon, not the distance needed to travel there.',
    caveat: 'This rounded diameter is twice NASA’s “about 1,740 km” radius. It deliberately avoids implying metre-level precision.',
    source: 'moon',
    sourceNote: 'NASA Moon Facts gives an approximate radius of 1,740 km. Diameter = 2 × radius, giving the 3,480 km reference here.',
  },
  {
    id: 'earth', name: 'Earth', domain: 'planetary', kind: 'object',
    measure: 'Equatorial diameter', metres: toMetres(12_756, 'km'), unit: 'km', digits: 5,
    approximate: true, qualification: 'Equator-to-equator', illustration: 'earth',
    summary: 'Our home makes a useful ruler for the rest of the solar system.',
    context: 'Earth is not a perfect sphere: it is slightly wider at the equator. This reference is a line through its centre between opposite points on the equator, not a journey around its surface.',
    caveat: 'This is equatorial diameter, not polar diameter or circumference. Those are different lengths and should not be substituted silently.',
    source: 'earth',
    sourceNote: 'NASA Earth Facts lists an equatorial diameter of 12,756 km.',
  },
  {
    id: 'earth-moon', name: 'Earth → Moon', domain: 'planetary', kind: 'distance',
    measure: 'Mean centre-to-centre distance', metres: toMetres(384_400, 'km'), unit: 'km', digits: 4,
    approximate: true, qualification: 'Orbital mean · not a fixed gap', illustration: 'moon-distance',
    summary: 'There is room for about thirty Earth diameters along this distance.',
    context: 'The Moon’s orbit is not a perfect circle, so its distance from Earth changes. The reference joins the two centres; diagrams in books often shrink this gap so both worlds remain visible.',
    caveat: '384,400 km is an average centre-to-centre distance. The empty surface-to-surface gap is smaller. Our diagram enlarges both bodies and is not an orbital plot.',
    source: 'moon',
    sourceNote: 'NASA Moon Facts gives an average distance from Earth of 384,400 km.',
  },
  {
    id: 'sun', name: 'The Sun', domain: 'planetary', kind: 'object',
    measure: 'Visible-surface diameter', metres: toMetres(1_400_000, 'km'), unit: 'km', digits: 2,
    approximate: true, qualification: 'Rounded photosphere diameter', illustration: 'sun',
    summary: 'Roughly a hundred Earth diameters span our nearest star.',
    context: 'The bright surface we see is the photosphere, a layer of hot gas rather than solid ground. The solar atmosphere extends far beyond this visible disc.',
    caveat: 'This is NASA’s rounded 1.4 million km diameter, not the reach of the corona or the solar wind. Never look directly at the Sun without proper eye protection.',
    source: 'sun',
    sourceNote: 'NASA Sun Facts states a diameter of about 1.4 million km and describes the photosphere.',
  },
  {
    id: 'astronomical-unit', name: 'One astronomical unit', domain: 'planetary', kind: 'distance',
    measure: 'Defined reference length', metres: toMetres(1, 'au'), unit: 'au', digits: 12,
    approximate: false, qualification: 'Exact unit definition', illustration: 'au',
    summary: 'An Earth–Sun-sized ruler, now defined rather than measured.',
    context: 'The astronomical unit is convenient for distances within the solar system. Since 2012, one au has meant exactly 149,597,870,700 metres.',
    caveat: 'The au is a fixed conventional length, approximately the Earth–Sun distance. It is not the constantly changing Earth–Sun separation at this moment.',
    source: 'au',
    sourceNote: 'Observatoire de Paris explains IAU Resolution 2012 B2 and the exact metre definition of the astronomical unit.',
  },
  {
    id: 'proxima', name: 'Sun → Proxima Centauri', domain: 'cosmic', kind: 'distance',
    measure: 'Distance between stars', metres: toMetres(4.24, 'ly'), unit: 'ly', digits: 3,
    approximate: true, qualification: 'Rounded stellar distance', illustration: 'proxima',
    summary: 'Even the Sun’s nearest stellar neighbour is years of light-travel away.',
    context: 'Proxima Centauri is a red dwarf in the Alpha Centauri system. The light-year is a unit of length: the distance light travels in a vacuum during a year.',
    caveat: '4.24 light-years is a rounded distance from the Sun, not Proxima’s diameter or a travel time for a spacecraft. Stars also move over time.',
    source: 'sun',
    sourceNote: 'NASA Sun Facts identifies Proxima Centauri as the Sun’s nearest stellar neighbour and places it 4.24 light-years away.',
  },
  {
    id: 'milky-way', name: 'The Milky Way', domain: 'cosmic', kind: 'object',
    measure: 'Approximate stellar-disk diameter', metres: toMetres(100_000, 'ly'), unit: 'ly', digits: 1,
    approximate: true, qualification: 'Order-of-magnitude disk estimate', illustration: 'galaxy',
    summary: 'The star-filled disc of our home galaxy takes light millennia to cross.',
    context: 'The Milky Way is a barred spiral galaxy, seen from within its own disc. Its edge is not a solid rim: a quoted diameter depends on which population of stars or material is included.',
    caveat: '100,000 light-years is an approximate stellar-disk reference, not the extent of the dark-matter halo. Other definitions and surveys produce larger diameters.',
    source: 'galaxy',
    sourceNote: 'NASA’s Imagine the Universe describes a stellar disk about 100,000 light-years in diameter. This is an educational approximation, not a sharp measured edge.',
  },
];

export const comparisonPresets = [
  { id: 'giants', title: 'Whale & tower', a: 'whale', b: 'eiffel-tower', note: 'An animal’s length against a landmark’s height.' },
  { id: 'tiny', title: 'Cell & sand', a: 'red-cell', b: 'sand', note: 'From the microscope to a grain you can see.' },
  { id: 'lunar', title: 'Earth & Moon distance', a: 'earth', b: 'earth-moon', note: 'A diameter compared with a centre-to-centre distance.' },
  { id: 'stellar', title: 'Sun & nearest star', a: 'sun', b: 'proxima', note: 'A star’s diameter against an interstellar distance.' },
] as const;

export const DEFAULT_ENTRY = 'whale';
export const DEFAULT_COMPARISON = comparisonPresets[0];
export const SOURCE_REVIEW_DATE = '2026-09-05';

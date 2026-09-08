export const LOCATIONS = ['village', 'wood', 'river', 'ruins', 'canopy', 'kiln', 'frost', 'crown'] as const;
export type LocationId = typeof LOCATIONS[number];
export const ELEMENTS = ['wood', 'ember', 'water'] as const;
export type Element = typeof ELEMENTS[number];
export const ELEMENT_NAMES: Record<Element, string> = { wood: '木', ember: '火', water: '水' };
export const COMPANIONS = ['bud', 'tide', 'coal'] as const;
export type CompanionId = typeof COMPANIONS[number];
export const ITEMS = ['twig', 'dew', 'amber', 'root-charm', 'rain-charm', 'ash-charm'] as const;
export type Item = typeof ITEMS[number];
export const ITEM_NAMES: Record<Item, string> = {
  twig: '落枝', dew: '露珠', amber: '季珀', 'root-charm': '护根符', 'rain-charm': '听雨符', 'ash-charm': '留灰符',
};
export const CHARMS = ['root-charm', 'rain-charm', 'ash-charm'] as const;
export type Charm = typeof CHARMS[number];
export const SKILLS = ['listen', 'shelter', 'path'] as const;
export type Skill = typeof SKILLS[number];
export const SKILL_NAMES: Record<Skill, string> = { listen: '听隙', shelter: '共伞', path: '踏枝' };
export const STANCES = ['echo', 'guard', 'offer'] as const;
export type Stance = typeof STANCES[number];
export const WILD_MOVES = ['靠近', '试探', '筑障'] as const;
export const HELP_MOVES = ['接引', '护持', '观望', '抗拒'] as const;
export const ENDINGS = ['renew', 'roam', 'anchor'] as const;
export type Ending = typeof ENDINGS[number];
export const CHOICES = ['ledger', 'roots', 'winter'] as const;
export type ChoiceId = typeof CHOICES[number];
export const OPTIONS = ['truth', 'shelve', 'release', 'retain', 'cede', 'follow'] as const;
export type Option = typeof OPTIONS[number];
export const SIDE_QUESTS = ['sleeve', 'ferry', 'bud-vow', 'tide-vow', 'coal-vow', 'witness'] as const;
export type SideQuest = typeof SIDE_QUESTS[number];
export type QuestId = Exclude<LocationId, 'village'> | SideQuest;
export const CURVE = [0, 4, 9, 15, 23, 32] as const;
export const LIMITS = { capacity: 72, stackLimit: 24 };
export const MAX_FOCUS = 12;
export const MAX_STRAIN = 7;

export interface Rune { cell: number; element: Element }
export interface Layout {
  runes: Rune[];
  formation: { id: CompanionId; cell: number }[];
  stance: Stance;
}
export interface Plan {
  wild: typeof WILD_MOVES[number];
  intention: string;
  companions: { id: CompanionId; move: typeof HELP_MOVES[number]; intention: string }[];
}
export interface Spirit {
  id: CompanionId;
  bond: number;
  trained: boolean;
  evolved: boolean;
  memory: string[];
}
export interface State {
  seed: number;
  location: LocationId;
  phase: 'travel' | 'ritual' | 'ending' | 'lost';
  completed: Exclude<LocationId, 'village'>[];
  gathered: LocationId[];
  quests: QuestId[];
  choices: Partial<Record<ChoiceId, Option>>;
  inventory: Record<Item, number>;
  crafted: Charm[];
  equipped: Charm | null;
  xp: number;
  skillPoints: number;
  skills: Skill[];
  party: Spirit[];
  focus: number;
  strain: number;
  harmony: number;
  turns: number;
  layout: Layout;
  ending: Ending | null;
  log: string[];
}
export type Command =
  | { type: 'travel'; location: LocationId }
  | { type: 'gather' | 'rest' | 'begin' | 'retreat' }
  | { type: 'layout'; layout: Layout }
  | { type: 'agent'; plan: Plan }
  | { type: 'craft' | 'equip'; charm: Charm }
  | { type: 'learn'; skill: Skill }
  | { type: 'recruit' | 'train' | 'evolve'; id: CompanionId }
  | { type: 'quest'; id: SideQuest }
  | { type: 'choose'; id: ChoiceId; option: Option }
  | { type: 'finish'; ending: Ending };

export interface Place {
  name: string;
  season: string;
  palette: [string, string, string, string];
  kind: 'village' | 'forest' | 'river' | 'ruins' | 'canopy' | 'kiln' | 'snow' | 'summit';
  source: number;
  target: number;
  trail: number[];
  walls: number[];
  marsh: number[];
  thorns: number[];
  need: number;
  wild: string;
  goal: string;
  trait: string;
}
export const PLACES: Record<LocationId, Place> = {
  village: { name: '缝芽村', season: '迟春', palette: ['#e4f0dc', '#6fa58a', '#274f48', '#ecac9a'], kind: 'village', source: 10, target: 14, trail: [10, 11, 12, 13, 14], walls: [], marsh: [], thorns: [], need: 0, wild: '檐下回声', goal: '让被遗漏的名字重新被人叫出。', trait: '怕喧哗，信任愿意等待的人。' },
  wood: { name: '倾耳苔林', season: '迟春', palette: ['#e0efca', '#75a884', '#244e46', '#f0baad'], kind: 'forest', source: 10, target: 14, trail: [10, 11, 12, 13, 14], walls: [2, 7, 17, 22], marsh: [8, 18], thorns: [6, 16], need: 6, wild: '伏穗', goal: '找回被村人当作路标砍下的听觉枝，不再替人无偿守夜。', trait: '谨慎而好奇；木句完整时愿意靠近，催促会令它筑障。' },
  river: { name: '倒铃浅川', season: '流夏', palette: ['#d9f0e9', '#73b9b4', '#2a5965', '#f5ce8b'], kind: 'river', source: 0, target: 4, trail: [0, 5, 6, 7, 8, 9, 4], walls: [2, 12, 22], marsh: [5, 7, 8, 9, 17], thorns: [20], need: 7, wild: '河卵合唱', goal: '把尚未孵出的河卵送到上游，不接受只保住渡船的修补。', trait: '多声而耐心，曾被许诺过三次；水灵陪同能减少戒心。' },
  ruins: { name: '白契石庭', season: '流夏', palette: ['#f0eee0', '#b6c3a4', '#58635d', '#da9a7e'], kind: 'ruins', source: 20, target: 4, trail: [20, 15, 10, 11, 12, 13, 14, 9, 4], walls: [1, 6, 16, 21], marsh: [24], thorns: [11, 13], need: 8, wild: '折岁翁', goal: '让契约有见证者而非主人；它也害怕失去管理季节的身份。', trait: '固执、重证据；公开旧账使它无法假装一切如常。' },
  canopy: { name: '悬叶驿', season: '金秋', palette: ['#f1e5bd', '#bbb477', '#687659', '#e29269'], kind: 'canopy', source: 0, target: 24, trail: [0, 1, 2, 7, 12, 17, 22, 23, 24], walls: [5, 6, 8, 9, 15, 16, 18, 19], marsh: [], thorns: [7, 12, 17], need: 8, wild: '借风匣', goal: '带走驿站积压的告别信，不再把迁徙误作背叛。', trait: '轻快却回避伤心的句子；棉芽的勇气会感染它。' },
  kiln: { name: '眠灰窑', season: '金秋', palette: ['#f5decd', '#c3a28b', '#685750', '#f0a179'], kind: 'kiln', source: 20, target: 24, trail: [20, 15, 16, 17, 18, 19, 24], walls: [2, 7, 12, 22], marsh: [4], thorns: [10, 14], need: 9, wild: '炭铃', goal: '给窑里尚未出生的灰芽留一点余温，而不是永远燃烧自己。', trait: '热心到不肯求救；火字之后必须有木字承接，否则它害怕失控。' },
  frost: { name: '雪根眠湾', season: '初冬', palette: ['#edf5ef', '#adcbd0', '#587278', '#dca7b1'], kind: 'snow', source: 4, target: 20, trail: [4, 9, 14, 13, 12, 11, 10, 15, 20], walls: [1, 6, 18, 23], marsh: [10, 11, 13, 14], thorns: [0], need: 10, wild: '眠湾白絮', goal: '取回人类借走的冬眠时日；只要冬天仍被视为失败，它就不会消散。', trait: '安静、直接，不愿为漂亮的愿望牺牲幼灵。' },
  crown: { name: '行季冠顶', season: '交季', palette: ['#e8eed4', '#89b9a1', '#37635c', '#edb981'], kind: 'summit', source: 22, target: 2, trail: [22, 17, 12, 7, 2], walls: [6, 8, 16, 18], marsh: [11, 13], thorns: [7, 17], need: 12, wild: '四候之结', goal: '将春夏秋冬从固定的锁扣上解开，让每个生命都能拒绝不公平的契约。', trait: '由所有未兑现的承诺合成；记得同行者的每一次选择。' },
};

export const SPIRITS: Record<CompanionId, { name: string; evolved: string; element: Element; home: LocationId; quest: SideQuest; goal: string; flaw: string; ability: string }> = {
  bud: { name: '棉芽', evolved: '绒冠棉芽', element: 'wood', home: 'wood', quest: 'bud-vow', goal: '亲自选择生长方向，不再充当被插在路边的活路牌。', flaw: '总把别人的犹豫当作嫌弃，容易缩回叶褶。', ability: '羁绊二解锁悬叶驿；蜕变后隔两格也能接引。' },
  tide: { name: '蘸月', evolved: '澄环蘸月', element: 'water', home: 'river', quest: 'tide-vow', goal: '保住河卵的回游线，也想知道山巅的月亮是否会沉入水里。', flaw: '习惯替所有人保管眼泪，忘记说自己的难过。', ability: '羁绊二的护持多抵一重裂隙；蜕变后可远距接引。' },
  coal: { name: '炭铃', evolved: '留白炭铃', element: 'ember', home: 'kiln', quest: 'coal-vow', goal: '为灰芽留温，也学会在需要休息的时候熄灭。', flaw: '把被需要等同被喜爱，常常逞强。', ability: '羁绊二接引多添一重共鸣；蜕变后不惧水字阵位。' },
};
export const CHOICE_DATA: Record<ChoiceId, { name: string; location: LocationId; requires: Exclude<LocationId, 'village'>; options: readonly [Option, Option]; labels: [string, string] }> = {
  ledger: { name: '谁来承担旧账', location: 'village', requires: 'wood', options: ['truth', 'shelve'], labels: ['公开旧账，村庄认责', '暂存旧账，先保渡运'] },
  roots: { name: '契约能否拒绝', location: 'ruins', requires: 'ruins', options: ['release', 'retain'], labels: ['拆除锁根，接受季候失序', '保留锁根，承担守桥之责'] },
  winter: { name: '交还一整个冬天', location: 'frost', requires: 'frost', options: ['cede', 'follow'], labels: ['让出暖季，迁村过冬', '随灵迁徙，不再定居'] },
};
export const RECIPES: Record<Charm, { item: Item; amount: number }[]> = {
  'root-charm': [{ item: 'twig', amount: 2 }, { item: 'amber', amount: 1 }],
  'rain-charm': [{ item: 'dew', amount: 2 }, { item: 'amber', amount: 1 }],
  'ash-charm': [{ item: 'twig', amount: 1 }, { item: 'dew', amount: 1 }, { item: 'amber', amount: 1 }],
};
export const CHARM_HELP: Record<Charm, string> = {
  'root-charm': '荆棘地形不再额外耗息。',
  'rain-charm': '湿地地形不再额外耗息。',
  'ash-charm': '每次应答抵消一重裂隙。',
};
export const SIDE_DATA: Record<SideQuest, { title: string; location: LocationId; requires: Exclude<LocationId, 'village'>; spend: { item: Item; amount: number }[]; companion?: CompanionId }> = {
  sleeve: { title: '归还空袖', location: 'village', requires: 'wood', spend: [{ item: 'twig', amount: 1 }] },
  ferry: { title: '不载人的一趟船', location: 'river', requires: 'river', spend: [{ item: 'twig', amount: 1 }] },
  'bud-vow': { title: '不是工具', location: 'wood', requires: 'wood', spend: [{ item: 'dew', amount: 1 }], companion: 'bud' },
  'tide-vow': { title: '最后一枚河卵', location: 'river', requires: 'river', spend: [{ item: 'twig', amount: 1 }], companion: 'tide' },
  'coal-vow': { title: '灰中留白', location: 'kiln', requires: 'kiln', spend: [{ item: 'dew', amount: 1 }], companion: 'coal' },
  witness: { title: '无字证人', location: 'ruins', requires: 'frost', spend: [{ item: 'amber', amount: 1 }] },
};

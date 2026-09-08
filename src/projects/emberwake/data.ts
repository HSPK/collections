export const LOCATIONS = ['kiln', 'span', 'bell', 'market', 'garden', 'reservoir', 'archive', 'observatory', 'heart'] as const;
export type LocationId = typeof LOCATIONS[number];
export const COMPANIONS = ['lan', 'mo', 'qiao'] as const;
export type CompanionId = typeof COMPANIONS[number];
export const PEOPLE = ['you', ...COMPANIONS, 'su', 'yan'] as const;
export type PersonId = typeof PEOPLE[number];
export const STANCES = ['duty', 'memory', 'freedom'] as const;
export type Stance = typeof STANCES[number];
export const STANCE_NAMES: Record<Stance, string> = { duty: '守诺', memory: '留痕', freedom: '解缆' };
export const ITEMS = ['coin', 'tonic', 'ore', 'lens', 'coat', 'chart', 'seal'] as const;
export type ItemId = typeof ITEMS[number];
export const ITEM_NAMES: Record<ItemId, string> = {
  coin: '铜叶', tonic: '温灯药', ore: '鸣铜', lens: '折光镜', coat: '帆织披肩', chart: '逆风测绘', seal: '共议印',
};
export const CURVE = [0, 24, 60, 108, 168, 240] as const;
export const QUEST_IDS = ['departure', 'cable', 'bells', 'debts', 'crossing', 'mirror', 'archive', 'lanarc', 'moarc', 'qiaoarc', 'council', 'furnace'] as const;
export type QuestId = typeof QUEST_IDS[number];
export interface Branch {
  id: 'a' | 'b';
  label: string;
  stance: Stance;
  consequence: string;
  cost?: Partial<Record<ItemId, number>>;
  gain?: Partial<Record<ItemId, number>>;
}
export interface Quest {
  id: QuestId;
  title: string;
  act: 1 | 2 | 3;
  location: LocationId;
  requires: QuestId[];
  person: PersonId;
  optional?: boolean;
  recruit?: CompanionId;
  bond?: CompanionId;
  battle?: 'hooks' | 'wing' | 'clerks' | 'heart';
  xp: number;
  coins: number;
  branches: [Branch, Branch];
}
export const QUESTS: Quest[] = [
  { id: 'departure', title: '第一缕不动的烟', act: 1, location: 'kiln', requires: [], person: 'lan', recruit: 'lan', xp: 8, coins: 10,
    branches: [
      { id: 'a', label: '替岚缇接下送灯的约定', stance: 'duty', consequence: '守诺＋一；岚缇入队，获得温灯药。', gain: { tonic: 1 } },
      { id: 'b', label: '把无人签收的名字抄进地图', stance: 'memory', consequence: '留痕＋一；岚缇入队，获得温灯药。', gain: { tonic: 1 } },
    ] },
  { id: 'cable', title: '桥上不是货物', act: 1, location: 'span', requires: ['departure'], person: 'lan', battle: 'hooks', xp: 18, coins: 12,
    branches: [
      { id: 'a', label: '守住载着病人的主缆', stance: 'duty', consequence: '战胜扣索傀后：守诺＋一，鸣铜一枚。', gain: { ore: 1 } },
      { id: 'b', label: '剪开收费链，让小舟先行', stance: 'freedom', consequence: '战胜扣索傀后：解缆＋一，鸣铜一枚。', gain: { ore: 1 } },
    ] },
  { id: 'bells', title: '没有声音的点名', act: 1, location: 'bell', requires: ['cable'], person: 'mo', recruit: 'mo', xp: 12, coins: 8,
    branches: [
      { id: 'a', label: '保留旧名，再为生者添一页', stance: 'memory', consequence: '留痕＋一；墨鹭带着声匣入队。' },
      { id: 'b', label: '把空白名册交给孩子们', stance: 'freedom', consequence: '解缆＋一；墨鹭带着声匣入队。' },
    ] },
  { id: 'debts', title: '一件披肩的利息', act: 1, location: 'market', requires: ['cable'], person: 'su', optional: true, xp: 10, coins: 0,
    branches: [
      { id: 'a', label: '付八枚铜叶，买断织工的欠契', stance: 'duty', consequence: '支付八铜叶；获得帆织披肩，守诺＋一。', cost: { coin: 8 }, gain: { coat: 1 } },
      { id: 'b', label: '公开利息表，换取测路工具', stance: 'memory', consequence: '获得折光镜；留痕＋一。织工自愿留店，契约作废。', gain: { lens: 1 } },
    ] },
  { id: 'crossing', title: '逆着停风开花', act: 1, location: 'garden', requires: ['bells'], person: 'mo', battle: 'wing', xp: 24, coins: 16,
    branches: [
      { id: 'a', label: '取花粉，留下被烧焦的根', stance: 'memory', consequence: '战胜缄翼后：逆风测绘一份，留痕＋一，进入第二幕。', gain: { chart: 1 } },
      { id: 'b', label: '拆温室，把种子分给沿路人', stance: 'freedom', consequence: '战胜缄翼后：逆风测绘一份，解缆＋一，进入第二幕。', gain: { chart: 1 } },
    ] },
  { id: 'mirror', title: '倒影里的逃课者', act: 2, location: 'reservoir', requires: ['crossing'], person: 'qiao', recruit: 'qiao', xp: 16, coins: 10,
    branches: [
      { id: 'a', label: '记下巧砂失去过的航程', stance: 'memory', consequence: '留痕＋一；巧砂入队，并修复全队状态。' },
      { id: 'b', label: '不索取身世，只问愿不愿同行', stance: 'freedom', consequence: '解缆＋一；巧砂入队，并修复全队状态。' },
    ] },
  { id: 'archive', title: '天空吃掉的不是煤', act: 2, location: 'archive', requires: ['mirror'], person: 'yan', battle: 'clerks', xp: 30, coins: 20,
    branches: [
      { id: 'a', label: '公开原始账，拒绝删去代价', stance: 'memory', consequence: '突破封账双卫后：留痕＋一，获得鸣铜。', gain: { ore: 1 } },
      { id: 'b', label: '暂封姓名，先让所有岛派代表', stance: 'duty', consequence: '突破封账双卫后：守诺＋一，获得鸣铜。', gain: { ore: 1 } },
    ] },
  { id: 'lanarc', title: '岚缇：请假条的背面', act: 2, location: 'kiln', requires: ['crossing'], person: 'lan', optional: true, bond: 'lan', xp: 12, coins: 6,
    branches: [
      { id: 'a', label: '让送灯人也有被接送的一天', stance: 'freedom', consequence: '岚缇羁绊＋一；解缆＋一，护持增加一点。' },
      { id: 'b', label: '把独自守诺改为轮流值夜', stance: 'duty', consequence: '岚缇羁绊＋一；守诺＋一，护持增加一点。' },
    ] },
  { id: 'moarc', title: '墨鹭：容许一格空白', act: 2, location: 'bell', requires: ['archive'], person: 'mo', optional: true, bond: 'mo', xp: 12, coins: 8,
    branches: [
      { id: 'a', label: '用一枚鸣铜修复母亲的声匣', stance: 'memory', consequence: '消耗一鸣铜；墨鹭羁绊＋一，留痕＋一，疗愈增加一点。', cost: { ore: 1 } },
      { id: 'b', label: '用一瓶温灯药救活当年的送信鸟', stance: 'freedom', consequence: '消耗一温灯药；墨鹭羁绊＋一，解缆＋一，疗愈增加一点。', cost: { tonic: 1 } },
    ] },
  { id: 'qiaoarc', title: '巧砂：没有逃生舱的船', act: 2, location: 'market', requires: ['archive'], person: 'qiao', optional: true, bond: 'qiao', xp: 12, coins: 8,
    branches: [
      { id: 'a', label: '花六铜叶，给每个人装一根离船绳', stance: 'freedom', consequence: '消耗六铜叶；巧砂羁绊＋一，解缆＋一，攻击增加一点。', cost: { coin: 6 } },
      { id: 'b', label: '花六铜叶，制作由乘客保管的钥匙', stance: 'duty', consequence: '消耗六铜叶；巧砂羁绊＋一，守诺＋一，攻击增加一点。', cost: { coin: 6 } },
    ] },
  { id: 'council', title: '不是每个人都想有风', act: 3, location: 'observatory', requires: ['archive'], person: 'yan', xp: 20, coins: 16,
    branches: [
      { id: 'a', label: '承认拒绝权，让小岛也握有停机钥匙', stance: 'freedom', consequence: '解缆＋一；获得共议印。第三幕开启，可继续完成同伴支线。', gain: { seal: 1 } },
      { id: 'b', label: '承诺先通救援线，再交还全部钥匙', stance: 'duty', consequence: '守诺＋一；获得共议印。第三幕开启，可继续完成同伴支线。', gain: { seal: 1 } },
    ] },
  { id: 'furnace', title: '最后一张地图的用途', act: 3, location: 'heart', requires: ['council'], person: 'yan', battle: 'heart', xp: 40, coins: 0,
    branches: [
      { id: 'a', label: '挑战守炉者，夺回点火选择', stance: 'duty', consequence: '最终战；胜利后选择谁来承担新天空的重量。' },
      { id: 'b', label: '提出轮值航约，让天空等待同意', stance: 'freedom', consequence: '须完成三条同伴支线且解缆至少三点；无需战斗，达成共担的晨风。' },
    ] },
];
export const questById = (id: QuestId) => QUESTS.find(quest => quest.id === id)!;
export const PLACE_NAMES: Record<LocationId, string> = {
  kiln: '烬灯埠', span: '悬缆峡', bell: '静铃院', market: '百帆集', garden: '逆花圃',
  reservoir: '倒海池', archive: '空名库', observatory: '借星台', heart: '无风炉心',
};
export const ENEMY_IDS = ['hook', 'wing', 'clerk', 'warden', 'heart'] as const;
export type EnemyId = typeof ENEMY_IDS[number];
export const ENEMY_NAMES: Record<EnemyId, string> = {
  hook: '扣索傀', wing: '缄翼', clerk: '封账卫', warden: '回执卫', heart: '守炉者·晏簧',
};
export const BATTLES: Record<NonNullable<Quest['battle']>, { id: EnemyId; hp: number; lane: number; power: number }[]> = {
  hooks: [{ id: 'hook', hp: 22, lane: 1, power: 7 }],
  wing: [{ id: 'wing', hp: 32, lane: 2, power: 9 }],
  clerks: [{ id: 'clerk', hp: 26, lane: 0, power: 9 }, { id: 'warden', hp: 20, lane: 2, power: 8 }],
  heart: [{ id: 'heart', hp: 54, lane: 1, power: 13 }, { id: 'warden', hp: 24, lane: 2, power: 10 }],
};

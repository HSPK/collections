export const PILOT_IDS = ['shen', 'luo', 'ye'] as const;
export type PilotId = typeof PILOT_IDS[number];
export const ITEMS = ['scrap', 'kit', 'coil', 'alloy'] as const;
export type ItemId = typeof ITEMS[number];
export const ITEM_NAMES: Record<ItemId, string> = { scrap: '废料', kit: '修复匣', coil: '记忆线圈', alloy: '陶铠' };
export const LEVELS = [0, 10, 24, 42, 65, 90] as const;
export const SKILLS = ['coolant', 'piercer', 'vigil', 'stride', 'capacitor'] as const;
export type SkillId = typeof SKILLS[number];
export const SKILL_DATA: Record<SkillId, { name: string; description: string }> = {
  coolant: { name: '冷流回路', description: '热容量增加三，每轮多冷却一。持续射击，不再靠侥幸。' },
  piercer: { name: '折线校准', description: '武器伤害增加二；硬掩体仍然挡住弹道，不穿墙。' },
  vigil: { name: '守夜姿态', description: '护盾上限增加四；每轮额外恢复一护盾。' },
  stride: { name: '承台步法', description: '单次移动路径增加一格；仍须遵守实体掩体与攀高限制。' },
  capacitor: { name: '余电回收', description: '能量上限增加二；能为远针和修复预留更多能源。' },
};
export const GEAR_IDS = ['standard', 'lance', 'pulse', 'stock', 'bulwark', 'reactor', 'relay'] as const;
export type GearId = typeof GEAR_IDS[number];
export const GEAR: Record<GearId, {
  name: string; slot: 'weapon' | 'core' | 'perk'; description: string;
  cost: Partial<Record<ItemId, number>>; unlock: string;
}> = {
  standard: { name: '原装主炮', slot: 'weapon', description: '保留各机的原始射程与功率。', cost: {}, unlock: '' },
  lance: { name: '线性投矛器', slot: 'weapon', description: '射程增加二，伤害增加三，射击多产生一热。', cost: { scrap: 4, alloy: 1 }, unlock: '' },
  pulse: { name: '窄束脉冲炮', slot: 'weapon', description: '伤害增加一，射击热量减少一。', cost: { scrap: 3, coil: 1 }, unlock: 'archive' },
  stock: { name: '原装核心', slot: 'core', description: '平衡的电容与盾容。', cost: {}, unlock: '' },
  bulwark: { name: '壁垒盾核', slot: 'core', description: '护盾上限增加六，能量上限减少一。', cost: { scrap: 4, alloy: 1 }, unlock: 'oath' },
  reactor: { name: '潮汐炉芯', slot: 'core', description: '能量上限增加三，热容量增加二。', cost: { scrap: 5, coil: 1 }, unlock: '' },
  relay: { name: '共振中继', slot: 'perk', description: '终端接驳一次计两格，能源消耗不变。', cost: { scrap: 3, coil: 1 }, unlock: 'mercy' },
};
export const MACHINES: Record<PilotId, {
  name: string; designation: string; hull: number; shield: number; energy: number;
  heat: number; range: number; damage: number; move: number; ability: string; color: string;
}> = {
  shen: { name: '砧鹭', designation: '零七式·承重步机', hull: 32, shield: 10, energy: 8, heat: 10, range: 5.5, damage: 8, move: 3, ability: '立壁：回复六护盾并架盾', color: '#f0a05f' },
  luo: { name: '纸隼', designation: '十一式·索道轻机', hull: 24, shield: 6, energy: 10, heat: 10, range: 7.5, damage: 7, move: 4, ability: '远针：延伸两格射程，追加三伤害', color: '#79d9ec' },
  ye: { name: '缄灯', designation: '三式·织讯工程机', hull: 28, shield: 8, energy: 11, heat: 11, range: 6, damage: 6, move: 3, ability: '缝合：三格内修复友机六结构', color: '#aacdac' },
};
export const LOCATION_IDS = ['hangar', 'kiln', 'archive', 'barracks', 'gate', 'salt', 'cistern', 'spine', 'garden', 'crown'] as const;
export type LocationId = typeof LOCATION_IDS[number];
export const LOCATIONS: { id: LocationId; name: string; subtitle: string; unlock: number; x: number; y: number; kind: string }[] = [
  { id: 'hangar', name: '第九机库', subtitle: '缆索、陶壳与尚未寄出的家书', unlock: 0, x: 15, y: 75, kind: '基地' },
  { id: 'kiln', name: '白窑街', subtitle: '以烧结炉余热养活的平民街区', unlock: 0, x: 28, y: 53, kind: '街区' },
  { id: 'archive', name: '无名档案井', subtitle: '被删去的不是姓名，而是签名', unlock: 1, x: 45, y: 72, kind: '档案' },
  { id: 'barracks', name: '断环哨所', subtitle: '军令必须写明终止条件', unlock: 2, x: 20, y: 30, kind: '哨所' },
  { id: 'gate', name: '雨闸外缘', subtitle: '旧防御网络第一次开口', unlock: 0, x: 48, y: 47, kind: '战区' },
  { id: 'salt', name: '盐镜滩', subtitle: '运输船影子下面的救生舱', unlock: 1, x: 64, y: 64, kind: '战区' },
  { id: 'cistern', name: '倒悬蓄水庭', subtitle: '居民的饮水悬在炮线上方', unlock: 2, x: 49, y: 27, kind: '战区' },
  { id: 'spine', name: '脊索升降桥', subtitle: '一节货厢决定一座穹城的冬天', unlock: 3, x: 70, y: 37, kind: '战区' },
  { id: 'garden', name: '轨道墓园', subtitle: '每一盏灯都在等一个不被调用的夜晚', unlock: 4, x: 79, y: 19, kind: '战区' },
  { id: 'crown', name: '铁穹冠冕', subtitle: '在天顶为战争写下句号', unlock: 5, x: 92, y: 49, kind: '终局' },
];
export const MISSION_IDS = ['rain', 'mirror', 'water', 'bridge', 'names', 'crown'] as const;
export type MissionId = typeof MISSION_IDS[number];
export type Objective = 'clear' | 'rescue' | 'hold' | 'escort' | 'relay' | 'final';
export type EnemyKind = 'warden' | 'hunter' | 'sapper';
export const ENEMY_DATA: Record<EnemyKind, { name: string; objective: string; hull: number; damage: number; range: number }> = {
  warden: { name: '守闸者', objective: '保住终端。优先架盾卡住接驳口，再攻击正在靠近的可见机体。', hull: 15, damage: 5, range: 5.5 },
  hunter: { name: '逐迹者', objective: '追踪暴露的低护盾目标。机动占侧翼，优先用高热齐射阻止推进。', hull: 13, damage: 6, range: 6.5 },
  sapper: { name: '凿井者', objective: '优先攻击可见的民用货厢或水泵，否则压制工程机。', hull: 17, damage: 4, range: 7 },
};
export interface Mission {
  id: MissionId; name: string; act: number; location: LocationId; objective: Objective;
  instruction: string; rounds: number; enemies: EnemyKind[]; reward: Partial<Record<ItemId, number>>;
  xp: number; links: number; weather: string;
}
export const MISSIONS: Mission[] = [
  { id: 'rain', name: '雨中点名', act: 1, location: 'gate', objective: 'clear', instruction: '摧毁两台失控守机。不要把墙后目标当成可射击目标。', rounds: 10, enemies: ['warden', 'hunter'], reward: { scrap: 6, kit: 2, alloy: 1 }, xp: 10, links: 0, weather: '冷凝雨' },
  { id: 'mirror', name: '镜下幸存者', act: 1, location: 'salt', objective: 'rescue', instruction: '清除守机，靠近橙色救生终端，接驳两格解锁救生舱。', rounds: 12, enemies: ['hunter', 'warden'], reward: { scrap: 6, kit: 2, coil: 2 }, xp: 12, links: 2, weather: '盐尘' },
  { id: 'water', name: '留给活人的水', act: 2, location: 'cistern', objective: 'hold', instruction: '保护水泵三轮。凿井者会瞄准水泵；结构归零立即失败。', rounds: 10, enemies: ['sapper', 'hunter', 'warden'], reward: { scrap: 7, kit: 3, alloy: 2 }, xp: 14, links: 0, weather: '结霜' },
  { id: 'bridge', name: '横越断弦', act: 2, location: 'spine', objective: 'escort', instruction: '护送货厢至第六列。每轮自动前进一格，邻近敌机会令它停下。', rounds: 12, enemies: ['sapper', 'hunter', 'hunter'], reward: { scrap: 7, kit: 2, coil: 2 }, xp: 16, links: 0, weather: '高空横风' },
  { id: 'names', name: '灯下还名', act: 3, location: 'garden', objective: 'relay', instruction: '清除守机并接驳墓园两格。开出的不是武器库，而是撤回授权的门。', rounds: 12, enemies: ['warden', 'warden', 'hunter'], reward: { scrap: 8, kit: 3, alloy: 2, coil: 1 }, xp: 18, links: 2, weather: '静电雪' },
  { id: 'crown', name: '最后一位指挥员', act: 3, location: 'crown', objective: 'final', instruction: '接驳三格终止围攻；或清除全部守机后接驳一格。终局协议由你签署。', rounds: 12, enemies: ['warden', 'hunter', 'sapper', 'warden'], reward: { scrap: 5, coil: 2 }, xp: 20, links: 3, weather: '极夜' },
];
export const QUESTS = [
  ...MISSIONS.map(m => ({ id: m.id, name: m.name, kind: '主线', description: m.instruction })),
  { id: 'mercy', name: '炉火不是军需', kind: '支线', description: '到白窑街决定最后一枚供暖电池的归属，解锁共振中继。' },
  { id: 'archive', name: '空白签名', kind: '支线', description: '雨闸归来后探访档案井，招募叶缄并取得原始授权记录。' },
  { id: 'oath', name: '会结束的誓言', kind: '支线', description: '第二次出征归来后，与乔砺重写断环哨所的军令。' },
  { id: 'silence', name: '一整夜的寂静', kind: '支线', description: '保住水泵后，决定居民是否应当替逝者保持线路。' },
  { id: 'names-side', name: '碑上没有军衔', kind: '支线', description: '抵达轨道墓园，与林簿一起决定死者怎样被记住。' },
  { id: 'refit', name: '不是一次性的人', kind: '支线', description: '制造一件新装备。机库会发放一次修复匣。' },
  { id: 'growth', name: '下一次少犯一次错', kind: '支线', description: '让任意驾驶员学习一项成长技能，领取一次陶铠。' },
] as const;
export const GOALS = ['protect', 'focus', 'relay'] as const;
export type Goal = typeof GOALS[number];
export const GOAL_NAMES: Record<Goal, string> = { protect: '护住队长与民用设施', focus: '集中火力清除敌机', relay: '抢占终端并维持线路' };
export const ENDING_IDS = ['choir', 'quiet', 'watch'] as const;
export type EndingId = typeof ENDING_IDS[number];

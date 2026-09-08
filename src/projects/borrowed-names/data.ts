export const GAME_ID = 'borrowed-names';
export const SCENE_IDS = ['ferry', 'alley', 'theater', 'registry', 'clinic', 'pump', 'tower', 'court'] as const;
export type SceneId = typeof SCENE_IDS[number];
export const NPC_IDS = ['lan', 'mei', 'he', 'qiao', 'lu', 'yan'] as const;
export type NpcId = typeof NPC_IDS[number];
export const FACT_IDS = ['receipt', 'pattern', 'ledger', 'pulse', 'bell', 'order'] as const;
export type FactId = typeof FACT_IDS[number];
export const CLASS_IDS = ['listener', 'actor', 'watcher'] as const;
export type ClassId = typeof CLASS_IDS[number];
export const METHODS = ['listen', 'perform', 'shadow'] as const;
export type Method = typeof METHODS[number];
export const FACTIONS = ['civic', 'stage', 'tide'] as const;
export type Faction = typeof FACTIONS[number];
export const ITEM_IDS = ['tonic', 'tea', 'lens', 'coat', 'seal', 'stage-pass', 'clerk-pass', 'worker-pass'] as const;
export type ItemId = typeof ITEM_IDS[number];
export const DISGUISES = ['own', 'stage', 'clerk', 'worker'] as const;
export type Disguise = typeof DISGUISES[number];
export const SKILL_IDS = ['echo', 'mercy', 'double', 'poise', 'softstep', 'nerve'] as const;
export type SkillId = typeof SKILL_IDS[number];
export const QUEST_IDS = ['letter', 'costume', 'aid', 'books', 'patient', 'clock', 'wardrobe', 'pact', 'shelter', 'redseal', 'case', 'dawn'] as const;
export type QuestId = typeof QUEST_IDS[number];
export const TOPICS = ['lead', 'pact', 'hearing'] as const;
export type Topic = typeof TOPICS[number];
export const ACTIONS = ['testify', 'withhold', 'bargain', 'ally', 'patrol'] as const;
export type AgentAction = typeof ACTIONS[number];
export const ENDINGS = ['commons', 'charter', 'bridge'] as const;
export type Ending = typeof ENDINGS[number];
export const CURVE = [0, 16, 40, 72, 110, 150];
export const FACTION_NAMES: Record<Faction, string> = { civic: '量名署', stage: '百面行', tide: '渡汐互助会' };
export const METHOD_NAMES: Record<Method, string> = { listen: '听辨', perform: '周旋', shadow: '潜行' };
export const DISGUISE_NAMES: Record<Disguise, string> = { own: '本名便衣', stage: '百面戏衣', clerk: '署员灰褂', worker: '泵工油衣' };
export const TOPIC_NAMES: Record<Topic, string> = { lead: '追问案情', pact: '请求担保', hearing: '进行终审交涉' };

export const CLASSES: Record<ClassId, { name: string; subtitle: string; stats: Record<Method, number>; gear: ItemId; description: string }> = {
  listener: { name: '听雨人', subtitle: '雨替沉默的人作证', stats: { listen: 4, perform: 2, shadow: 1 }, gear: 'lens', description: '从雨滴间隔辨认纸张与谎言。听辨最强，开局持雨纹镜；适合复原证据、保护证人，以轻声交涉换取信任。' },
  actor: { name: '戏面师', subtitle: '一件衣服也能成为法律', stats: { listen: 1, perform: 4, shadow: 2 }, gear: 'seal', description: '熟悉服饰所附带的临时权利。周旋最强，开局持套印戒；议价更稳，擅长穿署员灰褂从正门走入敌营。' },
  watcher: { name: '巡夜客', subtitle: '街道关闭以前，记住出口', stats: { listen: 2, perform: 1, shadow: 4 }, gear: 'coat', description: '用身体记住屋顶、检修梯与水位。潜行最强，开局持消声雨披；能绕过正门身份审查，但警戒仍会累积。' },
};

export const SKILLS: Record<SkillId, { name: string; method: Method; detail: string }> = {
  echo: { name: '回声辨纸', method: 'listen', detail: '听辨＋２。区分原件、复写件与受潮伪纸。' },
  mercy: { name: '留白问法', method: 'listen', detail: '听辨＋２。每次合法交涉后额外减轻１压力。' },
  double: { name: '双面措辞', method: 'perform', detail: '周旋＋２。成功交涉的议价折扣由１增至２。' },
  poise: { name: '不露怯', method: 'perform', detail: '周旋＋２。交涉检定失手不再额外增加压力。' },
  softstep: { name: '屋脊软步', method: 'shadow', detail: '潜行＋２。成功潜入额外降低１警戒。' },
  nerve: { name: '雨中定息', method: 'shadow', detail: '潜行＋２。休整额外恢复３精力。' },
};

export const ITEMS: Record<ItemId, { name: string; price: number; type: 'consumable' | 'gear' | 'disguise'; detail: string; method?: Method }> = {
  tonic: { name: '温盐药', price: 3, type: 'consumable', detail: '精力＋６、压力－２；会消耗一份。' },
  tea: { name: '压惊茶', price: 2, type: 'consumable', detail: '压力－３、警戒－１；会消耗一份。' },
  lens: { name: '雨纹镜', price: 6, type: 'gear', method: 'listen', detail: '装备后听辨＋２，与其他工具共用一个装备位。' },
  coat: { name: '消声雨披', price: 6, type: 'gear', method: 'shadow', detail: '装备后潜行＋２，湿屋顶不再响得像铁鼓。' },
  seal: { name: '套印戒', price: 6, type: 'gear', method: 'perform', detail: '装备后周旋＋２，指环只改称谓，不会伪造证据。' },
  'stage-pass': { name: '百面戏衣', price: 4, type: 'disguise', detail: '合法扮演临时演员；向百面行交涉时额外＋１。' },
  'clerk-pass': { name: '署员灰褂', price: 4, type: 'disguise', detail: '允许从正门进入量名署与雨钟塔，不能改变本名债务。' },
  'worker-pass': { name: '泵工油衣', price: 4, type: 'disguise', detail: '允许从诊所走工道进入潮泵房。' },
};

export const SCENES: Record<SceneId, { name: string; sign: string; sub: string; color: string; object: string; npc?: NpcId; fact?: FactId; x: number; y: number }> = {
  ferry: { name: '无字渡口', sign: '末班渡', sub: '退潮也带不走这封信', color: '#5fc5be', object: '湿封套', npc: 'lan', fact: 'receipt', x: 140, y: 415 },
  alley: { name: '折伞巷', sign: '借名修补', sub: '一条只收现金的窄路', color: '#ef7055', object: '抵押名匣', x: 350, y: 390 },
  theater: { name: '百面戏楼', sign: '今夜不散', sub: '幕布后另有一种户籍', color: '#e96554', object: '反缝戏袖', npc: 'mei', fact: 'pattern', x: 270, y: 215 },
  registry: { name: '量名署', sign: '一名一押', sub: '抽屉比整条街都长', color: '#b6cfc6', object: '双层账页', npc: 'he', fact: 'ledger', x: 565, y: 220 },
  clinic: { name: '留灯诊所', sign: '先医后问', sub: '灯仍为没有名字的人亮着', color: '#e4b888', object: '脉波纸卷', npc: 'qiao', fact: 'pulse', x: 530, y: 435 },
  pump: { name: '潮泵房', sign: '勿忘开闸', sub: '城市在铜管里呼吸', color: '#7bbac5', object: '机械潮钟', npc: 'lu', fact: 'bell', x: 750, y: 400 },
  tower: { name: '雨钟塔', sign: '销名停行', sub: '封路命令从高处落下', color: '#ed695d', object: '红印原令', npc: 'yan', fact: 'order', x: 765, y: 185 },
  court: { name: '借名公庭', sign: '请亲自署名', sub: '天亮以后，谁替谁活着', color: '#b4dbce', object: '共名契台', npc: 'yan', x: 560, y: 65 },
};

export const NPCS: Record<NpcId, {
  name: string; job: string; faction: Faction; fact: FactId; scene: SceneId;
  desire: string; flaw: string; allegiance: string; gate: string; portrait: number;
}> = {
  lan: { name: '阮灯', job: '夜渡递信人', faction: 'tide', fact: 'receipt', scene: 'ferry', desire: '让那封未签收的信真正到家。', flaw: '把一切迟到都认作自己的过错，容易为了赶路隐瞒危险。', allegiance: '互助会的船只给她工作，诊所替她保管本名。', gate: '信任达到１或互助会声望达到１后可请求担保；抵押本名不会被她鄙视。', portrait: 0 },
  mei: { name: '裴绡', job: '戏衣裁缝', faction: 'stage', fact: 'pattern', scene: 'theater', desire: '证明借来的身份也能作出真实的承诺。', flaw: '习惯替别人决定该扮演谁，常把保护变成操纵。', allegiance: '守护百面行，同时欠量名署三十件公服。', gate: '信任或百面行声望达到１可谈担保；公开病人名单后拒绝结盟。', portrait: 1 },
  he: { name: '贺迟', job: '量名署复核员', faction: 'civic', fact: 'ledger', scene: 'registry', desire: '留下能在自己死后仍然成立的合法证据。', flaw: '把程序视为道德的替代物，怕任何没有盖章的善意。', allegiance: '效忠量名署的旧章程，而不是如今掌印的人。', gate: '信任或量名署声望达到１可请求担保；先保存原账，他才讨论终审。', portrait: 2 },
  qiao: { name: '乔砚', job: '留灯医师', faction: 'tide', fact: 'pulse', scene: 'clinic', desire: '让“患者”成为一种不需要担保的身份。', flaw: '拒绝公开病历，即使沉默可能让整条街继续被封。', allegiance: '接受互助会药材，与百面行共藏失名者。', gate: '信任或互助会声望达到１，且未公开病人名单；送药能赢得她的尊重。', portrait: 3 },
  lu: { name: '陆芦', job: '潮闸扳手长', faction: 'tide', fact: 'bell', scene: 'pump', desire: '让工人拥有自己维修过的道路。', flaw: '认定写字的人总在骗人，容易误把妥协当背叛。', allegiance: '互助会最强硬的一支，借百面行的身份运药。', gate: '信任或互助会声望达到１；保护病人可稳住合作，公开名单后拒绝担保。', portrait: 4 },
  yan: { name: '晏珩', job: '巡街督印官', faction: 'civic', fact: 'order', scene: 'tower', desire: '在城市崩坏之前，找出一条不必伤人的执法办法。', flaw: '过度相信威慑，越不安越倾向于加派巡逻。', allegiance: '量名署授予她权力，阮灯曾在水灾中救过她。', gate: '信任或量名署声望达到１并取得原令后可请求担保；第三幕在公庭主持交涉。', portrait: 5 },
};

export const FACTS: Record<FactId, { name: string; dc: number; method: Method; description: string }> = {
  receipt: { name: '未退回的抵押收据', dc: 6, method: 'listen', description: '收据内层仍有真实水印。它只能证明抵押尚未结清，不能证明署名者自愿。' },
  pattern: { name: '反缝的代签袖纹', dc: 7, method: 'perform', description: '袖纹在内衬上反向盖出执笔人的手势，能把临时戏名与具体签约动作连起来。' },
  ledger: { name: '被改写的街产账', dc: 8, method: 'listen', description: '旧页记名字担保，新页记道路产权。两者金额相同，债务的对象却被替换了。' },
  pulse: { name: '两名同脉的病历', dc: 7, method: 'listen', description: '两张不同名字的纸拥有连续的脉波压痕。消失的是法律身份，不是人的身体。' },
  bell: { name: '未停摆的潮钟簿', dc: 8, method: 'shadow', description: '纯机械记录不受销名术影响。封街发生在涨潮以前，不能用救灾来解释。' },
  order: { name: '带原印的封街令', dc: 8, method: 'perform', description: '原令把封街条件直接关联到借名债券的价格；印模必须与账页上的微痕相符。' },
};

export const QUESTS: Record<QuestId, { name: string; act: number; kind: string; xp: number; silver: number; objective: string }> = {
  letter: { name: '不准投递的信', act: 1, kind: '主线', xp: 8, silver: 6, objective: '在无字渡口与阮灯交涉，依线索勘验湿封套。' },
  costume: { name: '后台有旧名字', act: 1, kind: '主线', xp: 10, silver: 6, objective: '在百面戏楼取得袖纹证据，领取戏衣并进入第二幕。' },
  aid: { name: '先缝伤口后问姓名', act: 1, kind: '支线', xp: 8, silver: 4, objective: '在留灯诊所捐出一份温盐药。' },
  books: { name: '柜里两本账', act: 2, kind: '主线', xp: 16, silver: 8, objective: '以署员身份或潜入路线进入量名署，取出原始街产账。' },
  patient: { name: '同一颗心跳', act: 2, kind: '主线', xp: 12, silver: 6, objective: '依乔砚的线索核验两份病历，不把口供当作证据。' },
  clock: { name: '钟声比批文早', act: 2, kind: '主线', xp: 12, silver: 6, objective: '进入潮泵房，以机械潮钟复核封街时序。' },
  wardrobe: { name: '穿谁的衣服', act: 2, kind: '支线', xp: 8, silver: 3, objective: '购入并穿上署员灰褂或泵工油衣。' },
  pact: { name: '以彼此担保', act: 2, kind: '支线', xp: 12, silver: 4, objective: '在查得该角色证据后，主动请求一次真实角色担保。' },
  shelter: { name: '留一扇门', act: 2, kind: '主线', xp: 12, silver: 4, objective: '在诊所选择保护病人化名，或公开名单换取署方支持。不可反悔。' },
  redseal: { name: '红印背面的手', act: 2, kind: '主线', xp: 18, silver: 8, objective: '抵达雨钟塔，取得督印官的线索并勘验封街原令。' },
  case: { name: '把街道还给地图', act: 2, kind: '主线', xp: 20, silver: 4, objective: '在雨钟塔用六件独立实物提交正确案由、原印与时序，开启第三幕。' },
  dawn: { name: '黎明如何署名', act: 3, kind: '主线', xp: 20, silver: 0, objective: '在借名公庭请求终审交涉，凭自己的关系、选择和代价签署结局。' },
};

export const ROUTES: readonly { a: SceneId; b: SceneId; name: string; gate: 'open' | 'clerk' | 'worker' | 'roof' | 'tower' | 'court'; dc: number }[] = [
  { a: 'ferry', b: 'alley', name: '湿木栈道', gate: 'open', dc: 5 },
  { a: 'alley', b: 'theater', name: '红灯檐廊', gate: 'open', dc: 5 },
  { a: 'alley', b: 'clinic', name: '药车窄道', gate: 'open', dc: 5 },
  { a: 'alley', b: 'registry', name: '署前石阶', gate: 'clerk', dc: 8 },
  { a: 'theater', b: 'registry', name: '戏楼连脊', gate: 'roof', dc: 7 },
  { a: 'clinic', b: 'pump', name: '低水位工道', gate: 'worker', dc: 7 },
  { a: 'registry', b: 'tower', name: '押印长桥', gate: 'tower', dc: 9 },
  { a: 'pump', b: 'tower', name: '溢流检修梯', gate: 'tower', dc: 8 },
  { a: 'tower', b: 'court', name: '开庭踏道', gate: 'court', dc: 6 },
  { a: 'court', b: 'alley', name: '回城螺阶', gate: 'court', dc: 6 },
];

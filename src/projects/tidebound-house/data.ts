export const GUEST_IDS = ['shen', 'lin', 'he', 'yu', 'tang'] as const;
export type GuestId = typeof GUEST_IDS[number];
export const SCENE_IDS = ['hall', 'workshop', 'archive', 'loft', 'shore', 'harbor', 'cliff', 'ruins', 'garden', 'lighthouse'] as const;
export type SceneId = typeof SCENE_IDS[number];
export const ITEM_IDS = ['wood', 'glass', 'thread', 'salt', 'shell', 'lens', 'brace', 'knot', 'tea', 'compass', 'needle', 'ribbon', 'bell'] as const;
export type ItemId = typeof ITEM_IDS[number];
export const SKILL_IDS = ['empathy', 'lore', 'craft'] as const;
export type SkillId = typeof SKILL_IDS[number];
export const BUILD_IDS = ['reader', 'maker', 'listener'] as const;
export type BuildId = typeof BUILD_IDS[number];
export const QUEST_IDS = ['hearth', 'chart', 'beacon', 'heart', 'council', 'marks', 'letters', ...GUEST_IDS] as const;
export type QuestId = typeof QUEST_IDS[number];
export const CLUE_IDS = ['shore', 'ledger', 'stone', 'echo'] as const;
export type ClueId = typeof CLUE_IDS[number];
export const ENDING_IDS = ['shore', 'voyage', 'bridge'] as const;
export type EndingId = typeof ENDING_IDS[number];
export const CURVE = [0, 10, 24, 44, 68] as const;
export const LIMITS = { capacity: 80, stackLimit: 24 };
export const ITEMS: Record<ItemId, { name: string; description: string; skill?: SkillId }> = {
  wood: { name: '潮木', description: '只拾取搁浅的木料；海岸的储量不会刷新。' },
  glass: { name: '海玻璃', description: '磨圆的旧灯片，可以重新聚光。' },
  thread: { name: '帆线', description: '能缝住木头间隙的柔韧蓝线。' },
  salt: { name: '月盐', description: '退潮留下的银白结晶，给仪式定时。' },
  shell: { name: '贝钱', description: '港口认可的小额交换物，也支付远程递信。' },
  lens: { name: '返照透镜', description: '灯塔需要一枚；双岸结局还需要一枚。' },
  brace: { name: '榫骨', description: '托起屋心的木质骨架。' },
  knot: { name: '归潮结', description: '屋心与最后仪式各需一个。' },
  tea: { name: '盐花茶', description: '每位旅客只接受一次，羁绊增加一。' },
  compass: { name: '无北针', skill: 'lore', description: '装备后识潮加一；从不指向人的故乡。' },
  needle: { name: '船形针', skill: 'craft', description: '装备后匠艺加一；补缝比切割更擅长。' },
  ribbon: { name: '听风缎', skill: 'empathy', description: '装备后共情加一；旧故事不会被新声音盖住。' },
  bell: { name: '空心铃', skill: 'empathy', description: '装备后共情加一；每次摇响都留有停顿。' },
};
export const SKILLS: Record<SkillId, string> = { empathy: '共情', lore: '识潮', craft: '匠艺' };
export const BUILDS: Record<BuildId, { name: string; skill: SkillId; item: ItemId; description: string }> = {
  reader: { name: '识潮客', skill: 'lore', item: 'compass', description: '识潮二级，随身无北针。辨读遗迹只需一行动；最先看懂潮汐的来信。' },
  maker: { name: '匠心客', skill: 'craft', item: 'needle', description: '匠艺二级，随身船形针。制作榫骨少用一份潮木；能把节省的木料留给别人。' },
  listener: { name: '听故事的人', skill: 'empathy', item: 'ribbon', description: '共情二级，随身听风缎。远程递信免贝钱，但仍多花一行动；承诺不必靠同处一室。' },
};
export const SCENES: Record<SceneId, { name: string; x: number; y: number; description: string; resource?: ItemId; stock?: number; clue?: ClueId }> = {
  hall: { name: '潮灯厅', x: 420, y: 505, description: '五把不一样高的椅子围住长桌。门槛画着七道潮线，第一道还没有干。修好炉座，海屋才承认你是这一回的主人。' },
  workshop: { name: '补帆工房', x: 668, y: 505, description: '半面墙是旧船的舷板。所有做过的东西都有小小编号，工房不肯用同一块木料写两次功劳。榫骨、透镜、归潮结在这里制作。' },
  archive: { name: '雨信阁', x: 420, y: 347, clue: 'ledger', description: '雨点沿玻璃滑成字行。借宿簿的最后一页写着：归还的是被借走的潮，不是借宿的人。有人用细线把这句话缝住了。' },
  loft: { name: '屋心阁', x: 548, y: 208, description: '屋梁围着一枚悬空的木环，像一个还没答完的问题。灯塔亮起后，才能看见榫槽和结绳的位置。最后的选择也在这里落定。' },
  shore: { name: '拾光滩', x: 208, y: 626, resource: 'wood', stock: 16, clue: 'shore', description: '漂流木停在同一条弯曲的银线上。七次潮水不是倒计时的七次敲门，而是七次重新选择门朝向何方的机会。' },
  harbor: { name: '贝壳港', x: 960, y: 575, resource: 'glass', stock: 12, description: '没有船在这里排队等客。小船只把愿意离开的人送去自己选的岸。港边有海玻璃，也能用贝钱换有限的帆线与月盐。' },
  cliff: { name: '回声岬', x: 1050, y: 386, resource: 'salt', stock: 14, clue: 'echo', description: '风经过崖孔时，先吹出一句话的结尾，再慢慢找回开头。陶芽在这里听见过海屋的声音：不要替我决定永远。' },
  ruins: { name: '旧约石庭', x: 132, y: 341, resource: 'thread', stock: 12, clue: 'stone', description: '倒下的门柱不指向坟墓，只圈出一张从未搬走的茶桌。石刻有两个空格：留下什么，带走什么。旧约从来允许不同答案。' },
  garden: { name: '悬雨花台', x: 122, y: 510, resource: 'shell', stock: 12, description: '花盆里种着不会扎穿地板的雨草。陶芽把种子装成小袋，既可移到陆地，也可随屋航行。成熟的贝荚可以换东西。' },
  lighthouse: { name: '折光灯塔', x: 1030, y: 196, description: '塔顶的光不指挥船只，它让人看见两条同样真实的路。沈砚当年熄掉的是一盏命令人回家的灯；这一次，他想修一盏允许人离开的灯。' },
};
export const GUESTS: Record<GuestId, { name: string; role: string; goal: string; flaw: string; color: string; hair: string; design: string; partner: GuestId; haunt: SceneId; supply: ItemId; clue: ClueId; need: ItemId; amount: number; gate: GuestId; reward: ItemId }> = {
  shen: { name: '沈砚', role: '失职的守灯人', goal: '让灯照出选择，而非命令人回家。', flaw: '把沉默当作替别人挡雨。', color: '#597d94', hair: '#d7d6c2', design: '银短发、缺角圆眼镜、宽肩靛蓝长外套，胸前一枚未上色的灯徽。', partner: 'lin', haunt: 'lighthouse', supply: 'glass', clue: 'ledger', need: 'glass', amount: 1, gate: 'lin', reward: 'compass' },
  lin: { name: '林汐', role: '画错故乡的制图师', goal: '画出允许自己不返回的地图。', flaw: '总把不确定的海岸描成直线。', color: '#d57c62', hair: '#342e34', design: '黑色斜辫、珊瑚红短斗篷、长靴，背着比肩膀更宽的卷图筒。', partner: 'shen', haunt: 'shore', supply: 'salt', clue: 'shore', need: 'thread', amount: 1, gate: 'shen', reward: 'glass' },
  he: { name: '何缝舟', role: '欠一艘船的补帆匠', goal: '承认朋友的船不是自己的债。', flaw: '只会用额外劳动说对不起。', color: '#ccaa63', hair: '#49392f', design: '卷发与铜发扣、赭黄围裙、圆实身形，袖口缝着一排小帆。', partner: 'yu', haunt: 'workshop', supply: 'thread', clue: 'ledger', need: 'thread', amount: 2, gate: 'yu', reward: 'needle' },
  yu: { name: '余笺', role: '不再代写结局的信使', goal: '把未寄的信交还给写信的人。', flaw: '害怕坦白会让所有人离散。', color: '#879b76', hair: '#383c45', design: '低发髻、苔绿高领衣、细长身形，斜挎方形信袋，鼻梁一点浅色雀斑。', partner: 'he', haunt: 'archive', supply: 'shell', clue: 'stone', need: 'shell', amount: 2, gate: 'he', reward: 'ribbon' },
  tang: { name: '陶芽', role: '听见屋心的育种人', goal: '让海屋也能被当作一个会改变主意的朋友。', flaw: '常把照料误认为不让任何事改变。', color: '#bc8da6', hair: '#614c45', design: '蓬松栗色短发、梅子色裙裤、宽檐草帽，衣袋伸出三片雨草叶。', partner: 'yu', haunt: 'garden', supply: 'wood', clue: 'echo', need: 'wood', amount: 2, gate: 'yu', reward: 'bell' },
};
export const RECIPES = {
  lens: { name: '磨制返照透镜', gain: 'lens', spend: [{ item: 'glass', amount: 2 }, { item: 'salt', amount: 1 }], cap: 2 },
  brace: { name: '接合榫骨', gain: 'brace', spend: [{ item: 'wood', amount: 3 }, { item: 'thread', amount: 1 }], cap: 1 },
  knot: { name: '编织归潮结', gain: 'knot', spend: [{ item: 'thread', amount: 2 }, { item: 'salt', amount: 1 }], cap: 2 },
  tea: { name: '烘制盐花茶', gain: 'tea', spend: [{ item: 'salt', amount: 1 }, { item: 'shell', amount: 1 }], cap: 5 },
} satisfies Record<string, { name: string; gain: ItemId; spend: { item: ItemId; amount: number }[]; cap: number }>;
export type RecipeId = keyof typeof RECIPES;
export const RECIPE_IDS = ['lens', 'brace', 'knot', 'tea'] as const;
export const QUESTS: Record<QuestId, { name: string; hint: string }> = {
  hearth: { name: '一、把门向岸打开', hint: '潮灯厅修炉座：潮木二。开启工房、雨信阁和悬雨花台。' },
  chart: { name: '二、潮水没有收据', hint: '辨读拾光滩与雨信阁，至少召集一次旅客，再到雨信阁合读潮图。开启岬角、石庭、灯塔与屋心阁。' },
  beacon: { name: '三、一盏不催归的灯', hint: '听过沈砚的故事，带返照透镜一、潮木一到灯塔修灯。' },
  heart: { name: '四、会犹豫的房子', hint: '灯塔已亮、借宿簿已读，带榫骨一、归潮结一到屋心阁。' },
  council: { name: '五、留一个空座', hint: '第五潮起在潮灯厅议约：修好屋心、完成三位旅客的约定、至少三次真实旅客议程。' },
  marks: { name: '支线、给下一次涨潮', hint: '辨读回声岬，带月盐一在那里刻潮标。仪式的留岸力量加一。' },
  letters: { name: '支线、五个不同的称呼', hint: '听过五位旅客的开篇后，在潮灯厅收拢称呼。贝钱二、人心加一。' },
  shen: { name: '沈砚、把灯交给黎明', hint: '羁绊二可立约；听过林汐、辨读借宿簿，交海玻璃一兑现。' },
  lin: { name: '林汐、地图边上的空白', hint: '羁绊二可立约；听过沈砚、辨读拾光滩，交帆线一兑现。' },
  he: { name: '何缝舟、不是债的针脚', hint: '羁绊二可立约；听过余笺、辨读借宿簿，交帆线二兑现。' },
  yu: { name: '余笺、信不替人回答', hint: '羁绊二可立约；听过何缝舟、辨读旧约石庭，交贝钱二兑现。' },
  tang: { name: '陶芽、允许根系搬家', hint: '羁绊二可立约；听过余笺、辨读回声岬、修好灯塔，交潮木二兑现。' },
};
export const ENDINGS: Record<EndingId, { name: string; hint: string }> = {
  shore: { name: '岸上第八扇窗', hint: '第七潮，议约完成；支持三、留岸力量三；月盐二、归潮结一、潮木二。' },
  voyage: { name: '把故乡带向远方', hint: '第七潮，议约完成；支持三、远航力量三；月盐二、归潮结一、海玻璃二。' },
  bridge: { name: '两岸之间的一盏灯', hint: '第七潮，议约完成；五人支持、留岸二、远航二、旅客连结二、潮标；月盐二、归潮结一、返照透镜一。' },
};

export const WIDTH = 1100;
export const HEIGHT = 680;
export const PACTS = ['harbor', 'garden', 'night'] as const;
export type Pact = typeof PACTS[number];
export const FORMATIONS = ['fan', 'bridge', 'orbit'] as const;
export type Formation = typeof FORMATIONS[number];
export const PACT_NAMES: Record<Pact, string> = { harbor: '共用港口', garden: '月面花园', night: '安静夜空' };
export const FORMATION_NAMES: Record<Formation, string> = { fan: '扇形礼阵', bridge: '铜桥礼阵', orbit: '双星礼阵' };
export interface Plan { formation: Formation; defend: Pact; intent: string }
export interface Point { x: number; y: number }
export interface Circle extends Point { id: string; r: number }
export interface Segment { id: string; a: Point; b: Point }
export interface Target extends Circle { id: Pact }
export interface Board {
  round: number; bumpers: Circle[]; rails: Segment[]; targets: Target[]; shield: Segment; defend: Pact;
}
export interface Shot { angle: number; power: number; special: boolean }
export const LAUNCH = { x: 670, y: 568 };
export const ROUNDS = [
  { name: '第一章 · 茶杯轨道', host: '波波领事', role: '先碰杯，再谈月亮。', shape: 'cup', target: [[440, 215], [665, 160], [895, 230]], bump: [[540, 350], [795, 375]], rail: [[370, 475, 465, 520]] },
  { name: '第二章 · 折纸海关', host: '折角审议员', role: '所有直线，都可以商量。', shape: 'kite', target: [[440, 290], [670, 135], [905, 290]], bump: [[565, 285], [785, 285]], rail: [[385, 410, 520, 455], [825, 455, 965, 410]] },
  { name: '第三章 · 双子邮局', host: '咕噜双胞胎', role: '一封信，寄往两个明天。', shape: 'twins', target: [[430, 175], [650, 265], [895, 170]], bump: [[480, 370], [850, 385]], rail: [[575, 140, 575, 205], [760, 140, 760, 205]] },
  { name: '第四章 · 环形宴会', host: '圆伯爵', role: '绕点远路，才算礼貌。', shape: 'ring', target: [[420, 250], [675, 150], [920, 250]], bump: [[665, 340], [830, 455]], rail: [[355, 345, 405, 390], [925, 390, 975, 345]] },
  { name: '终章 · 月亮的主人', host: '大使长 · 铜冠', role: '三份契约，月亮归每个人。', shape: 'crown', target: [[435, 165], [670, 260], [905, 165]], bump: [[535, 350], [810, 350]], rail: [[415, 440, 535, 470], [805, 470, 925, 440], [610, 105, 730, 105]] },
] as const;

export function makeBoard(round: number, plan: Plan, seed: number): Board {
  const design = ROUNDS[round];
  const shift = ((seed % 3) - 1) * 12;
  const targets = design.target.map(([x, y], index) => ({ id: PACTS[index], x: x + shift, y, r: 27 }));
  const offset = plan.formation === 'fan' ? -32 : plan.formation === 'bridge' ? 30 : 0;
  const bumpers: Circle[] = design.bump.map(([x, y], index) => ({
    id: `bumper-${index}`, x: x + (index ? -offset : offset), y: y + (plan.formation === 'orbit' ? 42 : 0),
    r: plan.formation === 'bridge' ? 30 : 25,
  }));
  if (plan.formation === 'orbit') bumpers.push({ id: 'bumper-2', x: 665 + shift, y: 425, r: 22 });
  const rails: Segment[] = [
    { id: 'left', a: { x: 335, y: 75 }, b: { x: 335, y: 615 } },
    { id: 'right', a: { x: 1005, y: 75 }, b: { x: 1005, y: 615 } },
    { id: 'roof', a: { x: 335, y: 75 }, b: { x: 1005, y: 75 } },
    ...design.rail.map(([ax, ay, bx, by], i) => ({ id: `rail-${i}`, a: { x: ax, y: ay }, b: { x: bx, y: by } })),
  ];
  const defended = targets.find(target => target.id === plan.defend)!;
  return {
    round, bumpers, rails, targets, defend: plan.defend,
    shield: { id: 'shield', a: { x: defended.x - 40, y: defended.y + 51 }, b: { x: defended.x + 40, y: defended.y + 51 } },
  };
}

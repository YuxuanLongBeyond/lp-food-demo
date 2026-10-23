// verify.test.mjs — 锚定全部已审计数字（战略文档 §一仪表盘 / §十一重验表 / G1·G2 算例正本）
// 断言原则：文档精确可表达的数（如 0.3596、1.7720、0.2832）用精确分数相等；
// 含无理结构的数（Lys·HCl 游离碱 14619/18265、USDA 逐格小数参与的 v02 档）用 4 位小数舍入对账。
// v0.1 的 12 项经典锚点全部保留（classic 盘＋v01_typical 档）；v0.2 新增锚点全部由引擎生成，
// 并经复解探针/中心差分交叉验证后才冻结（README 与 docs/caliber 对账表第 3 条：FAO 模式三格差异）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { F } from '../src/fraction.js';
import { solveLP } from '../src/lp.js';
import { solveG1, g1Ladder, solveG2, g2AllScenarios, evalG2Recipe, g1SodiumSegments, g2QualityFrontier } from '../src/models.js';

const here = dirname(fileURLToPath(import.meta.url));
const g1 = JSON.parse(readFileSync(join(here, '../data/g1-seasoning.json'), 'utf8'));
const g2 = JSON.parse(readFileSync(join(here, '../data/g2-protein.json'), 'utf8'));

// ———————————— F 精确分数 ————————————
test('F: 十进制与分数串精确解析', () => {
  assert.equal(F.from('18.2').toString(), '91/5');
  assert.equal(F.from('0.75').toString(), '3/4');
  assert.equal(F.from('14619/18265').toDecimal(6), 0.800383);
  assert.equal(F.from('-0.1').add(F.from('0.3')).toDecimal(1), 0.2); // 浮点会得 0.19999999
  assert.throws(() => F.from('1e3'));
});

// ———————————— LP 内核：对偶符号约定 ————————————
test('LP: 对偶符号约定（ge 放宽省成本 / le 收紧增成本）', () => {
  const ge = solveLP({ varNames: ['x'], objective: ['1'], constraints: [{ name: 'floor', sense: 'ge', coeffs: ['1'], rhs: '1' }] });
  assert.equal(ge.status, 'optimal');
  assert.equal(ge.obj.toString(), '1');
  assert.equal(ge.duals[0].toString(), '1'); // rhs+1 → cost+1

  const le = solveLP({ varNames: ['x'], objective: ['-1'], constraints: [{ name: 'cap', sense: 'le', coeffs: ['1'], rhs: '5' }] });
  assert.equal(le.obj.toString(), '-5');
  assert.equal(le.duals[0].toString(), '-1'); // rhs+1 → cost−1

  const inf = solveLP({ varNames: ['x'], objective: ['1'], constraints: [{ name: 'a', sense: 'ge', coeffs: ['1'], rhs: '2' }, { name: 'b', sense: 'le', coeffs: ['1'], rhs: '1' }] });
  assert.equal(inf.status, 'infeasible');
});

// ———————————— G1 五档钠阶梯（LP 调研 §3.2 tableau） ————————————
test('G1: 五档成本 0.3020/0.3189/0.3352/0.3489/0.3596（4 位小数对账）', () => {
  const ladder = g1Ladder(g1);
  const expected = ['0.3020', '0.3189', '0.3352', '0.3489', '0.3596'];
  ladder.forEach((step, i) => {
    assert.equal(step.status, 'optimal', `cap ${step.cap}`);
    assert.equal(step.cost.toDecimal(4), Number(expected[i]), `cap=${step.cap.toString()}`);
  });
  // 2608 档可精确表达：NaCl 6g、KCl 8g、MSG 2g、载体 84g → 成本恰为 0.3596
  const t = ladder[4];
  assert.equal(t.recipe.nacl.toString(), '6');
  assert.equal(t.recipe.kcl.toString(), '8');
  assert.equal(t.recipe.msg.toString(), '2');
  assert.equal(t.recipe.carrier.toString(), '84');
  assert.equal(t.cost.toString(), F.from('0.3596').toString());
});

test('G1: 天花板与可行性边界', () => {
  // 2608 = 393×6 + 125×2（NaCl 6g + MSG 2g 的钠合计，KCl/载体/0 钠）
  assert.equal(393 * 6 + 125 * 2, 2608);
  // 2608 以下不可行（KCl 顶格后无自由度）
  const below = solveG1(g1, { ncap: '2600' });
  assert.equal(below.status, 'infeasible');
  // 纯盐基线：12g NaCl + 88g 载体 = 4716mg 钠、成本恰 0.2832
  assert.equal(solveG1(g1, {}).pureSaltBaseline.sodium.toString(), '4716');
  assert.equal(solveG1(g1, {}).pureSaltBaseline.cost.toString(), F.from('0.2832').toString());
});

test('G1: 双基准 576/764（4 位对账）与 4.6/6.1 厘/8g 包', () => {
  const r = solveG1(g1, { ncap: '2608' });
  assert.equal(r.deltaVsLp.toDecimal(0), 576);   // 精确 575.72 → 文档口径 ¥576/吨
  assert.equal(r.deltaVsPure.toDecimal(0), 764); // 精确 764.0 → ¥764/吨
  assert.equal(r.deltaVsLpPerPacketLi.toDecimal(1), 4.6);  // 4.61 厘/包
  assert.equal(r.deltaVsPurePerPacketLi.toDecimal(1), 6.1); // 6.11 厘/包
});

test('G1: 影子价格恒为 ¥27.31/吨·100mg（=161/5895000），与中心差分一致', () => {
  for (const cap of ['4100', '3500', '3000', '2608']) {
    const r = solveG1(g1, { ncap: cap });
    assert.equal(r.duals[3].toString(), '-161/5895000', `dual at cap=${cap}`);
  }
  // 中心差分独立重算（减钠方向）：(z(cap−50) − z(cap+50)) / 100mg × 10^4
  const cap = '3500';
  const up = solveG1(g1, { ncap: String(Number(cap) + 50) });
  const dn = solveG1(g1, { ncap: String(Number(cap) - 50) });
  const fd = dn.costPer100g.sub(up.costPer100g).mul(100).toNumber() * 100;
  assert.ok(Math.abs(fd - 27.311) < 0.01, `finite-diff: ${fd}`);
});

// ———————————— G2 六情景（G2 算例 §三） ————————————
test('G2: S0 纯 SPI 基线 ¥1.6622/100g，SPI=88.89g、折蛋白 20.78', () => {
  const s0 = solveG2(g2, { scenario: 's0' });
  assert.equal(s0.status, 'optimal');
  assert.equal(s0.costPer100g.toDecimal(4), 1.6622);
  assert.equal(s0.recipe.spi.toDecimal(2), 88.89);
  assert.equal(s0.recipe.maltodextrin.toDecimal(2), 11.11);
  assert.equal(s0.costPerKgProtein.toDecimal(2), 20.78);
  // S0 幼儿 SAA 缺口（AAS 0.935）——不用解 S0 的评分，直接验算 29/31
  assert.ok(Math.abs(29 / 31 - 0.9355) < 0.0001);
});

test('G2: S1 成人全等价——LP 最优 1.7720；文档配方（SPI60/豌豆2.5/大米30）可行且同成本 ⇒ 最优', () => {
  // 豌豆与大米同为 ¥20/kg、蛋白 80%，存在多个等价最优顶点——LP 证最优值，文档顶点单独对账
  const s1 = solveG2(g2, { scenario: 's1' });
  assert.equal(s1.status, 'optimal');
  assert.equal(s1.costPer100g.toDecimal(4), 1.7720);
  assert.equal(s1.recipe.spi.toString(), '60'); // SPI 顶格在所有最优顶点上成立
  const doc = evalG2Recipe(g2, 's1', { spi: '60', pea: '2.5', rice: '30', maltodextrin: '7.5' });
  assert.ok(doc.feasible, doc.violations.map((v) => v.name).join(','));
  assert.equal(doc.cost.toDecimal(4), 1.7720);
  // 成人 Lys 评分 = 4458/(45×80) = 1.238（文档"≥1.31"为非 min 口径——README 对账表第 1 条）
  assert.ok(Math.abs(doc.scores.lys.ratio.toDecimal(3) - 1.238) < 0.001);
});

test('G2: S2/S2′ 幼儿级与 S1 同价（升级=0）；文档配方 Lys 精确贴线 4560=57×80', () => {
  const s2 = solveG2(g2, { scenario: 's2' });
  const s2b = solveG2(g2, { scenario: 's2b' });
  assert.equal(s2.costPer100g.toDecimal(4), 1.7720);
  assert.equal(s2b.costPer100g.toDecimal(4), 1.7720);
  const doc = evalG2Recipe(g2, 's2', { spi: '60', pea: '6.25', rice: '26.25', maltodextrin: '7.5' });
  assert.ok(doc.feasible, doc.violations.map((v) => v.name).join(','));
  assert.equal(doc.cost.toDecimal(4), 1.7720);
  assert.equal(doc.scores.lys.supply.toString(), '4560'); // SPI54×63 + 豌豆5×72 + 大米21×38
  assert.equal(doc.scores.lys.ratio.toString(), '1');
});

test('G2: S3 DIAAS 口径 1.7776（+5.6 厘＝¥56/吨），晶体 0.85g 三关贴线；S3′ 禁晶体不可行', () => {
  const s3 = solveG2(g2, { scenario: 's3' });
  assert.equal(s3.status, 'optimal');
  assert.equal(s3.costPer100g.toDecimal(4), 1.7776);
  assert.equal(s3.costPerKgProtein.toDecimal(2), 22.22);
  // 三关贴线（游离碱折算下的精确值，四舍五入对账文档 0.708/0.085/0.053）
  assert.equal(s3.recipe.lys_hcl.toDecimal(3), 0.708);
  assert.equal(s3.recipe.dl_met.toDecimal(3), 0.085);
  assert.equal(s3.recipe.l_thr.toDecimal(3), 0.053);
  assert.equal(s3.crystalMass.toDecimal(2), 0.85);
  for (const aa of ['lys', 'saa', 'thr']) assert.equal(s3.scores[aa].ratio.toString(), '1');
  assert.equal(solveG2(g2, { scenario: 's3b' }).status, 'infeasible');
});

test('G2: 差价面板——幼儿级免费 / DIAAS +5.6 厘 / 豆腥分散 +110 厘（≈20 倍）', () => {
  const all = g2AllScenarios(g2);
  assert.equal(all.diffs.preschool_free.toString(), '0');
  assert.equal(all.diffs.diaas_upgrade.toDecimal(4), 0.0056);
  assert.equal(all.perTon.diaas_upgrade.toDecimal(0), 56);
  assert.equal(all.diffs.sensory_dispersion.toDecimal(4), 0.1098);
  assert.equal(all.perTon.sensory_dispersion.toDecimal(0), 1098); // 1098/56 ≈ 19.6 ≈ 近 20 倍
});

test('G2: 敏感性预设——Met 暴涨几乎不动价签；吨级采购进 ¥15 带', () => {
  const met52 = g2AllScenarios(g2, { dl_met: '52' });
  assert.equal(met52.scenarios.s2.costPer100g.toDecimal(4), 1.7720); // S2 不用 Met
  const s3met = met52.scenarios.s3.costPer100g;
  assert.equal(s3met.sub(F.from('1.7776')).toDecimal(4), 0.0024);    // 仅 +2.4 厘/100g
  const ton = g2AllScenarios(g2, { pea: '15', rice: '15' });
  assert.equal(ton.scenarios.s2.costPerKgProduct.toDecimal(2), 15.49);
});

// ———————————— v0.2：武器面板精确输出（RHS 区间 / 价格区间） ————————————

test('v0.2 LP: RHS 基不变区间与价格区间（经典盘 2608 档，复解探针对账）', () => {
  const r = solveG1(g1, { ncap: '2608' });
  const iNa = r.problem.constraints.findIndex((c) => c.name === 'sodium');
  // 钠区间下端＝2608（KCl 顶格天花板），上端＝4966＝393×12+125×2（KCl 退出基，MSG 2g 顶格）
  assert.equal(r.rhsRange[iNa].lo.toString(), '2608');
  assert.equal(r.rhsRange[iNa].hi.toString(), '4966');
  // 区间内影子价格恒定、越过上端换段（复解探针）
  assert.equal(r.shadowPer100mgPerTon.toDecimal(2), 27.31);
  const justAbove = solveG1(g1, { ncap: '4966.001' });
  assert.ok(Math.abs(justAbove.shadowPer100mgPerTon.toDecimal(2) - 27.31) > 0.5);
  // 价格区间：NaCl 涨到 ¥37/3=12.333/kg 换基（KCl 相对竞争力反转点）；YE 降到 ¥4.929304 入基；KCl 上界无穷（2608 档配方被可行性钉死）
  const jN = r.problem.varNames.indexOf('nacl');
  const jY = r.problem.varNames.indexOf('ye');
  const jK = r.problem.varNames.indexOf('kcl');
  assert.equal(r.priceRange[jN].hi.mul(1000).toString(), '37/3');
  assert.equal(r.priceRange[jY].lo.mul(1000).toDecimal(6), 4.929304);
  assert.equal(r.priceRange[jK].hi, null);
});

// ———————————— v0.2：G1 扩展盘（12 原料） ————————————

test('v0.2 G1 扩展盘：2608 档 0.380967（经典解＋香辛/砂糖下限固定成本）；苦味行贴线', () => {
  const r = solveG1(g1, { palette: 'extended', ncap: '2608' });
  assert.equal(r.status, 'optimal');
  assert.equal(r.costPer100g.toString(), F.from('89051/233750').toString());
  assert.equal(r.costPer100g.toDecimal(6), 0.380967);
  // 顶点结构：NaCl 6、KCl 8（苦味贴线）、I+G 开始置换 MSG；钾＝524×8 精确
  assert.equal(r.recipe.nacl.toString(), '6');
  assert.equal(r.recipe.kcl.toString(), '8');
  assert.equal(r.potassium.toString(), '4192');
  const iB = r.problem.constraints.findIndex((c) => c.name === 'bitter');
  assert.ok(r.binding[iB]);
  // 扩展盘比经典盘高 0.0214（香辛/砂糖下限固定成本 0.0212 ＋ 2608 档微量 I+G 置换；引擎精确差）
  assert.equal(r.costPer100g.sub(solveG1(g1, { ncap: '2608' }).costPer100g).toDecimal(4), 0.0214);
});

test('v0.2 G1 病种模式：高血压档可解（掩蔽放松 KCl）；经典盘不可行；CKD 控钾不可行（张力输出）', () => {
  const hyp = solveG1(g1, { palette: 'extended', disease: 'hypertension' });
  assert.equal(hyp.status, 'optimal');
  assert.equal(hyp.costPer100g.toString(), F.from('1689527/3930000').toString());
  assert.equal(hyp.costPer100g.toDecimal(4), 0.4299);
  assert.equal(hyp.recipe.kcl.toString(), '3815/393');   // KCl 9.71g > 8：掩蔽在起作用
  assert.equal(hyp.recipe.lac_k.toString(), '671/393');  // 苦味行：9.71 − 1×1.71 = 8 贴线
  assert.equal(hyp.recipe.ig.toString(), '1/4');
  assert.equal(hyp.sodium.toString(), '1875');
  assert.equal(solveG1(g1, { palette: 'classic', disease: 'hypertension' }).status, 'infeasible');
  assert.equal(solveG1(g1, { palette: 'extended', disease: 'ckd' }).status, 'infeasible');
});

test('v0.2 G1 参数化曲线：四段精确拐点 2612/2378.25/1641.375/1494，影子价格与中心差分一致', () => {
  const segs = g1SodiumSegments(g1, { palette: 'extended' });
  assert.equal(segs.length, 4);
  const lo = segs.map((s) => s.lo.toString());
  const hi = segs.map((s) => s.hi.toString());
  assert.deepEqual(hi, ['4716', '2612', '9513/4', '13131/8']);
  assert.deepEqual(lo, ['2612', '9513/4', '13131/8', '1494']);
  // 段斜率＝影子价格（¥/吨·100mg）：27.31 → 41.71（I+G 置换）→ 78.20（掩蔽）→ 95.17（柠檬酸）
  assert.equal(segs[0].shadow.toString(), '32200/1179');
  assert.equal(segs[1].shadow.toString(), '7800/187');
  assert.equal(segs[2].shadow.toString(), '92200/1179');
  assert.equal(segs[3].shadow.toString(), '37400/393');
  // 中心差分交叉验证第 3 段（cap=2000±2）：收紧钠的成本斜率＝段影子价格
  const up = solveG1(g1, { palette: 'extended', ncap: '2002' });
  const dn = solveG1(g1, { palette: 'extended', ncap: '1998' });
  const fd = dn.costPer100g.sub(up.costPer100g).div(4).mul(100).mul(10000); // ¥/吨·100mg
  assert.ok(Math.abs(fd.sub(segs[2].shadow).toNumber()) < 0.01, `fd=${fd.toDecimal(4)}`);
  // 可行下限＝1494（393×3.75＋65×0.25＋5×0.8）：恰可行、1493 不可行
  const floor = solveG1(g1, { palette: 'extended', ncap: '1494' });
  assert.equal(floor.status, 'optimal');
  assert.equal(floor.costPer100g.toString(), F.from('2311/5000').toString());
  assert.equal(floor.recipe.nacl.toString(), '15/4');
  assert.equal(floor.recipe.citric.toString(), '3/2');
  assert.equal(solveG1(g1, { palette: 'extended', ncap: '1493' }).status, 'infeasible');
});

test('v0.2 G1 「1+6」：演示档全松、成本不变；GB 声称档（无糖 0.5 vs 甜味下限 2）不可行', () => {
  const off = solveG1(g1, { palette: 'extended', ncap: '2608' });
  const demo = solveG1(g1, { palette: 'extended', ncap: '2608', onex6: 'demo' });
  assert.equal(demo.costPer100g.toString(), off.costPer100g.toString()); // 6 行全松
  const n6bound = demo.problem.constraints.some((c, i) => c.name.startsWith('n6_') && demo.binding[i]);
  assert.equal(n6bound, false);
  assert.equal(solveG1(g1, { palette: 'extended', ncap: '2608', onex6: 'gb_claims' }).status, 'infeasible');
});

// ———————————— v0.2：G2 数据升级（USDA 逐格＋FAO 2013＋分项消化率） ————————————

test('v0.2 G2 USDA 派生：SPI SAA 逐格折算 (1.13+1.046)×1000/88.32＝1700/69 mg/g；FAO Table 5 直录', () => {
  const spi = g2.variables.find((v) => v.key === 'spi');
  const gv = spi.aa_usda.aa_g_per_100g;
  const saa = F.from(gv.met).add(F.from(gv.cys)).mul(1000).div(F.from(spi.aa_usda.protein_g_per_100g));
  assert.equal(saa.toString(), '1700/69'); // ≈24.64（v01 文献典型 29——USDA 逐格更紧，推高 DIAAS 档 Met 需求）
  // FAO 2013 原报告 Table 5 直录（对账表第 3 条：v01 转引值三格不符，v01 档保留锚点）
  const child = g2.patterns.child_2013.mg_per_g_protein;
  assert.deepEqual([child.saa, child.thr, child.trp], ['27', '31', '8.5']);
  const old = g2.patterns.preschool.mg_per_g_protein;
  assert.deepEqual([old.saa, old.thr, old.trp], ['31', '34', '11']);
});

test('v0.2 G2 v02 档：谷朊粉改写 S0 基线 1.2067；赖氨酸成硬约束（晶体进 S1）；S2=S3 同价', () => {
  const s0 = solveG2(g2, { scenario: 's0', profile: 'v02_usda' });
  assert.equal(s0.costPer100g.toString(), F.from('181/150').toString());
  assert.equal(s0.recipe.wheat.toString(), '200/3');   // 66.67g 谷朊粉（¥9/kg）
  assert.equal(s0.costPerKgProtein.toDecimal(2), 15.08);
  const s1 = solveG2(g2, { scenario: 's1', profile: 'v02_usda' });
  assert.equal(s1.costPer100g.toDecimal(4), 1.4725);
  assert.ok(s1.recipe.lys_hcl.isPos());                 // FAO 2013 成人 Lys 48＋小麦 Lys 22 → 晶体进场
  assert.equal(s1.scores.lys.ratio.toString(), '1');    // Lys 贴线＝限制性氨基酸
  assert.equal(s1.recipe.wheat.toString(), '30');       // 麸质过敏原上限贴线
  const s2 = solveG2(g2, { scenario: 's2', profile: 'v02_usda' });
  const s3 = solveG2(g2, { scenario: 's3', profile: 'v02_usda' });
  assert.equal(s2.costPer100g.toString(), s3.costPer100g.toString()); // 分项消化率口径下同一顶点双口径最优
  assert.equal(s2.costPer100g.toDecimal(4), 1.4777);
  // USDA 逐格后「纯混配达幼儿级」被推翻：S2′/S3′ 均不可行（v01 档 S2′ 可行——数据口径改变结论）
  assert.equal(solveG2(g2, { scenario: 's2b', profile: 'v02_usda' }).status, 'infeasible');
  assert.equal(solveG2(g2, { scenario: 's3b', profile: 'v02_usda' }).status, 'infeasible');
  assert.equal(solveG2(g2, { scenario: 's2b' }).status, 'optimal');
});

test('v0.2 G2 质量前沿：S2 v02 λmax＝563/512＝1.099609（口感上限内可同时推到 1.10）', () => {
  const fr = g2QualityFrontier(g2, { scenario: 's2', profile: 'v02_usda' }, 2);
  assert.equal(fr.lambdaMax.toString(), '563/512');
  const at1 = fr.points[0];
  const s2 = solveG2(g2, { scenario: 's2', profile: 'v02_usda' });
  assert.equal(at1.cost.toString(), s2.costPer100g.toString());
  const atMax = fr.points[fr.points.length - 1];
  assert.ok(atMax.cost.gt(at1.cost)); // 曲线单调上翘
});

test('v0.2 G2 交替最优检测：v01 S1 为真（豌豆/大米等价），S3 与 v02 S1 为假', () => {
  assert.equal(solveG2(g2, { scenario: 's1' }).alternateOptima, true);
  assert.equal(solveG2(g2, { scenario: 's3' }).alternateOptima, false);
  assert.equal(solveG2(g2, { scenario: 's1', profile: 'v02_usda' }).alternateOptima, false);
});

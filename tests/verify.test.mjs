// verify.test.mjs — 锚定全部已审计数字（战略文档 §一仪表盘 / §十一重验表 / G1·G2 算例正本）
// 断言原则：文档精确可表达的数（如 0.3596、1.7720、0.2832）用精确分数相等；
// 含无理结构的数（Lys·HCl 游离碱 14619/18265 参与的 S3）用 4 位小数舍入对账。
// 已知两处文档差异（README 对账表）：S1 min AAS 文档写 ≥1.31（复算 1.238）、影子价格首段 27.6（精确 27.3）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { F } from '../src/fraction.js';
import { solveLP } from '../src/lp.js';
import { solveG1, g1Ladder, solveG2, g2AllScenarios, evalG2Recipe } from '../src/models.js';

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

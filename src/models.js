// models.js — 把 data/*.json 装配成 LP 问题，并对求解结果做口径化派生
// 所有数字运算走 F（精确有理数）；展示层才转小数。

import { F } from './fraction.js';
import { solveLP } from './lp.js';

// ———————————————————— G1 方便面调料包减钠 ————————————————————

/**
 * @param {object} data data/g1-seasoning.json
 * @param {{ncap?: string|number, kclPrice?: string|number, kclSaltiness?: string|number}} opts
 */
export function solveG1(data, opts = {}) {
  const by = Object.fromEntries(data.variables.map((v) => [v.key, v]));
  const priceOf = (key) =>
    F.from(key === 'kcl' && opts.kclPrice !== undefined ? opts.kclPrice : by[key].price_cny_per_kg);
  const saltKcl = F.from(opts.kclSaltiness !== undefined ? opts.kclSaltiness : by.kcl.saltiness_eq);
  const ncap = F.from(opts.ncap !== undefined ? opts.ncap : '2608');

  const problem = makeG1Problem(data, priceOf, saltKcl, ncap, by);
  const res = solveLP(problem);
  if (res.status !== 'optimal') return { ...res, problem };

  // —— 派生量（全部实时计算，不写死文档数字）——
  const recipe = {};
  data.variables.forEach((v, i) => { recipe[v.key] = res.x[i]; });

  // 两个基准：纯盐基线按数据现算；LP 解基线＝钠上限 4716 行重新求解
  const pureCost = F.from(by.nacl.price_cny_per_kg).div(1000).mul(F.from(data.baselines.pure_salt.recipe_g.nacl))
    .add(F.from(by.carrier.price_cny_per_kg).div(1000).mul(F.from(data.baselines.pure_salt.recipe_g.carrier)));
  const pureSodium = F.from(by.nacl.sodium_mg_per_g).mul(F.from(data.baselines.pure_salt.recipe_g.nacl));
  const base4716 = solveLP(makeG1Problem(data, priceOf, saltKcl, F.from('4716'), by));

  const uc = data.unit_conversions;
  const toTon = F.from(uc.per_100g_to_per_ton);
  const packetG = F.from(uc.packet_g);
  const perPacketLi = (cost) => cost.mul(packetG).div(100).mul(F.from(uc.li_per_cny)); // ¥/100g → 8g 包 → 厘

  // 钠约束对偶：dual = dz/dNcap（≤0）。影子价格＝每减 100mg、每吨的成本增量
  const dualSodium = res.duals[problem.constraints.findIndex((c) => c.name === 'sodium')];
  const shadowPer100mgPerTon = dualSodium.neg().mul(100).mul(toTon);

  let sodium = F.ZERO;
  data.variables.forEach((v, i) => {
    if (!res.x[i].isZero()) sodium = sodium.add(F.from(v.sodium_mg_per_g || '0').mul(res.x[i]));
  });

  return {
    ...res, problem, recipe, ncap,
    costPer100g: res.obj,
    costPerTon: res.obj.mul(toTon),
    costPerPacketLi: perPacketLi(res.obj),
    sodium,
    pureSaltBaseline: { cost: pureCost, sodium: pureSodium },
    lpBaseline4716: base4716.status === 'optimal' ? { cost: base4716.obj } : null,
    deltaVsLp: res.obj.sub(base4716.obj).mul(toTon),   // ¥/吨
    deltaVsPure: res.obj.sub(pureCost).mul(toTon),     // ¥/吨
    deltaVsLpPerPacketLi: perPacketLi(res.obj.sub(base4716.obj)),
    deltaVsPurePerPacketLi: perPacketLi(res.obj.sub(pureCost)),
    shadowPer100mgPerTon, // ¥/吨·100mg（可行区间内 ≈ 27.3；KCl 顶格档 = 0，再收紧即不可行）
  };
}

function makeG1Problem(data, priceOf, saltKcl, ncap, by) {
  const R = data.rhs;
  return {
    varNames: data.variables.map((v) => v.key),
    objective: data.variables.map((v) => priceOf(v.key).div(1000)), // ¥/kg → ¥/g
    constraints: [
      { name: 'total',     sense: 'eq', coeffs: ['1', '1', '1', '1', '1'], rhs: R.total_g },
      { name: 'saltiness', sense: 'ge', coeffs: [by.nacl.saltiness_eq, saltKcl, '0', '0', '0'], rhs: R.saltiness_geq_g },
      { name: 'umami',     sense: 'ge', coeffs: ['0', '0', by.msg.umami_eq, by.ye.umami_eq, '0'], rhs: R.umami_geq_g },
      { name: 'sodium',    sense: 'le', coeffs: [by.nacl.sodium_mg_per_g, '0', by.msg.sodium_mg_per_g, by.ye.sodium_mg_per_g, '0'], rhs: ncap },
      { name: 'kcl_cap',   sense: 'le', coeffs: ['0', '1', '0', '0', '0'], rhs: R.kcl_cap_g },
    ],
  };
}

/** 钠阶梯：给定档位逐档求解（战略图 4 同构数据） */
export function g1Ladder(data, opts = {}, caps = ['4716', '4100', '3500', '3000', '2608']) {
  return caps.map((cap) => {
    const r = solveG1(data, { ...opts, ncap: cap });
    return {
      cap: F.from(cap),
      status: r.status,
      cost: r.status === 'optimal' ? r.costPer100g : null,
      sodium: r.status === 'optimal' ? r.sodium : null,
      recipe: r.status === 'optimal' ? r.recipe : null,
      shadow: r.status === 'optimal' ? r.shadowPer100mgPerTon : null,
    };
  });
}

// ———————————————————— G2 植物蛋白混配 ————————————————————

function crystalSupplyPerG(v) {
  // 晶体氨基酸供给：mg AA / g 原料 = 1000 × 纯度 × 游离碱基分数（Lys·HCl ≈ 788.44 mg/g）
  return F.from(1000).mul(F.from(v.purity)).mul(F.from(v.free_base_fraction));
}

function g2Problem(data, sc, priceOf) {
  const vars = data.variables;
  const constraints = [
    { name: 'total', sense: 'eq', coeffs: vars.map(() => '1'), rhs: data.rhs.total_g },
    { name: 'protein', sense: 'ge', coeffs: vars.map((v) => v.protein_fraction || '0'), rhs: data.rhs.protein_g },
  ];
  // 氨基酸约束：Σ_i P_i·(AA_i − m·pattern) + 晶体供给 ≥ 0（m=1 为 AAS，DIAAS 口径 m=1.1）
  if (sc.pattern) {
    const pattern = data.patterns[sc.pattern].mg_per_g_protein;
    const m = sc.diaas ? F.from(data.diaas.demand_multiplier) : F.ONE;
    for (const aa of data.aa_order) {
      const coeffs = vars.map((v) => {
        if (v.is_crystal) return v.supplies_aa === aa ? crystalSupplyPerG(v) : F.ZERO;
        if (!v.protein_fraction || v.protein_fraction === '0') return F.ZERO;
        return F.from(v.protein_fraction).mul(F.from(v.aa_mg_per_g_protein[aa]).sub(m.mul(F.from(pattern[aa]))));
      });
      constraints.push({ name: `aa_${aa}`, sense: 'ge', coeffs, rhs: '0' });
    }
  }
  if (sc.caps) {
    for (const v of vars) {
      if (v.cap_g_per_100g) constraints.push({ name: `cap_${v.key}`, sense: 'le', coeffs: vars.map((w) => (w.key === v.key ? '1' : '0')), rhs: v.cap_g_per_100g });
    }
  }
  const crystalKeys = vars.filter((v) => v.is_crystal).map((v) => v.key);
  if (!sc.crystals) {
    for (const key of crystalKeys) constraints.push({ name: `off_${key}`, sense: 'le', coeffs: vars.map((w) => (w.key === key ? '1' : '0')), rhs: '0' });
  } else {
    constraints.push({ name: 'crystal_cap', sense: 'le', coeffs: vars.map((v) => (v.is_crystal ? '1' : '0')), rhs: data.rhs.crystal_cap_g });
  }
  return {
    varNames: vars.map((v) => v.key),
    objective: vars.map((v) => priceOf(v.key).div(1000)),
    constraints,
  };
}

/** 蛋白总量与九项氨基酸评分（供给 ÷ (m×pattern×P)） */
function g2Scores(data, sc, recipe) {
  const vars = data.variables;
  const plants = vars.filter((v) => !v.is_crystal && v.protein_fraction && v.protein_fraction !== '0');
  let protein = F.ZERO;
  for (const v of plants) protein = protein.add(F.from(v.protein_fraction).mul(recipe[v.key]));
  const m = sc.diaas ? F.from(data.diaas.demand_multiplier) : F.ONE;
  const scores = {};
  if (sc.pattern) {
    const pattern = data.patterns[sc.pattern].mg_per_g_protein;
    for (const aa of data.aa_order) {
      let supply = F.ZERO;
      for (const v of plants) supply = supply.add(F.from(v.protein_fraction).mul(recipe[v.key]).mul(F.from(v.aa_mg_per_g_protein[aa])));
      for (const v of vars) if (v.is_crystal && v.supplies_aa === aa && !recipe[v.key].isZero()) supply = supply.add(crystalSupplyPerG(v).mul(recipe[v.key]));
      const demand = m.mul(F.from(pattern[aa])).mul(protein);
      scores[aa] = { supply, demand, ratio: demand.isZero() ? null : supply.div(demand) };
    }
  }
  return { protein, scores };
}

/**
 * @param {object} data data/g2-protein.json
 * @param {{scenario?: string, priceOverrides?: Object<string,string|number>}} opts
 */
export function solveG2(data, opts = {}) {
  const by = Object.fromEntries(data.variables.map((v) => [v.key, v]));
  const sc = data.scenarios.find((s) => s.key === (opts.scenario || 's0'));
  if (!sc) throw new Error(`unknown scenario ${opts.scenario}`);
  const overrides = opts.priceOverrides || {};
  const priceOf = (key) => F.from(overrides[key] !== undefined ? overrides[key] : by[key].price_cny_per_kg);

  const problem = g2Problem(data, sc, priceOf);
  const res = solveLP(problem);
  if (res.status !== 'optimal') return { ...res, problem, scenario: sc };

  const recipe = {};
  data.variables.forEach((v, i) => { recipe[v.key] = res.x[i]; });
  const { protein, scores } = g2Scores(data, sc, recipe);
  const crystalMass = data.variables.filter((v) => v.is_crystal).reduce((acc, v) => acc.add(recipe[v.key]), F.ZERO);

  return {
    ...res, problem, scenario: sc, recipe,
    costPer100g: res.obj,
    costPerKgProduct: res.obj.mul(10),
    costPerKgProtein: res.obj.div(F.from(data.unit_conversions.protein_kg_per_100g)),
    protein, scores, crystalMass,
  };
}

/**
 * 验证一份给定配方（g/100g）：可行性逐约束判定＋成本＋评分。
 * 用途：文档记载顶点（如 S1 的 SPI60/豌豆2.5/大米30）与 LP 最优值对账——
 * 可行且成本＝最优值 ⇒ 该配方获最优性证明（LP 可能给出多个等价最优顶点）。
 */
export function evalG2Recipe(data, scenarioKey, recipeG, priceOverrides = {}) {
  const by = Object.fromEntries(data.variables.map((v) => [v.key, v]));
  const sc = data.scenarios.find((s) => s.key === scenarioKey);
  if (!sc) throw new Error(`unknown scenario ${scenarioKey}`);
  const priceOf = (key) => F.from(priceOverrides[key] !== undefined ? priceOverrides[key] : by[key].price_cny_per_kg);
  const problem = g2Problem(data, sc, priceOf);

  const recipe = {};
  const x = data.variables.map((v) => { recipe[v.key] = F.from(recipeG[v.key] ?? '0'); return recipe[v.key]; });

  const violations = [];
  for (const con of problem.constraints) {
    let lhs = F.ZERO;
    con.coeffs.forEach((c, j) => { const cf = F.from(c); if (!cf.isZero() && !x[j].isZero()) lhs = lhs.add(cf.mul(x[j])); });
    const rhs = F.from(con.rhs);
    const ok = con.sense === 'ge' ? !lhs.lt(rhs) : con.sense === 'le' ? !lhs.gt(rhs) : lhs.eq(rhs);
    if (!ok) violations.push({ name: con.name, sense: con.sense, lhs, rhs });
  }
  let cost = F.ZERO;
  problem.objective.forEach((c, j) => { const cf = F.from(c); if (!cf.isZero() && !x[j].isZero()) cost = cost.add(cf.mul(x[j])); });

  const { protein, scores } = g2Scores(data, sc, recipe);
  return { feasible: violations.length === 0, violations, cost, protein, scores };
}

/** 六情景全解＋三个关键差价（媒体句口径） */
export function g2AllScenarios(data, priceOverrides) {
  const out = {};
  for (const sc of data.scenarios) out[sc.key] = solveG2(data, { scenario: sc.key, priceOverrides });
  const c = (k) => (out[k].status === 'optimal' ? out[k].costPer100g : null);
  const toTon = F.from(data.unit_conversions.per_100g_to_per_ton);
  const diff = (a, b) => (c(a) && c(b) ? c(a).sub(c(b)) : null);
  const d1 = diff('s3', 's2');
  const d2 = diff('s1', 's0');
  return {
    scenarios: out,
    diffs: {
      preschool_free: diff('s2', 's1'),   // 幼儿级 AAS 升级（预期 0）
      diaas_upgrade: d1,                  // DIAAS 口径（预期 +5.6 厘/100g）
      sensory_dispersion: d2,             // 豆腥/过敏原分散（预期 +110 厘/100g）
    },
    perTon: {
      diaas_upgrade: d1 ? d1.mul(toTon) : null,
      sensory_dispersion: d2 ? d2.mul(toTon) : null,
    },
  };
}

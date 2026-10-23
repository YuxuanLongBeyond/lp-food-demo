// models.js — 数据驱动装配（v0.2）：data/*.json → LP 问题 → 口径化派生
// 所有数字运算走 F（精确有理数）；展示层才转小数。
// v0.2：G1 与 G2 共用同一装配内核——G1 的约束行由 constraint_rows schema 生成
// （加原料/加约束＝改 JSON 不改代码）；G2 保留氨基酸特殊行的线性化两档口径
// （v01_typical：全局 ×1.1 乘子；v02_usda：USDA 逐格矩阵＋分项消化率）。

import { F } from './fraction.js';
import { solveLP } from './lp.js';

// ———————————————————— 通用装配工具 ————————————————————

/** 原料盘过滤：G1 有 palettes；G2 无盘时返回全部变量 */
function paletteVars(data, palette) {
  if (!data.palettes) return data.variables;
  const p = data.palettes[palette || 'classic'];
  if (!p) throw new Error(`unknown palette ${palette}`);
  const by = Object.fromEntries(data.variables.map((v) => [v.key, v]));
  return p.keys.map((k) => { if (!by[k]) throw new Error(`palette var missing: ${k}`); return by[k]; });
}

/** 盘内系数字段取值：缺字段→0；值可为字符串或 {palette: 值}（按盘差异化） */
function coefIn(v, field, palette) {
  const raw = v[field];
  if (raw === undefined || raw === null) return F.ZERO;
  const val = typeof raw === 'object' ? raw[palette] : raw;
  return val === undefined || val === null ? F.ZERO : F.from(val);
}

function hasCoefIn(v, field, palette) {
  const raw = v[field];
  if (raw === undefined || raw === null) return false;
  if (typeof raw !== 'object') return true;
  return raw[palette] !== undefined && raw[palette] !== null;
}

/** 变量上下限行 + 变量单位行（cap_/floor_），供 G1/G2 共用 */
function boundRows(vars, palette) {
  const rows = [];
  const unit = (key) => vars.map((w) => (w.key === key ? F.ONE : F.ZERO));
  for (const v of vars) {
    if (hasCoefIn(v, 'cap_g_per_100g', palette)) rows.push({ name: `cap_${v.key}`, sense: 'le', coeffs: unit(v.key), rhs: coefIn(v, 'cap_g_per_100g', palette) });
    if (hasCoefIn(v, 'floor_g_per_100g', palette)) rows.push({ name: `floor_${v.key}`, sense: 'ge', coeffs: unit(v.key), rhs: coefIn(v, 'floor_g_per_100g', palette) });
  }
  return rows;
}

// ———————————————————— G1 方便面调料包减钠 ————————————————————

/**
 * @param {object} data data/g1-seasoning.json (schema 2)
 * @param {{palette?: 'classic'|'extended', ncap?: string|number, kclPrice?: string|number,
 *          kclSaltiness?: string|number, disease?: string, onex6?: 'off'|'demo'|'gb_claims',
 *          priceOverrides?: Object<string,string|number>}} opts
 */
export function solveG1(data, opts = {}) {
  const palette = opts.palette || 'classic';
  const vars = paletteVars(data, palette);
  const problem = g1Problem(data, opts);
  const res = solveLP(problem);
  if (res.status !== 'optimal') return { ...res, problem };

  // —— 派生量（全部实时计算，不写死文档数字）——
  const recipe = {};
  vars.forEach((v, i) => { recipe[v.key] = res.x[i]; });

  const byAll = Object.fromEntries(data.variables.map((v) => [v.key, v]));
  const priceOfAll = (key) => {
    const ov = opts.priceOverrides || {};
    if (key === 'kcl' && opts.kclPrice !== undefined) return F.from(opts.kclPrice);
    if (ov[key] !== undefined) return F.from(ov[key]);
    return F.from(byAll[key].price_cny_per_kg);
  };

  // 两个基准：纯盐基线按数据现算；LP 解基线＝同盘同开关、钠上限 4716、标准模式重解
  const ps = data.baselines.pure_salt;
  let pureCost = F.ZERO; let pureSodium = F.ZERO;
  for (const [key, g] of Object.entries(ps.recipe_g)) {
    pureCost = pureCost.add(priceOfAll(key).div(1000).mul(F.from(g)));
    pureSodium = pureSodium.add(F.from(byAll[key].sodium_mg_per_g || '0').mul(F.from(g)));
  }
  const base4716 = solveLP(g1Problem(data, { ...opts, ncap: data.rhs.sodium_cap_max_mg, disease: 'standard' }));

  const uc = data.unit_conversions;
  const toTon = F.from(uc.per_100g_to_per_ton);
  const packetG = F.from(uc.packet_g);
  const perPacketLi = (cost) => cost.mul(packetG).div(100).mul(F.from(uc.li_per_cny)); // ¥/100g → 8g 包 → 厘

  // 钠约束对偶：dual = dz/dNcap（≤0）。影子价格＝每减 100mg、每吨的成本增量
  const iNa = problem.constraints.findIndex((c) => c.name === 'sodium');
  const shadowPer100mgPerTon = res.duals[iNa].neg().mul(100).mul(toTon);

  let sodium = F.ZERO; let potassium = F.ZERO;
  vars.forEach((v, i) => {
    if (!res.x[i].isZero()) {
      sodium = sodium.add(F.from(v.sodium_mg_per_g || '0').mul(res.x[i]));
      potassium = potassium.add(coefIn(v, 'potassium_mg_per_g', palette).mul(res.x[i]));
    }
  });

  return {
    ...res, problem, recipe, palette,
    disease: data.disease_modes ? data.disease_modes.find((d) => d.key === (opts.disease || 'standard')) : null,
    onex6: opts.onex6 || 'off',
    ncap: F.from(problem.constraints[iNa].rhs),
    costPer100g: res.obj,
    costPerTon: res.obj.mul(toTon),
    costPerPacketLi: perPacketLi(res.obj),
    sodium, potassium,
    pureSaltBaseline: { cost: pureCost, sodium: pureSodium },
    lpBaseline4716: base4716.status === 'optimal' ? { cost: base4716.obj } : null,
    deltaVsLp: base4716.status === 'optimal' ? res.obj.sub(base4716.obj).mul(toTon) : null,   // ¥/吨
    deltaVsPure: res.obj.sub(pureCost).mul(toTon),     // ¥/吨
    deltaVsLpPerPacketLi: base4716.status === 'optimal' ? perPacketLi(res.obj.sub(base4716.obj)) : null,
    deltaVsPurePerPacketLi: perPacketLi(res.obj.sub(pureCost)),
    shadowPer100mgPerTon, // ¥/吨·100mg（基不变区间内恒定；区间由 res.rhsRange[iNa] 给出）
  };
}

function g1Problem(data, opts) {
  const palette = opts.palette || 'classic';
  const vars = paletteVars(data, palette);
  const priceOf = (v) => {
    const ov = opts.priceOverrides || {};
    if (v.key === 'kcl' && opts.kclPrice !== undefined) return F.from(opts.kclPrice).div(1000);
    if (ov[v.key] !== undefined) return F.from(ov[v.key]).div(1000);
    return F.from(v.price_cny_per_kg).div(1000); // ¥/kg → ¥/g
  };
  const saltKcl = opts.kclSaltiness !== undefined ? F.from(opts.kclSaltiness) : null;
  const disease = data.disease_modes
    ? data.disease_modes.find((d) => d.key === (opts.disease || 'standard')) || data.disease_modes[0]
    : null;

  // 钠/钾右端项优先级：病种模式覆写 > 显式 ncap > 数据默认
  const ncap = disease && disease.sodium_cap
    ? F.from(disease.sodium_cap)
    : opts.ncap !== undefined ? F.from(opts.ncap) : F.from(data.rhs.sodium_cap_default_mg);
  const kcap = disease && disease.potassium_cap ? F.from(disease.potassium_cap) : null;

  const constraints = [];
  for (const row of data.constraint_rows) {
    if (row.palettes && !row.palettes.includes(palette)) continue;
    if (row.dynamic === 'potassium_cap' && kcap === null) continue;
    let rhs;
    if (row.dynamic === 'sodium_cap') rhs = ncap;
    else if (row.dynamic === 'potassium_cap') rhs = kcap;
    else rhs = F.from(row.rhs !== undefined ? row.rhs : data.rhs[row.rhs_field]);
    const coeffs = row.ones
      ? vars.map(() => F.ONE)
      : vars.map((v) => {
        let s = F.ZERO;
        for (const f of row.terms) {
          if (v.key === 'kcl' && f === 'saltiness_eq' && saltKcl) s = s.add(saltKcl);
          else s = s.add(coefIn(v, f, palette));
        }
        return s;
      });
    constraints.push({ name: row.key, sense: row.sense, coeffs, rhs });
  }
  constraints.push(...boundRows(vars, palette));

  // 1+6（GB 28050）全约束：可开关（off / demo / gb_claims）
  if (opts.onex6 && opts.onex6 !== 'off') {
    const preset = data.schema_1plus6.presets[opts.onex6];
    for (const ph of data.schema_1plus6.placeholders) {
      constraints.push({
        name: `n6_${ph.key}`, sense: ph.sense === 'ge' ? 'ge' : 'le',
        coeffs: vars.map((v) => (v.n6 ? F.from(v.n6[ph.field] || '0') : F.ZERO)),
        rhs: F.from(preset.rhs[ph.key]),
      });
    }
  }
  return { varNames: vars.map((v) => v.key), objective: vars.map(priceOf), constraints };
}

/** 钠阶梯：给定档位逐档求解（战略图 4 同构数据） */
export function g1Ladder(data, opts = {}, caps) {
  const list = caps || ['4716', '4100', '3500', '3000', '2608'];
  return list.map((cap) => {
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

/**
 * 钠参数化曲线（v0.2 武器三）：从 ncap_max 自上而下，用 rhsRange 找精确换基拐点，
 * 分段记录 [lo, hi]×(成本斜率＝影子价格)。返回段数组＋可行下限（不可行即止）。
 */
export function g1SodiumSegments(data, opts = {}) {
  const segs = [];
  const delta = F.from('1/1000'); // 探针偏移：避开退化拐点处的基平手，拐点本身仍取 rhsRange 精确值
  let probe = F.from(opts.from || data.rhs.sodium_cap_max_mg);
  for (let guard = 0; guard < 100; guard++) {
    const r = solveG1(data, { ...opts, ncap: probe, disease: 'standard' });
    if (r.status !== 'optimal') { if (segs.length) segs[segs.length - 1].floor = segs[segs.length - 1].lo; break; }
    const i = r.problem.constraints.findIndex((c) => c.name === 'sodium');
    const { lo, hi } = r.rhsRange[i];
    const top = hi === null || hi.gt(probe) ? probe : hi;
    const segHi = segs.length ? segs[segs.length - 1].lo : top;
    const dual = r.duals[i]; // dz/dNcap ≤ 0；段内成本严格线性
    const costAt = (cap) => r.obj.add(dual.mul(cap.sub(probe)));
    segs.push({
      hi: segHi, lo,
      costAtHi: costAt(segHi), costAtLo: lo === null ? null : costAt(lo),
      shadow: r.shadowPer100mgPerTon, slopePerMg: dual.neg(),
      activeKeys: Object.keys(r.recipe).filter((k) => !r.recipe[k].isZero()),
      recipeAtProbe: r.recipe, probe,
    });
    if (lo === null) break;
    probe = lo.sub(delta);
    if (probe.isNeg()) break;
  }
  return segs;
}

// ———————————————————— G2 植物蛋白混配 ————————————————————

function crystalSupplyPerG(v) {
  // 晶体氨基酸供给：mg AA / g 原料 = 1000 × 纯度 × 游离碱基分数（Lys·HCl ≈ 788.44 mg/g）
  return F.from(1000).mul(F.from(v.purity)).mul(F.from(v.free_base_fraction));
}

/** 两档氨基酸口径：
 *  v01_typical —— v0.1 已审计：七原料、文献典型矩阵，DIAAS 情景用全局乘子 m（模式×1.1）；
 *  v02_usda    —— 十原料、USDA 逐格矩阵（缺格回退典型值）、每原料分项消化率 dig、需求侧 m=1、
 *                 评分模式按 pattern_map 换 FAO 2013 Table 5 原值。 */
function g2Profile(data, profile) {
  const key = profile || (data.data_profiles && data.data_profiles.default) || 'v01_typical';
  const p = data.data_profiles ? data.data_profiles[key] : null;
  return { key, def: p };
}
function g2Vars(data, profile) {
  const { def } = g2Profile(data, profile);
  if (!def || !def.keys) return data.variables;
  const by = Object.fromEntries(data.variables.map((v) => [v.key, v]));
  return def.keys.map((k) => { if (!by[k]) throw new Error(`profile var missing: ${k}`); return by[k]; });
}
/** 原料 v 的氨基酸 aa（mg/g 蛋白，精确有理数）：
 *  v02 且有 aa_usda → aa_g×1000 ÷ protein_g（SAA=Met+Cys、AAA=Phe+Tyr）；否则文献典型值 */
function aaF(v, aa, profile) {
  if (profile === 'v02_usda' && v.aa_usda && v.aa_usda.aa_g_per_100g) {
    const g = v.aa_usda.aa_g_per_100g;
    const P = F.from(v.aa_usda.protein_g_per_100g);
    const sum = (keys) => keys.reduce((acc, k) => acc.add(F.from(g[k])), F.ZERO);
    const grams = aa === 'saa' ? sum(['met', 'cys']) : aa === 'aaa' ? sum(['phe', 'tyr']) : F.from(g[aa]);
    return grams.mul(1000).div(P);
  }
  return F.from(v.aa_mg_per_g_protein[aa]);
}
function digestOf(v, profile) {
  if (profile === 'v02_usda' && v.digestibility) return F.from(v.digestibility.value);
  return null; // v01：不分项（由情景 m 控制）
}
function patternFor(data, patternKey, profile) {
  const { def } = g2Profile(data, profile);
  const mapped = def && def.pattern_map && def.pattern_map[patternKey];
  return data.patterns[mapped || patternKey].mg_per_g_protein;
}

function g2Problem(data, sc, priceOf, profile) {
  const vars = g2Vars(data, profile);
  const constraints = [
    { name: 'total', sense: 'eq', coeffs: vars.map(() => '1'), rhs: data.rhs.total_g },
    { name: 'protein', sense: 'ge', coeffs: vars.map((v) => v.protein_fraction || '0'), rhs: data.rhs.protein_g },
  ];
  // 氨基酸约束（线性化 AAS≥1）：
  //  v01：Σ P_i·(AA_i − m·pattern) + 晶体 ≥ 0（m=1 为 AAS，DIAAS 情景 m=1.1）
  //  v02：Σ P_i·(AA_i·dig_i − pattern) + 晶体 ≥ 0（真 DIAAS 分项消化率口径）
  if (sc.pattern) {
    const pattern = patternFor(data, sc.pattern, profile);
    const m = profile !== 'v02_usda' && sc.diaas ? F.from(data.diaas.demand_multiplier) : F.ONE;
    for (const aa of data.aa_order) {
      const coeffs = vars.map((v) => {
        if (v.is_crystal) return v.supplies_aa === aa ? crystalSupplyPerG(v) : F.ZERO;
        if (!v.protein_fraction || v.protein_fraction === '0') return F.ZERO;
        const aaVal = aaF(v, aa, profile);
        const dig = digestOf(v, profile);
        const supply = dig ? aaVal.mul(dig) : aaVal;
        return F.from(v.protein_fraction).mul(supply.sub(m.mul(F.from(pattern[aa]))));
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

/** 蛋白总量与九项氨基酸评分（供给 ÷ 需求；两档口径与装配一致） */
function g2Scores(data, sc, recipe, profile) {
  const vars = g2Vars(data, profile);
  const plants = vars.filter((v) => !v.is_crystal && v.protein_fraction && v.protein_fraction !== '0');
  let protein = F.ZERO;
  for (const v of plants) protein = protein.add(F.from(v.protein_fraction).mul(recipe[v.key]));
  const m = profile !== 'v02_usda' && sc.diaas ? F.from(data.diaas.demand_multiplier) : F.ONE;
  const scores = {};
  if (sc.pattern) {
    const pattern = patternFor(data, sc.pattern, profile);
    for (const aa of data.aa_order) {
      let supply = F.ZERO;
      for (const v of plants) {
        const dig = digestOf(v, profile);
        const aaVal = aaF(v, aa, profile);
        supply = supply.add(F.from(v.protein_fraction).mul(recipe[v.key]).mul(dig ? aaVal.mul(dig) : aaVal));
      }
      for (const v of vars) if (v.is_crystal && v.supplies_aa === aa && !recipe[v.key].isZero()) supply = supply.add(crystalSupplyPerG(v).mul(recipe[v.key]));
      const demand = m.mul(F.from(pattern[aa])).mul(protein);
      scores[aa] = { supply, demand, ratio: demand.isZero() ? null : supply.div(demand) };
    }
  }
  return { protein, scores };
}

/**
 * @param {object} data data/g2-protein.json (schema 2)
 * @param {{scenario?: string, priceOverrides?: Object<string,string|number>,
 *          profile?: 'v01_typical'|'v02_usda', lpOpts?: object}} opts
 */
export function solveG2(data, opts = {}) {
  const profile = g2Profile(data, opts.profile).key;
  const vars = g2Vars(data, profile);
  const by = Object.fromEntries(vars.map((v) => [v.key, v]));
  const sc = data.scenarios.find((s) => s.key === (opts.scenario || 's0'));
  if (!sc) throw new Error(`unknown scenario ${opts.scenario}`);
  const overrides = opts.priceOverrides || {};
  const priceOf = (key) => F.from(overrides[key] !== undefined ? overrides[key] : by[key].price_cny_per_kg);

  const problem = g2Problem(data, sc, priceOf, profile);
  const res = solveLP(problem, opts.lpOpts);
  if (res.status !== 'optimal' || !res.x) return { ...res, problem, scenario: sc, profile };

  const recipe = {};
  vars.forEach((v, i) => { recipe[v.key] = res.x[i]; });
  const { protein, scores } = g2Scores(data, sc, recipe, profile);
  const crystalMass = vars.filter((v) => v.is_crystal).reduce((acc, v) => acc.add(recipe[v.key]), F.ZERO);

  return {
    ...res, problem, scenario: sc, profile, recipe,
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
export function evalG2Recipe(data, scenarioKey, recipeG, priceOverrides = {}, profile) {
  profile = g2Profile(data, profile).key;
  const vars = g2Vars(data, profile);
  const by = Object.fromEntries(vars.map((v) => [v.key, v]));
  const sc = data.scenarios.find((s) => s.key === scenarioKey);
  if (!sc) throw new Error(`unknown scenario ${scenarioKey}`);
  const priceOf = (key) => F.from(priceOverrides[key] !== undefined ? priceOverrides[key] : by[key].price_cny_per_kg);

  const problem = g2Problem(data, sc, priceOf, profile);

  const recipe = {};
  const x = vars.map((v) => { recipe[v.key] = F.from(recipeG[v.key] ?? '0'); return recipe[v.key]; });

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

  const { protein, scores } = g2Scores(data, sc, recipe, profile);
  return { feasible: violations.length === 0, violations, cost, protein, scores };
}

/** 六情景全解＋三个关键差价（媒体句口径） */
export function g2AllScenarios(data, priceOverrides, profile) {
  const out = {};
  for (const sc of data.scenarios) out[sc.key] = solveG2(data, { scenario: sc.key, priceOverrides, profile });
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

/**
 * 质量前沿（v0.2 武器三，G2 侧）：ε-约束扫描——九项 AAS 下限同乘 λ 的最低成本。
 * λ=1 即现情景；二分找 λmax（可行上限），区间内采样。
 */
export function g2QualityFrontier(data, opts = {}, samples = 10) {
  const base = solveG2(data, opts);
  if (base.status !== 'optimal') return { points: [], lambdaMax: null };
  // 仅替换被缩放的模式对象（浅层结构拷贝）——不整体深拷贝 data，原对象零改动
  const sc = data.scenarios.find((s) => s.key === (opts.scenario || 's0'));
  let scaledData = data, patKey = null;
  if (sc.pattern) {
    const { def } = g2Profile(data, opts.profile);
    patKey = (def && def.pattern_map && def.pattern_map[sc.pattern]) || sc.pattern;
    const orig = data.patterns[patKey];
    const scaled = { ...data, patterns: { ...data.patterns, [patKey]: { ...orig, mg_per_g_protein: { ...orig.mg_per_g_protein } } } };
    scaledData = scaled;
  }
  const withLambda = (lambda, lpOpts) => {
    if (!patKey) return solveG2(data, { ...opts, lpOpts });
    const pat = scaledData.patterns[patKey].mg_per_g_protein;
    for (const aa of data.aa_order) pat[aa] = F.from(data.patterns[patKey].mg_per_g_protein[aa]).mul(lambda).toString();
    return solveG2(scaledData, { ...opts, lpOpts });
  };
  // 二分探针只要可行性：直接装配问题走阶段一（feasibilityOnly），跳过阶段二与全部区间导出
  const overrides = opts.priceOverrides || {};
  const by = Object.fromEntries(data.variables.map((v) => [v.key, v]));
  const priceOf = (key) => F.from(overrides[key] !== undefined ? overrides[key] : by[key].price_cny_per_kg);
  const profileKey = g2Profile(data, opts.profile).key;
  const feasibleAt = (lambda) => {
    if (!patKey) return true;
    const pat = scaledData.patterns[patKey].mg_per_g_protein;
    for (const aa of data.aa_order) pat[aa] = F.from(data.patterns[patKey].mg_per_g_protein[aa]).mul(lambda).toString();
    return solveLP(g2Problem(scaledData, sc, priceOf, profileKey), { feasibilityOnly: true }).status === 'optimal';
  };
  // λmax 二分（精确到 1/512）
  let loL = F.ONE, hiL = F.from(2);
  if (feasibleAt(hiL)) return { points: sampleRange(F.ONE, hiL, samples, withLambda, base), lambdaMax: null };
  for (let i = 0; i < 9; i++) {
    const mid = loL.add(hiL).div(F.from(2));
    if (feasibleAt(mid)) loL = mid; else hiL = mid;
  }
  const points = sampleRange(F.ONE, loL, samples, withLambda, base);
  return { points, lambdaMax: loL };
}
function sampleRange(l0, l1, n, withLambda, base) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const lam = l0.add(l1.sub(l0).mul(F.from(i)).div(F.from(n)));
    // 采样点只要 成本：light 求解跳过对偶与区间导出；λ=1 即基准情景，直接复用
    const r = i === 0 && lam.eq(F.ONE) ? base : withLambda(lam, { light: true });
    pts.push({ lambda: lam, status: r.status, cost: r.status === 'optimal' ? r.costPer100g : null });
  }
  return pts;
}

/**
 * 价格临界点（v0.2 武器三，通用）：基于 priceRange 精确区间＋±ε 复解探针。
 * 探针区分「基变动」与「配方变动」（钉死顶点处换基不换配方，须诚实标注）。
 * @param solveAt (key, price¥/kg) → solve 结果（含 status/recipe）
 */
export function priceBreakpoints(varsMeta, solveAt, eps = '0.01') {
  const E = F.from(eps);
  const probe = (key, price) => {
    const r = solveAt(key, price);
    return { price, status: r.status, recipe: r.status === 'optimal' ? r.recipe : null, cost: r.status === 'optimal' ? r.costPer100g : null };
  };
  return varsMeta.map((m) => {
    const out = { key: m.key, current: m.currentPrice, lo: m.priceRange.lo, hi: m.priceRange.hi, used: m.used, probes: [] };
    if (m.used && m.priceRange.hi) {
      const above = probe(m.key, m.priceRange.hi.add(E));
      const changed = above.status === 'optimal' && above.recipe && !recipeEq(above.recipe, m.baseRecipe);
      out.probes.push({ side: 'up', breakpoint: m.priceRange.hi, changed, above });
    }
    if (!m.used && m.priceRange.lo) {
      const below = probe(m.key, m.priceRange.lo.sub(E));
      const changed = below.status === 'optimal' && below.recipe && (below.recipe[m.key] ? !below.recipe[m.key].isZero() : false);
      out.probes.push({ side: 'down', breakpoint: m.priceRange.lo, changed, below });
    }
    return out;
  });
}
function recipeEq(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    const av = a && a[k] ? a[k] : F.ZERO, bv = b && b[k] ? b[k] : F.ZERO;
    if (!av.eq(bv)) return false;
  }
  return true;
}

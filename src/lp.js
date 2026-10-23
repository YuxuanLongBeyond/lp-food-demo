// lp.js — 精确有理数两阶段单纯形法（零依赖；Bland 规则防循环）
// 形式：min c^T x  s.t.  a_i·x {≤,≥,=} b_i,  x ≥ 0
// 对偶值（影子价格）从终局基读出：y = c_B^T·B^{-1}，B^{-1} 由随表携带的记录块读回。
// 返回 duals[i] = dz*/db_i（原始约束方向：b 增大 1 单位时最优成本的增量）。
// 例：min x s.t. x ≥ 1 → duals = [+1]（rhs 增 1，最优成本增 1）。

import { F } from './fraction.js';

/**
 * @param {{varNames: string[], objective: (string|F)[],
 *          constraints: {name: string, sense: 'le'|'ge'|'eq',
 *                        coeffs: (string|F)[], rhs: string|F}[]}} problem
 * @returns {{status: 'optimal'|'infeasible'|'unbounded', x: F[], obj: F,
 *            duals: F[], binding: boolean[], iterations: number}}
 */
export function solveLP(problem) {
  const n = problem.varNames.length;
  const c = problem.objective.map(F.from);
  const m = problem.constraints.length;
  if (m === 0) throw new Error('solveLP: no constraints');

  // —— 标准化：ge → 取负变 le；rhs<0 → 整行取负。mult 记录净取负符号 ——
  const rows = problem.constraints.map((con) => {
    let a = con.coeffs.map(F.from);
    let b = F.from(con.rhs);
    let mult = 1n;
    if (con.sense === 'ge') { a = a.map((v) => v.neg()); b = b.neg(); mult = -mult; }
    const hasSlack = con.sense !== 'eq';
    let slackCoef = hasSlack ? F.ONE : null;
    if (b.isNeg()) {
      a = a.map((v) => v.neg());
      if (slackCoef) slackCoef = slackCoef.neg();
      b = b.neg(); mult = -mult;
    }
    return {
      name: con.name, a, b, mult, hasSlack, slackCoef,
      aOrig: con.coeffs.map(F.from), bOrig: F.from(con.rhs),
    };
  });

  // —— 列布局：[结构变量 n | 松弛 | 记录块 m | 人工 m | rhs]（阶段二删人工列后 rhsCol 左移）——
  const slackOf = new Array(m).fill(-1);
  let nSlack = 0;
  rows.forEach((r, i) => { if (r.hasSlack) slackOf[i] = nSlack++; });
  const colSlackBase = n;
  const recBase = colSlackBase + nSlack;
  const artBase = recBase + m;
  let rhsCol = artBase + m; // let：阶段二后变 artBase

  let T = rows.map((r, i) => {
    const row = new Array(rhsCol + 1).fill(F.ZERO);
    r.a.forEach((v, j) => { row[j] = v; });
    if (r.hasSlack) row[colSlackBase + slackOf[i]] = r.slackCoef;
    row[recBase + i] = F.ONE;   // 记录块列（永不入基）
    row[artBase + i] = F.ONE;   // 人工变量
    row[rhsCol] = r.b;
    return row;
  });

  let basis = rows.map((r, i) =>
    (r.hasSlack && r.slackCoef.eq(F.ONE)) ? colSlackBase + slackOf[i] : artBase + i
  );

  let zr = [];
  let zVal = F.ZERO;
  let iterations = 0;

  function computeReduced(costVec) {
    zr = new Array(rhsCol).fill(F.ZERO);
    zVal = F.ZERO;
    for (let k = 0; k < T.length; k++) {
      const cb = costVec[basis[k]];
      if (cb.isZero()) continue;
      const rowK = T[k];
      for (let j = 0; j < rhsCol; j++) if (!rowK[j].isZero()) zr[j] = zr[j].sub(cb.mul(rowK[j]));
      zVal = zVal.add(cb.mul(rowK[rhsCol]));
    }
    for (let j = 0; j < rhsCol; j++) if (!costVec[j].isZero()) zr[j] = zr[j].add(costVec[j]);
  }

  function pivot(r, j) {
    const p = T[r][j];
    if (p.isZero()) throw new Error('pivot on zero');
    if (!p.eq(F.ONE)) {
      const rowR = T[r];
      for (let t = 0; t <= rhsCol; t++) if (!rowR[t].isZero()) rowR[t] = rowR[t].div(p);
    }
    const rowR = T[r];
    for (let i = 0; i < T.length; i++) {
      if (i === r) continue;
      const f = T[i][j];
      if (f.isZero()) continue;
      const rowI = T[i];
      for (let t = 0; t <= rhsCol; t++) if (!rowR[t].isZero()) rowI[t] = rowI[t].sub(f.mul(rowR[t]));
    }
    const fz = zr[j];
    if (!fz.isZero()) {
      for (let t = 0; t < rhsCol; t++) if (!rowR[t].isZero()) zr[t] = zr[t].sub(fz.mul(rowR[t]));
      zVal = zVal.add(fz.mul(rowR[rhsCol])); // Δz = 检验数 × 入基变量新值
    }
    basis[r] = j;
  }

  /** 一轮单纯形；allowed(col) 判定可入基列。返回 'optimal' | 'unbounded' */
  function simplexLoop(costVec, allowed) {
    computeReduced(costVec);
    for (;;) {
      let enter = -1;
      for (let j = 0; j < rhsCol; j++) if (allowed(j) && zr[j].isNeg()) { enter = j; break; } // Bland：最小下标
      if (enter < 0) return 'optimal';
      let leave = -1; let bestRatio = null;
      for (let i = 0; i < T.length; i++) {
        const aij = T[i][enter];
        if (aij.isPos()) {
          const ratio = T[i][rhsCol].div(aij);
          const better = bestRatio === null || ratio.lt(bestRatio)
            || (ratio.eq(bestRatio) && basis[i] < basis[leave]); // Bland：平手取基变量下标小者
          if (better) { bestRatio = ratio; leave = i; }
        }
      }
      if (leave < 0) return 'unbounded';
      pivot(leave, enter);
      iterations++;
      if (iterations > 100000) throw new Error('iteration limit');
    }
  }

  // —— 阶段一：min Σ人工 ——
  const phase1Cost = new Array(rhsCol).fill(F.ZERO);
  for (let i = 0; i < m; i++) phase1Cost[artBase + i] = F.ONE;
  simplexLoop(phase1Cost, (j) => j < recBase || j >= artBase); // 结构＋松弛＋人工可入基，记录块永不入基
  if (zVal.isPos()) return { status: 'infeasible', x: null, obj: null, duals: null, binding: null, iterations };

  // —— 清理仍居基的人工变量（退化 0 值）：找非人工非零列旋转；全零行＝冗余，删除 ——
  const dropped = new Set();
  for (let k = 0; k < T.length; k++) {
    if (basis[k] < artBase) continue;
    let j = -1;
    for (let t = 0; t < artBase; t++) if (!T[k][t].isZero()) { j = t; break; }
    if (j >= 0) pivot(k, j);
    else dropped.add(k);
  }
  if (dropped.size) {
    T = T.filter((_, i) => !dropped.has(i));
    basis = basis.filter((_, i) => !dropped.has(i));
  }

  // —— 阶段二：删人工列（人工此时全部非基），恢复原始目标 ——
  T = T.map((row) => row.slice(0, artBase).concat([row[rhsCol]]));
  rhsCol = artBase; // 闭包按绑定读取，自动生效
  const phase2Cost = new Array(rhsCol).fill(F.ZERO);
  for (let j = 0; j < n; j++) phase2Cost[j] = c[j];
  const status2 = simplexLoop(phase2Cost, (j) => j < recBase); // 只允许结构＋松弛入基
  if (status2 === 'unbounded') return { status: 'unbounded', x: null, obj: null, duals: null, binding: null, iterations };

  // —— 读出 ——
  const x = new Array(n).fill(F.ZERO);
  for (let k = 0; k < T.length; k++) if (basis[k] < n) x[basis[k]] = T[k][rhsCol];
  let obj = F.ZERO;
  for (let j = 0; j < n; j++) if (!x[j].isZero()) obj = obj.add(c[j].mul(x[j]));

  // 对偶：y_std[i] = Σ_k c2[basis[k]]·T[k][recBase+i]；对原始 b 的灵敏度 = ×mult
  const duals = new Array(m).fill(F.ZERO);
  for (let i = 0; i < m; i++) {
    if (dropped.has(i)) continue; // 冗余行对偶记 0
    let y = F.ZERO;
    for (let k = 0; k < T.length; k++) {
      const cb = phase2Cost[basis[k]];
      if (!cb.isZero() && !T[k][recBase + i].isZero()) y = y.add(cb.mul(T[k][recBase + i]));
    }
    duals[i] = y.mul(new F(rows[i].mult));
  }

  // 约束是否贴线（按原始方向精确判定）
  const binding = problem.constraints.map((con, i) => {
    const r = rows[i];
    let lhs = F.ZERO;
    for (let j = 0; j < n; j++) if (!r.aOrig[j].isZero() && !x[j].isZero()) lhs = lhs.add(r.aOrig[j].mul(x[j]));
    return lhs.eq(r.bOrig);
  });

  return { status: 'optimal', x, obj, duals, binding, iterations };
}

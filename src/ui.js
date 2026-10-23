// ui.js — 页面渲染与交互（零框架；全部数字来自 src/ 精确求解，非硬编码）
// v0.2：原料盘/数据档/病种/1+6 开关；武器面板——对偶报告、价格临界点、钠参数化曲线、质量前沿

import { F } from './fraction.js';
import {
  solveG1, g1Ladder, g1SodiumSegments,
  solveG2, g2AllScenarios, g2QualityFrontier, priceBreakpoints,
} from './models.js';
import { DICT } from './i18n.js';

const G1_DEFAULT = { palette: 'classic', ncap: 2608, kclPrice: 10, kclSaltiness: 0.75, disease: 'standard', onex6: 'off' };
const state = {
  lang: 'zh', tab: 'g1',
  g1: { ...G1_DEFAULT },
  g2: { profile: 'v01_typical', scenario: 's3', prices: {} },
};
let G1DATA = null, G2DATA = null;

const $ = (id) => document.getElementById(id);
const t = (k) => DICT[state.lang][k] ?? k;
const nm = (v) => v.name[state.lang];
const fixed = (f, p = 4) => (f == null ? '—' : f.toDecimal(p).toFixed(p));
const gram = (f, p = 2) => (f == null ? '—' : String(f.toDecimal(p).toFixed(p)).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''));
const inf = (f, p = 2) => (f == null ? '∞' : gram(f, p));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function applyI18n() {
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  document.body.dataset.lang = state.lang;
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
  $('langbtn').textContent = state.lang === 'zh' ? 'EN' : '中文';
}

// ———————————————— 共享：约束名、对偶报告、价格临界点 ————————————————

function g1Vars() { return G1DATA.palettes[state.g1.palette].keys.map((k) => G1DATA.variables.find((v) => v.key === k)); }
function g2Vars() { return G2DATA.data_profiles[state.g2.profile].keys.map((k) => G2DATA.variables.find((v) => v.key === k)); }

function g1ConstraintName(name) {
  const byKey = Object.fromEntries(G1DATA.variables.map((v) => [v.key, v]));
  if (name.startsWith('cap_')) return `${nm(byKey[name.slice(4)])} ≤`;
  if (name.startsWith('floor_')) return `${nm(byKey[name.slice(6)])} ≥`;
  if (name.startsWith('n6_')) { const p = G1DATA.schema_1plus6.placeholders.find((x) => x.key === name.slice(3)); return `1+6 · ${nm(p)}`; }
  return t(`c.g1.${name}`);
}
function g2ConstraintName(name) {
  const byKey = Object.fromEntries(G2DATA.variables.map((v) => [v.key, v]));
  if (name.startsWith('aa_')) return G2DATA.aa_names[name.slice(3)][state.lang];
  if (name.startsWith('cap_')) return `${nm(byKey[name.slice(4)])} ≤`;
  if (name.startsWith('off_')) return `${nm(byKey[name.slice(4)])} = 0`;
  return t(`c.g2.${name}`);
}

/** 对偶报告：每行 LHS/RHS、贴线/松弛、影子价格（¥/吨 每单位 RHS）、基不变区间 */
function renderDualReport(elId, r, labelFn) {
  if (!r || r.status !== 'optimal') { $(elId).innerHTML = `<p class="note">${t('u.infeasible')}</p>`; return; }
  const toTon = F.from(10000);
  const sense = { le: '≤', ge: '≥', eq: '=' };
  const rows = r.problem.constraints.map((c, i) => {
    let lhs = F.ZERO;
    c.coeffs.forEach((cf, j) => { const f = F.from(cf); if (!f.isZero() && !r.x[j].isZero()) lhs = lhs.add(f.mul(r.x[j])); });
    const rhs = F.from(c.rhs);
    const bind = r.binding[i];
    const slack = rhs.sub(lhs).abs();
    const dual = r.duals[i];
    const rg = r.rhsRange[i];
    const dualTon = dual.mul(toTon);
    const dualCls = dual.isZero() ? '' : (dual.isNeg() ? 'zero' : 'pos');
    return `<tr>
      <td>${esc(labelFn(c.name))} <span class="mono" style="color:var(--mut)">${sense[c.sense]}</span></td>
      <td class="num">${gram(lhs, 2)}</td><td class="num">${gram(rhs, 2)}</td>
      <td>${bind ? `<span class="tag ok">${t('dr.binding')}</span>` : `<span class="tag">${t('dr.slack')} ${gram(slack, 2)}</span>`}</td>
      <td class="num ${dualCls}">${dual.isZero() ? '0' : fixed(dualTon, 3)}</td>
      <td class="num" style="color:var(--mut)">[${inf(rg.lo, 1)}, ${inf(rg.hi, 1)}]</td></tr>`;
  }).join('');
  const alt = r.alternateOptima ? `<p class="note" style="color:var(--amber)">${t('dr.alt')}</p>` : '';
  $(elId).innerHTML = `<table><tr><th>${t('dr.constraint')}</th><th class="num">${t('dr.lhs')}</th><th class="num">${t('dr.rhs')}</th><th>${t('dr.status')}</th><th class="num">${t('u.perton')}/unit</th><th class="num">${t('dr.range')}</th></tr>${rows}</table>${alt}<p class="note">${t('dr.note')}</p>`;
}

/** 价格临界点：priceRange 精确区间 ＋ ±ε 复解探针 */
function renderBreakpoints(elId, r, vars, currentPriceOf, solveAt) {
  if (!r || r.status !== 'optimal') { $(elId).innerHTML = `<p class="note">${t('u.infeasible')}</p>`; return; }
  const kg = (f) => (f == null ? null : f.mul(1000));
  const meta = vars.map((v, j) => ({
    key: v.key, currentPrice: currentPriceOf(v.key), used: !r.x[j].isZero(),
    priceRange: { lo: kg(r.priceRange[j].lo), hi: kg(r.priceRange[j].hi) }, baseRecipe: r.recipe,
  }));
  const bps = priceBreakpoints(meta, solveAt);
  const rows = bps.map((b) => {
    const v = vars.find((x) => x.key === b.key);
    let verdict = '';
    if (b.used) {
      if (b.hi == null) verdict = `<span class="tag">${t('bp.unbounded')}</span>`;
      else {
        const p = b.probes.find((x) => x.side === 'up');
        const tag = p.above.status !== 'optimal' ? `<span class="tag warn">${t('bp.infeasible')}</span>`
          : p.changed ? `<span class="tag ok">${t('bp.changed')}</span>` : `<span class="tag">${t('bp.degenerate')}</span>`;
        verdict = `${t('bp.up')} <b class="mono">¥${gram(b.hi, 2)}</b> ${t('bp.switch')} ${tag}`;
      }
    } else {
      if (b.lo == null) verdict = '—';
      else {
        const p = b.probes.find((x) => x.side === 'down');
        const tag = p.below.status !== 'optimal' ? `<span class="tag warn">${t('bp.infeasible')}</span>`
          : p.changed ? `<span class="tag ok">${t('bp.changed')}</span>` : `<span class="tag">${t('bp.degenerate')}</span>`;
        verdict = `${t('bp.down')} <b class="mono">¥${gram(b.lo, 2)}</b> ${t('bp.enter')} ${tag}`;
      }
    }
    return `<tr><td>${esc(nm(v))}</td><td class="num">${gram(b.current, 2)}</td>
      <td>${b.used ? `<span class="tag ok">${t('bp.used')}</span>` : `<span class="tag">${t('bp.unused')}</span>`}</td><td>${verdict}</td></tr>`;
  }).join('');
  $(elId).innerHTML = `<table><tr><th>${t('bp.var')}</th><th class="num">${t('bp.price')}</th><th>${t('bp.status')}</th><th></th></tr>${rows}</table><p class="note">${t('bp.note')}</p>`;
}

// ———————————————— G1 ————————————————

function g1Opts(extra = {}) {
  return { palette: state.g1.palette, ncap: String(state.g1.ncap), kclPrice: state.g1.kclPrice, kclSaltiness: state.g1.kclSaltiness, disease: state.g1.disease, onex6: state.g1.onex6, ...extra };
}

function syncG1Controls() {
  const sens = G1DATA.sensitivity.ncap_mg;
  const min = Number(state.g1.palette === 'classic' ? sens.classic_min : sens.min);
  const sl = $('in-ncap');
  sl.min = min; sl.max = sens.max; sl.step = sens.step;
  if (state.g1.ncap < min) state.g1.ncap = min;
  sl.value = state.g1.ncap;
  const dm = G1DATA.disease_modes.find((d) => d.key === state.g1.disease);
  const locked = dm && dm.sodium_cap;
  sl.disabled = !!locked;
  $('v-ncap').textContent = locked ? `${dm.sodium_cap} mg（${t('g1.ncap.locked')}）` : `${state.g1.ncap} mg`;
  $('v-kclp').textContent = `¥${state.g1.kclPrice}`;
  $('v-kcls').textContent = String(state.g1.kclSaltiness);
  $('in-palette').innerHTML = Object.entries(G1DATA.palettes).map(([k, p]) => `<option value="${k}" ${k === state.g1.palette ? 'selected' : ''}>${esc(nm(p))}</option>`).join('');
  $('in-disease').innerHTML = G1DATA.disease_modes.map((d) => `<option value="${d.key}" ${d.key === state.g1.disease ? 'selected' : ''}>${esc(nm(d))}</option>`).join('');
  $('in-onex6').innerHTML = `<option value="off" ${state.g1.onex6 === 'off' ? 'selected' : ''}>${t('g1.onex6.off')}</option>`
    + Object.entries(G1DATA.schema_1plus6.presets).map(([k, p]) => `<option value="${k}" ${k === state.g1.onex6 ? 'selected' : ''}>${esc(nm(p))}</option>`).join('');
}

function renderG1() {
  syncG1Controls();
  const vars = g1Vars();
  const r = solveG1(G1DATA, g1Opts());
  const ok = r.status === 'optimal';
  const dm = G1DATA.disease_modes.find((d) => d.key === state.g1.disease);

  $('g1-infeasible').style.display = ok ? 'none' : '';
  ['g1-recipe', 'g1-c100'].forEach((id) => { $(id).closest('.card').style.display = ok ? '' : 'none'; });
  $('g1-dual-card').style.display = ok && r.lpBaseline4716 ? '' : 'none';

  if (!ok) {
    let body;
    if (dm && dm.key !== 'standard') body = dm.note[state.lang];
    else if (state.g1.onex6 !== 'off') body = G1DATA.schema_1plus6.presets[state.g1.onex6].note[state.lang];
    else body = t('g1.infeasible.body');
    if (dm && dm.potassium_cap) {
      const abl = solveG1(G1DATA, g1Opts({ disease: 'hypertension' }));
      if (abl.status === 'optimal') body += ` ${t('g1.ablation')} ¥${fixed(abl.costPer100g)}/100g.`;
    }
    $('g1-infeasible-body').textContent = body;
  } else {
    const rows = vars.map((v) => {
      const g = gram(r.recipe[v.key]);
      const pv = v.provenance || {};
      const provLine = Object.entries(pv).map(([field, p]) =>
        `<div><b>${field}</b> · ${esc(p.source)}${p.date ? ` · ${p.date}` : ''}${p.to_calibrate ? ` · <span class="tag warn">${t('u.tocal')}</span>` : ''}</div>`).join('');
      const zero = r.recipe[v.key].isZero();
      return `<tr style="${zero ? 'color:var(--mut)' : ''}"><td>${esc(nm(v))}</td><td class="num">${g} g</td>
        <td class="num" style="color:var(--mut)">${fixed(F.from(v.key === 'kcl' ? state.g1.kclPrice : v.price_cny_per_kg), 1)}</td>
        <td class="prov">${provLine ? `<details><summary>${t('u.src')}</summary>${provLine}</details>` : ''}</td></tr>`;
    }).join('');
    $('g1-recipe').innerHTML = `<tr><th></th><th class="num">g/100g</th><th class="num">¥/kg</th><th></th></tr>${rows}`;
    const bindingNames = r.problem.constraints.filter((_, i) => r.binding[i]).map((c) => g1ConstraintName(c.name)).join(' · ');
    $('g1-binding').textContent = `${t('g1.binding')}：${bindingNames}　|　${t('u.solve')} · ${r.iterations} ${t('u.iter')}`;

    $('g1-c100').textContent = `¥${fixed(r.costPer100g)}`;
    $('g1-cton').textContent = `¥${fixed(r.costPerTon, 0)}`;
    $('g1-cpkt').textContent = `${fixed(r.costPerPacketLi, 2)} ${t('u.li')}`;
    const red = F.from(G1DATA.rhs.sodium_cap_max_mg);
    $('g1-na').textContent = `${fixed(r.sodium, 0)} mg/100g（−${fixed(red.sub(r.sodium).div(red).mul(100), 1)}%）`;
    const showK = state.g1.palette !== 'classic';
    $('g1-k-row').style.display = showK ? '' : 'none';
    if (showK) $('g1-k').textContent = `${fixed(r.potassium, 0)} mg/100g`;
    const iNa = r.problem.constraints.findIndex((c) => c.name === 'sodium');
    const rg = r.rhsRange[iNa];
    $('g1-shadow').textContent = `¥${fixed(r.shadowPer100mgPerTon, 1)}/${t('u.perton').replace('¥/', '').replace('CNY/', '')}·100mg`;
    $('g1-shadow-range').textContent = `${t('g1.shadow.range')} [${inf(rg.lo, 0)}, ${inf(rg.hi, 0)}] mg`;

    if (r.lpBaseline4716) {
      const ton = t('u.perton').replace('¥/', '').replace('CNY/', '');
      $('g1-dual-lp').textContent = `+¥${fixed(r.deltaVsLp, 0)}/${ton}`;
      $('g1-dual-lp-p').textContent = `+${fixed(r.deltaVsLpPerPacketLi, 1)} ${t('u.li')}`;
      $('g1-dual-pure').textContent = `+¥${fixed(r.deltaVsPure, 0)}/${ton}`;
      $('g1-dual-pure-p').textContent = `+${fixed(r.deltaVsPurePerPacketLi, 1)} ${t('u.li')}`;
    }
  }
  renderG1Ladder(r);
  renderG1Curve(r);
  renderDualReport('g1-dualreport', r, g1ConstraintName);
  renderBreakpoints('g1-breakpoints', r, vars,
    (key) => F.from(key === 'kcl' ? state.g1.kclPrice : G1DATA.variables.find((v) => v.key === key).price_cny_per_kg),
    (key, price) => (key === 'kcl' ? solveG1(G1DATA, g1Opts({ kclPrice: price })) : solveG1(G1DATA, g1Opts({ priceOverrides: { [key]: price } }))));
  renderOnex6(r);
  renderG1Prov();
}

function renderG1Ladder(current) {
  const classic = state.g1.palette === 'classic';
  const caps = (classic ? ['4716', '4100', '3500', '3000', '2608'] : ['4716', '4100', '3500', '3000', '2608', '2200', '1875', '1500']).map(Number);
  const cur = current.status === 'optimal' ? current.ncap.toNumber() : state.g1.ncap;
  if (!caps.includes(cur)) caps.push(cur);
  caps.sort((a, b) => b - a);
  const steps = g1Ladder(G1DATA, g1Opts({ disease: 'standard' }), caps.map(String));

  const W = 780, H = 252, base = 196, top = 34, maxNa = 4716, bw = Math.min(72, (W - 90) / steps.length - 24);
  const x0 = 52, gap = (W - 90 - bw * steps.length) / Math.max(1, steps.length - 1);
  const yOf = (na) => base - (na / maxNa) * (base - top);
  const ceilY = yOf(2608);

  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" style="width:100%;height:auto" aria-label="sodium ladder">`;
  s += `<line x1="40" y1="${base}" x2="${W - 20}" y2="${base}" stroke="var(--line)" stroke-width="1.5"/>`;
  s += `<line x1="40" y1="${ceilY}" x2="${W - 20}" y2="${ceilY}" stroke="var(--red)" stroke-width="1" stroke-dasharray="5 4" opacity=".75"/>`;
  s += `<text x="${W - 22}" y="${ceilY - 5}" text-anchor="end" class="ts" style="fill:var(--red)">2608 · KCl 8g</text>`;
  steps.forEach((st, i) => {
    const isCur = st.cap.toNumber() === cur;
    const x = x0 + i * (bw + gap);
    const y = yOf(st.sodium ? st.sodium.toNumber() : st.cap.toNumber());
    const h = base - y;
    const fill = isCur ? 'var(--acc2)' : 'color-mix(in srgb, var(--line) 70%, transparent)';
    const stroke = isCur ? 'var(--acc)' : 'var(--line)';
    s += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="4" fill="${fill}" stroke="${stroke}"> </rect>`;
    s += `<text x="${x + bw / 2}" y="${y - 16}" text-anchor="middle" class="tt" style="font-family:var(--mono)">${st.status === 'optimal' ? `¥${fixed(st.cost, 4)}` : t('u.infeasible')}</text>`;
    s += `<text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" class="ts">${st.status === 'optimal' && isCur ? t('g1.ladder.cur') : ''}</text>`;
    s += `<text x="${x + bw / 2}" y="${base + 16}" text-anchor="middle" class="tt">${gram(st.cap, 0)}</text>`;
    s += `<text x="${x + bw / 2}" y="${base + 30}" text-anchor="middle" class="ts">KCl ${st.recipe ? gram(st.recipe.kcl, 1) : '—'}g</text>`;
  });
  s += `<text x="24" y="${base + 4}" text-anchor="end" class="ts">0</text>`;
  s += `<text x="24" y="${top + 4}" text-anchor="end" class="ts">4716</text>`;
  s += `<text x="${W - 22}" y="${base + 30}" text-anchor="end" class="ts">mg Na/100g</text></svg>`;
  $('g1-ladder-svg').innerHTML = s;
}

/** 钠参数化曲线：段端点由 rhsRange 精确给出，折线＋拐点＋段内影子价格标注。
 *  曲线固定为标准病种口径；「当前解」标记仅在当前解同口径（标准模式）时绘制——
 *  病种模式下当前成本不落在这条曲线上，画上去即失真。 */
function renderG1Curve(current) {
  const segs = g1SodiumSegments(G1DATA, g1Opts({ disease: 'standard' }));
  if (!segs.length) {
    $('g1-curve-svg').innerHTML = `<p class="note">${t('g1.curve.none')}</p>`;
    $('g1-segments').innerHTML = '';
    return;
  }
  const pts = [];
  segs.forEach((sg) => {
    pts.push([sg.hi.toNumber(), sg.costAtHi.toNumber()]);
    if (sg.lo !== null && sg.costAtLo !== null) pts.push([sg.lo.toNumber(), sg.costAtLo.toNumber()]);
  });
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
  const W = 780, H = 270, L = 64, R = 24, T = 26, B = 44;
  const X = (v) => L + ((v - xmin) / Math.max(1e-9, xmax - xmin)) * (W - L - R);
  const Y = (v) => T + (1 - (v - ymin) / Math.max(1e-9, ymax - ymin)) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" style="width:100%;height:auto" aria-label="sodium parametric curve">`;
  s += `<line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="var(--line)"/><line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="var(--line)"/>`;
  s += `<polyline fill="none" stroke="var(--acc)" stroke-width="2.2" points="${pts.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}"/>`;
  segs.forEach((sg, i) => {
    const xm = (sg.hi.toNumber() + (sg.lo ? sg.lo.toNumber() : sg.hi.toNumber())) / 2;
    const ym = (sg.costAtHi.toNumber() + (sg.costAtLo ? sg.costAtLo.toNumber() : sg.costAtHi.toNumber())) / 2;
    s += `<text x="${X(xm)}" y="${Y(ym) - 10}" text-anchor="middle" class="ts" style="fill:var(--acc)">¥${fixed(sg.shadow, 1)}</text>`;
    if (sg.lo !== null) {
      const last = i === segs.length - 1;
      s += `<circle cx="${X(sg.lo.toNumber())}" cy="${Y(sg.costAtLo.toNumber())}" r="4" fill="${last ? 'var(--red)' : 'var(--card)'}" stroke="${last ? 'var(--red)' : 'var(--acc)'}" stroke-width="2"/>`;
      s += `<text x="${X(sg.lo.toNumber())}" y="${H - B + 16}" text-anchor="middle" class="ts" style="${last ? 'fill:var(--red)' : ''}">${gram(sg.lo, 0)}</text>`;
    }
  });
  s += `<text x="${X(xmax)}" y="${H - B + 16}" text-anchor="middle" class="ts">${gram(segs[0].hi, 0)}</text>`;
  if (current.status === 'optimal' && state.g1.disease === 'standard') {
    const cx = X(current.ncap.toNumber()), cy = Y(current.costPer100g.toNumber());
    s += `<line x1="${cx}" y1="${T}" x2="${cx}" y2="${H - B}" stroke="var(--acc)" stroke-dasharray="3 4" opacity=".6"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="5" fill="var(--acc)"/>`;
    s += `<text x="${cx + 8}" y="${cy - 8}" class="tt" style="font-family:var(--mono)">¥${fixed(current.costPer100g, 4)}</text>`;
  }
  s += `<text x="${L - 6}" y="${Y(ymax) + 4}" text-anchor="end" class="ts" style="font-family:var(--mono)">${ymax.toFixed(4)}</text>`;
  s += `<text x="${L - 6}" y="${Y(ymin) + 4}" text-anchor="end" class="ts" style="font-family:var(--mono)">${ymin.toFixed(4)}</text>`;
  s += `<text x="${W - R}" y="${H - 6}" text-anchor="end" class="ts">mg Na/100g</text><text x="${L}" y="${T - 10}" class="ts">¥/100g</text></svg>`;
  $('g1-curve-svg').innerHTML = s;

  const byKey = Object.fromEntries(G1DATA.variables.map((v) => [v.key, v]));
  const rows = segs.map((sg) => `<tr><td class="num">[${inf(sg.lo, 1)}, ${gram(sg.hi, 1)}]</td><td class="num">${fixed(sg.shadow, 2)}</td>
    <td class="num">${fixed(sg.costAtHi, 4)} → ${sg.costAtLo ? fixed(sg.costAtLo, 4) : '—'}</td>
    <td style="font-size:12.5px">${sg.activeKeys.map((k) => esc(nm(byKey[k]))).join('、')}</td></tr>`).join('');
  $('g1-segments').innerHTML = `<table><tr><th class="num">${t('g1.seg.range')}</th><th class="num">${t('g1.seg.shadow')}</th><th class="num">${t('g1.seg.cost')}</th><th>${t('g1.seg.active')}</th></tr>${rows}</table>`;
}

function renderOnex6(r) {
  const on = state.g1.onex6 !== 'off';
  const one = `<span class="tag ok">Na · ${t('u.verified')}</span>`;
  let six;
  if (on && r.status === 'optimal') {
    six = G1DATA.schema_1plus6.placeholders.map((p) => {
      const i = r.problem.constraints.findIndex((c) => c.name === `n6_${p.key}`);
      let lhs = F.ZERO;
      r.problem.constraints[i].coeffs.forEach((cf, j) => { const f = F.from(cf); if (!f.isZero() && !r.x[j].isZero()) lhs = lhs.add(f.mul(r.x[j])); });
      return `<span class="tag ${r.binding[i] ? 'ok' : ''}">${esc(nm(p))} ${gram(lhs, 1)}/${gram(F.from(r.problem.constraints[i].rhs), 1)} ${p.unit.split('/')[0]}</span>`;
    }).join(' ');
  } else {
    six = G1DATA.schema_1plus6.placeholders.map((p) => `<span class="tag">${esc(nm(p))} · <span class="tag warn">${t('u.littyp')}</span></span>`).join(' ');
  }
  $('onex6-list').innerHTML = one + six;
  $('onex6-note').textContent = on ? t('g1.onex6.note.on') : t('g1.onex6.note.off');
}

function renderG1Prov() {
  const rows = [];
  for (const v of g1Vars()) {
    for (const [field, p] of Object.entries(v.provenance || {})) {
      rows.push(`<tr><td>${esc(nm(v))} · ${field}</td><td>${esc(p.source)}</td><td class="num">${p.date || ''}</td>
        <td>${p.to_calibrate ? `<span class="tag warn">${t('u.tocal')}</span>` : ''}</td></tr>`);
    }
    if (v.n6 && v.n6.provenance) rows.push(`<tr><td>${esc(nm(v))} · 1+6</td><td>${esc(v.n6.provenance.source)}</td><td class="num">${v.n6.provenance.date || ''}</td><td>${v.n6.provenance.to_calibrate ? `<span class="tag warn">${t('u.tocal')}</span>` : ''}</td></tr>`);
  }
  for (const [k, p] of Object.entries(G1DATA.rhs_provenance || {})) {
    rows.push(`<tr><td>rhs · ${k}</td><td>${esc(p.source)}</td><td class="num"></td><td>${p.to_calibrate ? `<span class="tag warn">${t('u.tocal')}</span>` : ''}</td></tr>`);
  }
  for (const d of G1DATA.disease_modes) {
    if (d.provenance) rows.push(`<tr><td>${esc(nm(d))}</td><td>${esc(d.provenance.source)}</td><td class="num">${d.provenance.date || ''}</td><td>${d.provenance.to_calibrate ? `<span class="tag warn">${t('u.tocal')}</span>` : ''}</td></tr>`);
  }
  $('g1-prov').innerHTML = `<table><tr><th></th><th>${t('u.src')}</th><th class="num">${t('u.date')}</th><th></th></tr>${rows.join('')}</table>`;
}

// ———————————————— G2 ————————————————

function g2Opts(extra = {}) { return { scenario: state.g2.scenario, profile: state.g2.profile, priceOverrides: state.g2.prices, ...extra }; }

// G2 两段式渲染：配方/成本/对偶报告同步画（~40ms）；临界点＋质量前沿（v02 约 0.6s）
// 延后一拍再算——期间显示「计算中」占位，页面先可读。token 作废过期的补算，最新一次总会补全。
let g2RenderToken = 0;

function renderG2() {
  const token = ++g2RenderToken;
  const vars = g2Vars();
  const prices = state.g2.prices;
  const all = g2AllScenarios(G2DATA, prices, state.g2.profile);
  const r = all.scenarios[state.g2.scenario];
  const ok = r.status === 'optimal';

  // 数据档
  $('g2-profile').innerHTML = Object.entries(G2DATA.data_profiles).filter(([k]) => k !== 'default').map(([k, p]) =>
    `<button class="small ${k === state.g2.profile ? 'act' : ''}" data-profile="${k}">${esc(nm(p))}</button>`).join('');
  document.querySelectorAll('#g2-profile button').forEach((b) =>
    b.addEventListener('click', () => { state.g2.profile = b.dataset.profile; state.g2.prices = {}; renderG2(); }));
  $('g2-profile-note').textContent = G2DATA.data_profiles[state.g2.profile].note[state.lang];

  // 情景按钮（带各自成本）
  $('g2-scenarios').innerHTML = G2DATA.scenarios.map((sc) => {
    const s = all.scenarios[sc.key];
    const cost = s.status === 'optimal' ? `¥${fixed(s.costPer100g)}` : t('u.infeasible');
    return `<button class="small ${sc.key === state.g2.scenario ? 'act' : ''}" data-sc="${sc.key}">
      ${esc(sc.name[state.lang])}<span class="mono" style="color:var(--mut);margin-left:6px">${cost}</span></button>`;
  }).join('');
  document.querySelectorAll('#g2-scenarios button').forEach((b) =>
    b.addEventListener('click', () => { state.g2.scenario = b.dataset.sc; renderG2(); }));

  // 价格输入
  $('g2-prices').innerHTML = vars.map((v) => {
    const val = prices[v.key] ?? v.price_cny_per_kg;
    const pv = v.provenance && v.provenance.price;
    return `<div style="display:flex;gap:8px;align-items:center;margin:4px 0">
      <span style="flex:1;font-size:13px">${esc(nm(v))}</span>
      <input type="number" step="0.1" min="0" value="${val}" data-price="${v.key}"
        style="width:84px;padding:3px 6px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);font-family:var(--mono)">
      ${pv ? `<details class="prov pop"><summary></summary><div>${esc(pv.source)} · ${pv.date || ''}${pv.to_calibrate ? ` · ${t('u.tocal')}` : ''}</div></details>` : ''}
    </div>`;
  }).join('');
  document.querySelectorAll('#g2-prices input').forEach((inp) =>
    inp.addEventListener('change', () => { state.g2.prices[inp.dataset.price] = inp.value; renderG2(); }));

  // 预设（仅显示本档全部原料可覆盖的预设）
  const keys = new Set(vars.map((v) => v.key));
  $('g2-presets').innerHTML = G2DATA.sensitivity_presets.filter((p) => Object.keys(p.overrides).every((k) => keys.has(k))).map((p) =>
    `<button class="small" data-preset="${p.key}" title="${esc(p.note[state.lang])}">${esc(p.label[state.lang])}</button>`).join('')
    + `<button class="small" data-preset="__reset">${t('g2.preset.reset')}</button>`;
  document.querySelectorAll('#g2-presets button').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.preset === '__reset') state.g2.prices = {};
    else { const p = G2DATA.sensitivity_presets.find((x) => x.key === b.dataset.preset); state.g2.prices = { ...p.overrides }; }
    renderG2();
  }));

  $('g2-infeasible').style.display = ok ? 'none' : '';
  ['g2-recipe', 'g2-c100', 'g2-aa'].forEach((id) => { $(id).closest('.card').style.display = ok ? '' : 'none'; });
  if (ok) {
    const rows = vars.map((v) => `<tr style="${r.recipe[v.key].isZero() ? 'color:var(--mut)' : ''}">
      <td>${esc(nm(v))}${v.is_crystal ? ` <span class="tag">${t('u.crystal')}</span>` : ''}</td>
      <td class="num">${gram(r.recipe[v.key])} g</td>
      <td class="num" style="color:var(--mut)">${fixed(F.from(prices[v.key] ?? v.price_cny_per_kg), 1)}</td></tr>`).join('');
    $('g2-recipe').innerHTML = `<tr><th></th><th class="num">g/100g</th><th class="num">¥/kg</th></tr>${rows}`;
    $('g2-alt').style.display = r.alternateOptima ? '' : 'none';
    $('g2-alt').textContent = r.alternateOptima ? `⚠ ${t('g2.alt')}` : '';

    $('g2-c100').textContent = `¥${fixed(r.costPer100g)}`;
    $('g2-ckg').textContent = `¥${fixed(r.costPerKgProduct, 2)}`;
    $('g2-cprot').textContent = `¥${fixed(r.costPerKgProtein, 2)}`;
    $('g2-prot').textContent = `${fixed(r.protein, 1)} g`;
    $('g2-cry').textContent = `${fixed(r.crystalMass, 3)} g`;

    // 氨基酸评分
    const hasAA = Object.keys(r.scores || {}).length > 0;
    if (hasAA) {
      const ratios = Object.values(r.scores).map((s) => s.ratio);
      const minR = ratios.reduce((a, b) => (b.lt(a) ? b : a));
      const rows2 = G2DATA.aa_order.map((aa) => {
        const s = r.scores[aa];
        const isBind = s.ratio.eq(F.ONE);
        const isMin = s.ratio.eq(minR);
        const w = Math.min(s.ratio.toNumber() / 1.6, 1) * 100;
        return `<tr><td>${G2DATA.aa_names[aa][state.lang]}${isMin ? ` <span class="tag warn">${t('g2.aa.lim')}</span>` : ''}</td>
          <td class="num">${gram(s.supply, 0)}</td><td class="num">${gram(s.demand, 0)}</td>
          <td class="num">${fixed(s.ratio, 3)}${isBind ? ` · ${t('g2.aa.bind')}` : ''}</td>
          <td><div class="bar"><i class="${isBind ? 'warn' : ''}" style="width:${w}%"></i></div></td></tr>`;
      }).join('');
      $('g2-aa').innerHTML = `<tr><th></th><th class="num">mg ${t('u.supply')}</th><th class="num">mg ${t('u.demand')}</th><th class="num">AAS</th><th style="width:120px"></th></tr>${rows2}`;
      $('g2-aa-note').textContent = state.g2.profile === 'v02_usda' ? t('g2.aa.v02note') : '';
    } else {
      $('g2-aa').innerHTML = `<tr><td style="color:var(--mut)">${t('g2.frontier.none')}</td></tr>`;
      $('g2-aa-note').textContent = '';
    }
  }

  // 差价面板（情景对子不可行时显示 —）
  const ton = t('u.perton').replace('¥/', '').replace('CNY/', '');
  const li = (d) => (d == null ? '—' : d.isZero() ? (state.lang === 'zh' ? '0（免费）' : '0 (free)') : `+${fixed(d.mul(F.from(1000)), 2)} ${state.lang === 'zh' ? '厘/100g' : 'li/100g'}`);
  $('g2-d-free').textContent = li(all.diffs.preschool_free);
  $('g2-d-diaas').textContent = all.diffs.diaas_upgrade == null ? '—' : `${li(all.diffs.diaas_upgrade)} ≈ ¥${fixed(all.perTon.diaas_upgrade, 0)}/${ton}`;
  $('g2-d-sens').textContent = all.diffs.sensory_dispersion == null ? '—' : `${li(all.diffs.sensory_dispersion)} ≈ ¥${fixed(all.perTon.sensory_dispersion, 0)}/${ton}`;

  renderDualReport('g2-dualreport', r, g2ConstraintName);
  renderG2Prov();

  // —— 重面板（临界点 ~0.17s、前沿 ~0.4s，v02 档）让出主线程，先让首屏可读 ——
  $('g2-breakpoints').innerHTML = `<p class="note">${t('u.computing')}</p>`;
  $('g2-frontier-svg').innerHTML = `<p class="note">${t('u.computing')}</p>`;
  $('g2-lmax').textContent = '';
  setTimeout(() => {
    if (token !== g2RenderToken) return; // 已被更新一次渲染取代
    renderBreakpoints('g2-breakpoints', r, vars,
      (key) => F.from(prices[key] ?? G2DATA.variables.find((v) => v.key === key).price_cny_per_kg),
      (key, price) => solveG2(G2DATA, g2Opts({ priceOverrides: { ...prices, [key]: price }, lpOpts: { light: true } })));
    setTimeout(() => { if (token === g2RenderToken) renderG2Frontier(r); }, 0);
  }, 0);
}

function renderG2Frontier(r) {
  const sc = G2DATA.scenarios.find((s) => s.key === state.g2.scenario);
  if (!sc.pattern || r.status !== 'optimal') { $('g2-frontier-svg').innerHTML = `<p class="note">${sc.pattern ? t('u.infeasible') : t('g2.frontier.none')}</p>`; $('g2-lmax').textContent = ''; return; }
  const fr = frontierCached();
  const pts = fr.points.filter((p) => p.status === 'optimal').map((p) => [p.lambda.toNumber(), p.cost.toNumber()]);
  if (pts.length < 2) { $('g2-frontier-svg').innerHTML = `<p class="note">${t('u.infeasible')}</p>`; return; }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
  const W = 780, H = 230, L = 64, R = 24, T = 22, B = 40;
  const X = (v) => L + ((v - xmin) / Math.max(1e-9, xmax - xmin)) * (W - L - R);
  const Y = (v) => T + (1 - (v - ymin) / Math.max(1e-9, ymax - ymin)) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" style="width:100%;height:auto" aria-label="quality frontier">`;
  s += `<line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="var(--line)"/><line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="var(--line)"/>`;
  s += `<polyline fill="none" stroke="var(--acc)" stroke-width="2.2" points="${pts.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}"/>`;
  pts.forEach((p) => { s += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3.5" fill="var(--card)" stroke="var(--acc)" stroke-width="2"/>`; });
  pts.forEach((p, i) => { if (i === 0 || i === pts.length - 1) s += `<text x="${X(p[0])}" y="${Y(p[1]) - 10}" text-anchor="middle" class="ts" style="font-family:var(--mono)">¥${p[1].toFixed(4)}</text>`; });
  s += `<text x="${X(xmin)}" y="${H - B + 16}" text-anchor="middle" class="ts">λ=1.00</text>`;
  s += `<text x="${X(xmax)}" y="${H - B + 16}" text-anchor="middle" class="ts" style="fill:var(--red)">λ=${xmax.toFixed(3)}</text>`;
  s += `<text x="${W - R}" y="${H - 6}" text-anchor="end" class="ts">λ (min AAS floor)</text><text x="${L}" y="${T - 8}" class="ts">¥/100g</text></svg>`;
  $('g2-frontier-svg').innerHTML = s;
  $('g2-lmax').textContent = fr.lambdaMax ? `${t('g2.frontier.lmax')} ≈ ${fixed(fr.lambdaMax, 4)}` : `${t('g2.frontier.lmax')} ≥ 2`;
}

function renderG2Prov() {
  const rows = [];
  const v02 = state.g2.profile === 'v02_usda';
  for (const v of g2Vars()) {
    const pv = v.provenance && v.provenance.price;
    if (pv) rows.push(`<tr><td>${esc(nm(v))} · price</td><td>${esc(pv.source)}</td><td class="num">${pv.date || ''}</td>
      <td>${pv.to_calibrate ? `<span class="tag warn">${t('u.tocal')}</span>` : ''}</td></tr>`);
    if (v02 && v.aa_usda) rows.push(`<tr><td>${esc(nm(v))} · AA</td><td>USDA FDC ${v.aa_usda.fdc_id} (NDB ${v.aa_usda.ndb}) · ${esc(v.aa_usda.description)} · ${esc(v.aa_usda.derived)}</td><td class="num">${v.aa_usda.retrieved}</td><td><span class="tag ok">FDC</span></td></tr>`);
    else if (v.provenance && v.provenance.aa) rows.push(`<tr><td>${esc(nm(v))} · AA</td><td>${esc(v.provenance.aa.source)}</td><td class="num">${v.provenance.aa.date || ''}</td><td><span class="tag warn">${t('u.tocal')}</span></td></tr>`);
    if (v02 && v.digestibility) rows.push(`<tr><td>${esc(nm(v))} · dig</td><td>${v.digestibility.value} — ${esc(v.digestibility.source)}</td><td class="num">${v.digestibility.date || ''}</td><td><span class="tag warn">${t('u.tocal')}</span></td></tr>`);
  }
  const patKeys = v02 ? ['ocaa_2013', 'child_2013'] : ['adult', 'preschool'];
  for (const k of patKeys) {
    const p = G2DATA.patterns[k];
    rows.push(`<tr><td>${esc(nm(p))}</td><td>${esc(p.provenance.source)}</td><td class="num">${p.provenance.date || ''}</td><td>${p.provenance.to_calibrate ? `<span class="tag warn">${t('u.tocal')}</span>` : `<span class="tag ok">${t('u.verified')}</span>`}</td></tr>`);
  }
  rows.push(`<tr><td>DIAAS</td><td>${esc(G2DATA.diaas.note[state.lang])}</td><td class="num"></td><td><span class="tag warn">${t('u.tocal')}</span></td></tr>`);
  $('g2-prov').innerHTML = `<table><tr><th></th><th>${t('u.src')}</th><th class="num">${t('u.date')}</th><th></th></tr>${rows.join('')}</table>`;
}

// ———————————————— 全局 ————————————————

function bindEvents() {
  $('langbtn').addEventListener('click', () => {
    state.lang = state.lang === 'zh' ? 'en' : 'zh';
    applyI18n();
    renderTab(state.tab);                                  // 只重渲当前 tab
    renderedTabs[state.tab === 'g1' ? 'g2' : 'g1'] = false; // 隐藏 tab 标脏，激活时再渲染
  });
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => {
    state.tab = b.dataset.tab;
    document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('act', x === b));
    document.querySelectorAll('section').forEach((s) => s.classList.toggle('act', s.id === `sec-${state.tab}`));
    if (!renderedTabs[state.tab]) renderTab(state.tab);
  }));
  $('in-ncap').addEventListener('input', (e) => { state.g1.ncap = Number(e.target.value); scheduleRender(renderG1); });
  $('in-kclp').addEventListener('input', (e) => { state.g1.kclPrice = Number(e.target.value); scheduleRender(renderG1); });
  $('in-kcls').addEventListener('input', (e) => { state.g1.kclSaltiness = Number(e.target.value); scheduleRender(renderG1); });
  $('in-palette').addEventListener('change', (e) => { state.g1.palette = e.target.value; renderG1(); });
  $('in-disease').addEventListener('change', (e) => { state.g1.disease = e.target.value; renderG1(); });
  $('in-onex6').addEventListener('change', (e) => { state.g1.onex6 = e.target.value; renderG1(); });
  $('g1-reset').addEventListener('click', () => {
    state.g1 = { ...G1_DEFAULT };
    $('in-kclp').value = G1_DEFAULT.kclPrice; $('in-kcls').value = G1_DEFAULT.kclSaltiness;
    renderG1();
  });
}

// ———————————————— 渲染调度：懒渲染＋节流 ————————————————

// 只渲染当前 tab；隐藏 tab 首次激活或语言切换失配时才渲染（G2 v02 全套约 0.7s，不该在页面加载时白付）
const renderedTabs = { g1: false, g2: false };
function renderTab(tab) { if (tab === 'g1') renderG1(); else renderG2(); renderedTabs[tab] = true; }
function renderAll() { renderTab(state.tab); }

// rAF 合帧：滑杆 input 高频触发时每帧至多渲染一次（重面板不排队积压）
const pending = new Set();
function scheduleRender(fn) {
  pending.add(fn);
  if (pending.size > 1) return;
  requestAnimationFrame(() => { const fns = [...pending]; pending.clear(); fns.forEach((f) => f()); });
}

// 质量前沿 size-1 记忆化：仅随 情景×数据档×价格 变化，语言切换/重渲染直接复用
let frontierMemo = null;
function frontierCached() {
  const key = `${state.g2.scenario}|${state.g2.profile}|${JSON.stringify(state.g2.prices)}`;
  if (frontierMemo && frontierMemo.key === key) return frontierMemo.value;
  const value = g2QualityFrontier(G2DATA, g2Opts(), 8);
  frontierMemo = { key, value };
  return value;
}

async function init() {
  try {
    [G1DATA, G2DATA] = await Promise.all([
      fetch('data/g1-seasoning.json').then((r) => r.json()),
      fetch('data/g2-protein.json').then((r) => r.json()),
    ]);
  } catch (e) {
    document.body.insertAdjacentHTML('afterbegin',
      `<div style="background:var(--red);color:#fff;padding:10px 16px;font-size:14px">⚠ 数据加载失败（${e}）——请通过 HTTP 访问（如 python3 -m http.server），不要直接双击打开。/ Failed to load data — serve over HTTP.</div>`);
    return;
  }
  const s = G1DATA.sensitivity;
  $('in-kclp').min = s.kcl_price_cny_per_kg.min; $('in-kclp').max = s.kcl_price_cny_per_kg.max; $('in-kclp').step = s.kcl_price_cny_per_kg.step;
  $('in-kcls').min = s.kcl_saltiness_eq.min; $('in-kcls').max = s.kcl_saltiness_eq.max; $('in-kcls').step = s.kcl_saltiness_eq.step;
  bindEvents();
  renderAll();
}
init();

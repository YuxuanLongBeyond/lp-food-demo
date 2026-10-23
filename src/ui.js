// ui.js — 页面渲染与交互（零框架；全部数字来自 src/ 精确求解，非硬编码）

import { F } from './fraction.js';
import { solveG1, g1Ladder, solveG2, g2AllScenarios } from './models.js';
import { DICT } from './i18n.js';

const state = {
  lang: 'zh', tab: 'g1',
  g1: { ncap: 2608, kclPrice: 10, kclSaltiness: 0.75 },
  g2: { scenario: 's3', prices: {} },
};
let G1DATA = null, G2DATA = null;

const $ = (id) => document.getElementById(id);
const t = (k) => DICT[state.lang][k] ?? k;
const nm = (v) => v.name[state.lang];
const fixed = (f, p = 4) => (f == null ? '—' : f.toDecimal(p).toFixed(p));
const gram = (f, p = 2) => (f == null ? '—' : String(f.toDecimal(p).toFixed(p)).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''));

const CNAME = {
  total: ['总量=100g', 'total=100g'], saltiness: ['咸度下限', 'saltiness floor'], umami: ['鲜味下限', 'umami floor'],
  sodium: ['钠上限', 'sodium cap'], kcl_cap: ['KCl 苦味上限', 'KCl bitterness cap'],
  protein: ['蛋白≥80g', 'protein≥80g'], crystal_cap: ['晶体≤4g', 'crystals≤4g'],
  cap_spi: ['SPI≤60', 'SPI≤60'], cap_pea: ['豌豆≤40', 'pea≤40'], cap_rice: ['大米≤30', 'rice≤30'],
};
const cname = (n) => {
  if (CNAME[n]) return CNAME[n][state.lang === 'zh' ? 0 : 1];
  if (n.startsWith('aa_')) { const aa = n.slice(3); return G2DATA.aa_names[aa][state.lang]; }
  if (n.startsWith('off_')) return `${n.slice(4)} = 0`;
  return n;
};

function applyI18n() {
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  document.body.dataset.lang = state.lang;
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
  $('langbtn').textContent = state.lang === 'zh' ? 'EN' : '中文';
}

// ———————————————— G1 ————————————————

function renderG1() {
  const r = solveG1(G1DATA, { ncap: state.g1.ncap, kclPrice: state.g1.kclPrice, kclSaltiness: state.g1.kclSaltiness });
  const ok = r.status === 'optimal';
  $('g1-infeasible').style.display = ok ? 'none' : '';
  ['g1-recipe', 'g1-binding'].forEach((id) => $(id).closest('.card').style.visibility = ok ? '' : 'hidden');

  $('v-ncap').textContent = `${state.g1.ncap} mg`;
  $('v-kclp').textContent = `¥${state.g1.kclPrice}`;
  $('v-kcls').textContent = String(state.g1.kclSaltiness);

  if (ok) {
    // 配方表（含价格溯源折叠）
    const rows = G1DATA.variables.map((v) => {
      const g = gram(r.recipe[v.key]);
      const pv = v.provenance || {};
      const provLine = Object.entries(pv).map(([field, p]) =>
        `<div><b>${field}</b> · ${p.source}${p.date ? ` · ${p.date}` : ''}${p.to_calibrate ? ` · <span class="tag warn">${t('u.tocal')}</span>` : ''}</div>`).join('');
      return `<tr><td>${nm(v)}</td><td class="num">${g} g</td>
        <td class="num" style="color:var(--mut)">${fixed(F.from(v.price_cny_per_kg), 1)}</td>
        <td class="prov">${provLine ? `<details><summary>${t('u.src')}</summary>${provLine}</details>` : ''}</td></tr>`;
    }).join('');
    $('g1-recipe').innerHTML = `<tr><th></th><th class="num">g/100g</th><th class="num">¥/kg</th><th></th></tr>${rows}`;
    const bindingNames = r.problem.constraints.filter((_, i) => r.binding[i]).map((c) => cname(c.name)).join(' · ');
    $('g1-binding').textContent = `${t('g1.binding')}：${bindingNames}　|　${t('u.solve')} · ${r.iterations} ${t('u.iter')}`;

    $('g1-c100').textContent = `¥${fixed(r.costPer100g)}`;
    $('g1-cton').textContent = `¥${fixed(r.costPerTon, 0)}`;
    $('g1-cpkt').textContent = `${fixed(r.costPerPacketLi, 2)} ${t('u.li')}`;
    const red = F.from('4716');
    $('g1-na').textContent = `${fixed(r.sodium, 0)} mg/100g（−${fixed(red.sub(r.sodium).div(red).mul(100), 1)}%）`;
    $('g1-shadow').textContent = `¥${fixed(r.shadowPer100mgPerTon, 1)}/${t('u.perton').replace('¥/', '')}·100mg`;

    $('g1-dual-lp').textContent = `+¥${fixed(r.deltaVsLp, 0)}/${t('u.perton').replace('¥/', '')}`;
    $('g1-dual-lp-p').textContent = `+${fixed(r.deltaVsLpPerPacketLi, 1)} ${t('u.li')}`;
    $('g1-dual-pure').textContent = `+¥${fixed(r.deltaVsPure, 0)}/${t('u.perton').replace('¥/', '')}`;
    $('g1-dual-pure-p').textContent = `+${fixed(r.deltaVsPurePerPacketLi, 1)} ${t('u.li')}`;
  }
  renderG1Ladder(r);
  renderOnex6();
  renderG1Prov();
}

function renderG1Ladder(current) {
  const caps = ['4716', '4100', '3500', '3000', '2608'].map(Number);
  const opts = { kclPrice: state.g1.kclPrice, kclSaltiness: state.g1.kclSaltiness };
  if (!caps.includes(state.g1.ncap)) caps.push(state.g1.ncap);
  caps.sort((a, b) => b - a);
  const steps = g1Ladder(G1DATA, opts, caps.map(String));

  const W = 780, H = 252, base = 196, top = 34, maxNa = 4716, bw = Math.min(72, (W - 90) / steps.length - 24);
  const x0 = 52, gap = (W - 90 - bw * steps.length) / Math.max(1, steps.length - 1);
  const yOf = (na) => base - (na / maxNa) * (base - top);
  const ceilY = yOf(2608);

  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" style="width:100%;height:auto" aria-label="sodium ladder">`;
  s += `<line x1="40" y1="${base}" x2="${W - 20}" y2="${base}" stroke="var(--line)" stroke-width="1.5"/>`;
  s += `<line x1="40" y1="${ceilY}" x2="${W - 20}" y2="${ceilY}" stroke="var(--red)" stroke-width="1" stroke-dasharray="5 4" opacity=".75"/>`;
  s += `<text x="${W - 22}" y="${ceilY - 5}" text-anchor="end" class="ts" style="fill:var(--red)">2608 · KCl ${state.lang === 'zh' ? '顶格' : 'cap'}</text>`;
  steps.forEach((st, i) => {
    const isCur = st.cap.toNumber() === state.g1.ncap;
    const x = x0 + i * (bw + gap);
    const y = yOf(st.sodium ? st.sodium.toNumber() : st.cap.toNumber());
    const h = base - y;
    const fill = isCur ? 'var(--acc2)' : 'color-mix(in srgb, var(--line) 70%, transparent)';
    const stroke = isCur ? 'var(--acc)' : 'var(--line)';
    s += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="4" fill="${fill}" stroke="${stroke}"> </rect>`;
    s += `<text x="${x + bw / 2}" y="${y - 16}" text-anchor="middle" class="tt" style="font-family:var(--mono)">¥${fixed(st.cost, 4)}</text>`;
    s += `<text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" class="ts">${st.status === 'optimal' ? (isCur ? t('g1.ladder.cur') : '') : t('u.infeasible')}</text>`;
    s += `<text x="${x + bw / 2}" y="${base + 16}" text-anchor="middle" class="tt">${gram(st.cap, 0)}</text>`;
    s += `<text x="${x + bw / 2}" y="${base + 30}" text-anchor="middle" class="ts">KCl ${st.recipe ? gram(st.recipe.kcl, 1) : '—'}g</text>`;
  });
  s += `<text x="24" y="${base + 4}" text-anchor="end" class="ts">0</text>`;
  s += `<text x="24" y="${top + 4}" text-anchor="end" class="ts">4716</text>`;
  s += `<text x="${W - 22}" y="${base + 30}" text-anchor="end" class="ts">mg Na/100g</text></svg>`;
  $('g1-ladder-svg').innerHTML = s;
}

function renderOnex6() {
  const one = `<span class="tag ok">钠 Na · ${state.lang === 'zh' ? '已验证' : 'verified'}</span>`;
  const six = G1DATA.schema_1plus6.placeholders.map((p) =>
    `<span class="tag">${nm(p)} · <span class="tag warn">${t('u.placeholder')}</span></span>`).join(' ');
  $('onex6-list').innerHTML = one + six;
}

function renderG1Prov() {
  const rows = [];
  for (const v of G1DATA.variables) {
    for (const [field, p] of Object.entries(v.provenance || {})) {
      rows.push(`<tr><td>${nm(v)} · ${field}</td><td>${p.source}</td><td class="num">${p.date || ''}</td>
        <td>${p.to_calibrate ? `<span class="tag warn">${t('u.tocal')}</span>` : ''}</td></tr>`);
    }
  }
  for (const [k, p] of Object.entries(G1DATA.rhs_provenance || {})) {
    rows.push(`<tr><td>rhs · ${k}</td><td>${p.source}</td><td class="num"></td><td>${p.to_calibrate ? `<span class="tag warn">${t('u.tocal')}</span>` : ''}</td></tr>`);
  }
  $('g1-prov').innerHTML = `<table><tr><th></th><th>${t('u.src')}</th><th class="num">${t('u.date')}</th><th></th></tr>${rows.join('')}</table>`;
}

// ———————————————— G2 ————————————————

function renderG2() {
  const prices = state.g2.prices;
  const all = g2AllScenarios(G2DATA, prices);
  const r = all.scenarios[state.g2.scenario];
  const ok = r.status === 'optimal';

  // 情景按钮（带各自成本）
  $('g2-scenarios').innerHTML = G2DATA.scenarios.map((sc) => {
    const s = all.scenarios[sc.key];
    const cost = s.status === 'optimal' ? `¥${fixed(s.costPer100g)}` : t('u.infeasible');
    return `<button class="small ${sc.key === state.g2.scenario ? 'act' : ''}" data-sc="${sc.key}">
      ${sc.name[state.lang]}<span class="mono" style="color:var(--mut);margin-left:6px">${cost}</span></button>`;
  }).join('');
  document.querySelectorAll('#g2-scenarios button').forEach((b) =>
    b.addEventListener('click', () => { state.g2.scenario = b.dataset.sc; renderG2(); }));

  // 价格输入
  $('g2-prices').innerHTML = G2DATA.variables.map((v) => {
    const val = prices[v.key] ?? v.price_cny_per_kg;
    const pv = v.provenance && v.provenance.price;
    return `<div style="display:flex;gap:8px;align-items:center;margin:4px 0">
      <span style="flex:1;font-size:13px">${nm(v)}</span>
      <input type="number" step="0.1" min="0" value="${val}" data-price="${v.key}"
        style="width:84px;padding:3px 6px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);font-family:var(--mono)">
      ${pv ? `<details class="prov pop"><summary></summary><div>${pv.source} · ${pv.date || ''}${pv.to_calibrate ? ` · ${t('u.tocal')}` : ''}</div></details>` : ''}
    </div>`;
  }).join('');
  document.querySelectorAll('#g2-prices input').forEach((inp) =>
    inp.addEventListener('change', () => { state.g2.prices[inp.dataset.price] = inp.value; renderG2(); }));

  // 预设
  $('g2-presets').innerHTML = G2DATA.sensitivity_presets.map((p) =>
    `<button class="small" data-preset="${p.key}">${p.label[state.lang]}</button>`).join('')
    + `<button class="small" data-preset="__reset">${t('g2.preset.reset')}</button>`;
  document.querySelectorAll('#g2-presets button').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.preset === '__reset') state.g2.prices = {};
    else { const p = G2DATA.sensitivity_presets.find((x) => x.key === b.dataset.preset); state.g2.prices = { ...p.overrides }; }
    renderG2();
  }));

  $('g2-infeasible').style.display = ok ? 'none' : '';
  if (ok) {
    const rows = G2DATA.variables.map((v) => `<tr>
      <td>${nm(v)}${v.is_crystal ? ` <span class="tag">${state.lang === 'zh' ? '晶体' : 'crystal'}</span>` : ''}</td>
      <td class="num">${gram(r.recipe[v.key])} g</td>
      <td class="num" style="color:var(--mut)">${fixed(F.from(state.g2.prices[v.key] ?? v.price_cny_per_kg), 1)}</td></tr>`).join('');
    $('g2-recipe').innerHTML = `<tr><th></th><th class="num">g/100g</th><th class="num">¥/kg</th></tr>${rows}`;

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
        const cls = isBind ? 'warn' : '';
        return `<tr><td>${G2DATA.aa_names[aa][state.lang]}${isMin ? ` <span class="tag warn">${t('g2.aa.lim')}</span>` : ''}</td>
          <td class="num">${gram(s.supply, 0)}</td><td class="num">${gram(s.demand, 0)}</td>
          <td class="num">${fixed(s.ratio, 3)}${isBind ? ` · ${t('g2.aa.bind')}` : ''}</td>
          <td><div class="bar"><i class="${cls}" style="width:${w}%"></i></div></td></tr>`;
      }).join('');
      $('g2-aa').innerHTML = `<tr><th></th><th class="num">mg ${state.lang === 'zh' ? '供给' : 'supply'}</th><th class="num">mg ${state.lang === 'zh' ? '需求' : 'demand'}</th><th class="num">AAS</th><th style="width:120px"></th></tr>${rows2}`;
    } else {
      $('g2-aa').innerHTML = `<tr><td style="color:var(--mut)">${state.lang === 'zh' ? 'S0 基线情景不含氨基酸约束——这是「纯 SPI」对照基线的定义。' : 'S0 baseline has no amino-acid constraints — by definition of the pure-SPI reference.'}</td></tr>`;
    }

    // 差价面板
    const li = (d, p = 2) => `+${fixed(d.mul(F.from(1000)), p)} ${state.lang === 'zh' ? '厘/100g' : 'li/100g'}`;
    $('g2-d-free').textContent = all.diffs.preschool_free.isZero()
      ? (state.lang === 'zh' ? '0（免费）' : '0 (free)') : li(all.diffs.preschool_free);
    $('g2-d-diaas').textContent = `${li(all.diffs.diaas_upgrade)} ≈ ¥${fixed(all.perTon.diaas_upgrade, 0)}/${t('u.perton').replace('¥/', '')}`;
    $('g2-d-sens').textContent = `${li(all.diffs.sensory_dispersion)} ≈ ¥${fixed(all.perTon.sensory_dispersion, 0)}/${t('u.perton').replace('¥/', '')}`;
  }
  renderG2Prov();
}

function renderG2Prov() {
  const rows = [];
  for (const v of G2DATA.variables) {
    const pv = v.provenance && v.provenance.price;
    if (pv) rows.push(`<tr><td>${nm(v)}</td><td>${pv.source}</td><td class="num">${pv.date || ''}</td>
      <td>${pv.to_calibrate ? `<span class="tag warn">${t('u.tocal')}</span>` : ''}</td></tr>`);
  }
  for (const [k, p] of Object.entries(G2DATA.patterns)) {
    rows.push(`<tr><td>${p.name[state.lang]}</td><td>${p.provenance.source}</td><td class="num"></td><td><span class="tag warn">${t('u.tocal')}</span></td></tr>`);
  }
  rows.push(`<tr><td>DIAAS ×1.1</td><td>${G2DATA.diaas.note[state.lang]}</td><td class="num"></td><td><span class="tag warn">${t('u.tocal')}</span></td></tr>`);
  $('g2-prov').innerHTML = `<table><tr><th></th><th>${t('u.src')}</th><th class="num">${t('u.date')}</th><th></th></tr>${rows.join('')}</table>`;
}

// ———————————————— 全局 ————————————————

function bindEvents() {
  $('langbtn').addEventListener('click', () => { state.lang = state.lang === 'zh' ? 'en' : 'zh'; applyI18n(); renderAll(); });
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => {
    state.tab = b.dataset.tab;
    document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('act', x === b));
    document.querySelectorAll('section').forEach((s) => s.classList.toggle('act', s.id === `sec-${state.tab}`));
  }));
  $('in-ncap').addEventListener('input', (e) => { state.g1.ncap = Number(e.target.value); renderG1(); });
  $('in-kclp').addEventListener('input', (e) => { state.g1.kclPrice = Number(e.target.value); renderG1(); });
  $('in-kcls').addEventListener('input', (e) => { state.g1.kclSaltiness = Number(e.target.value); renderG1(); });
  $('g1-reset').addEventListener('click', () => {
    state.g1 = { ncap: 2608, kclPrice: 10, kclSaltiness: 0.75 };
    $('in-ncap').value = 2608; $('in-kclp').value = 10; $('in-kcls').value = 0.75;
    renderG1();
  });
}

function renderAll() { renderG1(); renderG2(); applyI18n(); }

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
  bindEvents();
  renderAll();
}
init();

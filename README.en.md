# LP Food Formulation Demo

[中文](./README.md) · **Live page**: <https://yuxuanlongbeyond.github.io/lp-food-demo/>

Two outlets of one exact solver: **G1 instant-noodle seasoning-pack sodium reduction** + **G2 plant-protein blending**. Two-phase simplex, Bland's rule against cycling, **BigInt exact rationals throughout** (same caliber as the original Python-`fractions` cases) — every number on the page is solved live, never copied from a document. Zero third-party dependencies, zero build steps.

> **DEMO-GRADE**: literature/placeholder coefficients + exact solving, for direction and magnitude discussion only. Not nutritional or medical advice; not a commercial quotation. See [caliber & disclaimer](docs/caliber-en.md).

This is the W1–2 deliverable (v0.1.0, released 2026-10-23) of the personal strategy library "Ten-Year Diet & Health Roadmap" — the first productization of the strategy's "three LP weapons" (optimality proof / shadow price / sensitivity) into an interactive page.

## Quick start

```bash
# 1) Run the tests: 12 assertions anchored to every audited figure in the strategy doc
node --test tests/verify.test.mjs        # → 12 pass

# 2) Open locally (fetch needs HTTP; file:// won't load the JSON)
python3 -m http.server 8000
# visit http://127.0.0.1:8000/
```

No install step for production use: static files, hostable on any HTTP server.

## G1 · Seasoning-pack sodium reduction

100 g of seasoning, five ingredients (NaCl / KCl / MSG / yeast extract / carrier), constraints: total = 100, saltiness ≥ 12, umami ≥ 2, sodium ≤ Ncap, KCl ≤ 8 g. Minimize cost.

| Sodium tier Ncap (mg/100g) | 4716 | 4100 | 3500 | 3000 | **2608** |
|---|---|---|---|---|---|
| Cost (¥/100g) | 0.3020 | 0.3189 | 0.3352 | 0.3489 | **0.3596** |
| vs LP baseline (¥/ton) | 0 | +168 | +332 | +469 | **+576** |
| vs pure-salt baseline (¥/ton) | +188 | +357 | +520 | +657 | **+764** |
| Per 8 g packet (li, vs LP / vs pure salt) | 0 / 1.5 | 1.3 / 2.9 | 2.7 / 4.2 | 3.7 / 5.3 | **4.6 / 6.1** |

(Baseline deltas are solver-exact values rounded; the page shows one decimal live. The baseline itself is not pure salt: at 4716 the LP solution is NaCl 11.36 / KCl 0.85 / MSG 2 / carrier 85.79 — MSG carries 125 mg sodium/g, so 4716 is unreachable without some KCl.)

- **2608 ceiling**: the arithmetic sodium floor when KCl maxes out at 8 g; the vertex recipe is NaCl 6 / KCl 8 / MSG 2 / carrier 84 with sodium = 393×6+125×2 = 2608 exactly on the line; 2600 is infeasible.
- **Shadow price**: exactly 161/5895000 ≈ **¥27.31 per ton per 100 mg** (relaxing sodium by 100 mg saves ≈¥27.31/ton), constant across 4100→2608; cross-checked against central differences. External wording keeps the strategy document's "¥27 (range 27.2–27.6)".
- **Dual-baseline reporting** (caliber discipline #2): vs-LP-baseline 0.3020 (+¥576/ton · 4.6 li) and vs-pure-salt-baseline 0.2832 (+¥764/ton · 6.1 li) are both permanently on the page and move with the sliders.

## G2 · Plant-protein blending

100 g protein base, seven ingredients (soy protein isolate / pea protein / rice protein / Lys·HCl / DL-Met / L-Thr / maltodextrin), nine essential amino acids constrained by FAO 2013 patterns (adult / preschool), AAS ≥ 1 or DIAAS ≥ 1 (demand ×1.1), plant caps with SPI ≤ 60%.

| Scenario | Meaning | Cost (¥/100g) | ¥/kg protein |
|---|---|---|---|
| S0 | pure-SPI baseline | 1.6622 | 20.78 |
| S1 | adult AAS, all nine pass | 1.7720 | 22.15* |
| S2 / S2′ | preschool AAS (upgrade is free; S2 = S2′ same price) | 1.7720 | 22.15* |
| S3 | DIAAS caliber (crystal amino acids enter) | 1.7776 | 22.22 |
| S3′ | DIAAS with crystals banned | **infeasible** | — |

*The LP proves all three scenarios share one price (pea/rice both ¥20 with 0.8 protein are interchangeable — alternate optima); the documented vertex recipes are separately verified by feasibility + equal cost ⇒ optimal.

**Three price gaps** (media-line caliber, live with prices):

| Upgrade | Gap |
|---|---|
| Preschool AAS (vs adult) | **0** (free) |
| DIAAS caliber upgrade (crystals enter, 0.845 g total) | +5.57 li/100g ≈ **¥56/ton** |
| Beany-flavour/allergen dispersion (SPI≤60%) | +109.78 li/100g ≈ **¥1098/ton** |

Sensory dispersion costs **≈20×** the DIAAS upgrade — the cost driver is sensory, not nutritional. That is this case's key commercial conclusion.

S3 binding detail: Lys/SAA/Thr all three rows simultaneously at supply = demand (5016/2728/2992 mg, ratios exactly 1), crystal usage Lys·HCl 0.708 / DL-Met 0.085 / L-Thr 0.053 g; the free-base conversion Lys·HCl ×14619/18265 (≈0.800383) is handled in exact rationals.

## The caliber-discipline trio (W1–2 acceptance items)

1. **Provenance labels + evidence grading**: every coefficient field carries source + retrieval date + to-be-calibrated; demo-grade (literature coefficients + small-sample self-tests, direction only) vs production-grade (professional sensory panel ≥30 or industry-academia data) are labeled. Full provenance tables on both pages.
2. **Dual-baseline reporting + illustrative-price caliber attached**: see G1 above; all prices on both pages are illustrative anchors retrieved 2026-10-22 from public channels (ChemicalBook / 1688 / Alibaba international / Mysteel / Jiabao Zhihui) and move with markets.
3. **Sensitivity sliders**: KCl price (2–30), KCl saltiness coefficient (0.5–0.95), all seven G2 ingredient prices + two presets (Met surge 23.5→52: S2 price unmoved; tonnage pea/rice→¥15: S2 enters the ¥15.5/kg band).

**"1+6" full-constraint shape**: among GB 28050's "1+6" mandatory nutrients, sodium is the verified primary constraint (solved here); the other six (energy/protein/fat/saturated fat/carbs/sugar) sit in the data schema as explicit "placeholder · to be calibrated" slots — structure in place, no fabricated precision. See [docs/caliber-en.md](docs/caliber-en.md).

## Honesty checks & reconciliation

Page figures are all computed live and exactly by this repo's solver; tests/ anchors the strategy document's dashboard and re-verification table with 12 assertions. Two known document discrepancies — **recomputation wins, trail preserved, audit history untouched**:

| # | Document wording | Exact recomputation | Handling |
|---|---|---|---|
| 1 | G2 case S1 row "all nine ≥ 1.31" | minimum is Lys ≈ **1.238** (1.31 happens to be Val's value; likely not the min) | demo recomputes from the coefficient table; discrepancy logged here and on the page |
| 2 | G1 shadow price first audit segment ¥27.6 | exactly 161/5895000 ≈ **¥27.31** (27.6 came from amplifying 4-decimal rounded costs) | page shows the live value; external wording stays "¥27 (range 27.2–27.6)" |

## Repository layout

```
├── index.html            entry page (G1/G2/caliber tabs, zh/EN toggle, auto dark mode)
├── src/
│   ├── fraction.js       BigInt exact rationals (parse/ops/output, all immutable)
│   ├── lp.js             two-phase simplex + duals (shadow prices read from the final basis)
│   ├── models.js         JSON→LP assembly (G1 five vars; G2 nine AA rows + crystal free-base conversion)
│   ├── i18n.js           zh/EN dictionary
│   └── ui.js             rendering & interaction (sliders / ladder SVG / score bars / provenance / popovers)
├── data/
│   ├── g1-seasoning.json G1 coefficients + per-field provenance + 1+6 schema + sensitivity config
│   └── g2-protein.json   G2 AA matrices + FAO patterns + six scenarios + price provenance + presets
├── tests/verify.test.mjs 12 exact assertions (node --test)
└── docs/caliber-zh.md · caliber-en.md   the caliber trio in full (bilingual)
```

## License

- **Code & method**: MIT (see [LICENSE](./LICENSE))
- **Data snapshots** (`data/*.json`): CC-BY 4.0 (see [NOTICE](./NOTICE)) — reuse with source + demo-grade label attached

## Disclaimer

This tool and all its figures are **demo-grade**: literature/placeholder coefficients + exact solving; for direction and magnitude discussion only — **not nutritional or medical advice, not a commercial quotation**. Price anchors were retrieved 2026-10-22 from public channels and change with markets. Claims go only through the nutrient-content channel (GB 28050); no disease-prevention/treatment claims. Found an error? Open an issue — public correction, trail preserved.

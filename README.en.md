# LP Food Formulation Demo

[中文](./README.md) · **Live page**: <https://yuxuanlongbeyond.github.io/lp-food-demo/>

Two outlets of one exact solver: **G1 instant-noodle seasoning-pack sodium reduction** (v0.2 palette 5→12 ingredients) + **G2 plant-protein blending** (v0.2: 7→10 ingredients, USDA FDC per-cell data). Two-phase simplex, Bland's rule against cycling, **BigInt exact rationals throughout** (same caliber as the original Python-`fractions` cases) — every number on the page is solved live, never copied from a document. Zero third-party dependencies, zero build steps; constraint assembly is data-driven (one shared core for G1/G2 — new ingredients are JSON edits, not code).

> **DEMO-GRADE**: literature/placeholder coefficients (the v02 profile transcribes authoritative data) + exact solving, for direction and magnitude discussion only. Not nutritional or medical advice; not a commercial quotation. See [caliber & disclaimer](docs/caliber-en.md).

This is the W1–2 deliverable (v0.1.0 / v0.2.0 / v0.2.1 / v0.2.2, released 2026-10-23) of the personal strategy library "Ten-Year Diet & Health Roadmap" — the strategy's "three LP weapons" (optimality proof / shadow price / sensitivity) productized into an interactive page.

## Quick start

```bash
# 1) Run the tests: 21 assertions (all 12 v0.1 classic anchors kept + 9 engine-generated v0.2 anchors)
node --test tests/verify.test.mjs        # → 21 pass

# 2) Serve the page locally (fetch needs HTTP; file:// won't work)
python3 -m http.server 8000
# open http://127.0.0.1:8000/
```

No install step for deployment: static files, any HTTP server hosts it.

## G1 · Seasoning-pack sodium reduction

**Classic 5-ingredient palette** (NaCl / KCl / MSG / yeast extract / carrier; the v0.1 audited caliber):

| Sodium cap (mg/100g) | 4716 | 4100 | 3500 | 3000 | **2608** |
|---|---|---|---|---|---|
| Cost (¥/100g) | 0.3020 | 0.3189 | 0.3352 | 0.3489 | **0.3596** |
| vs LP baseline (¥/ton) | 0 | +168 | +332 | +469 | **+576** |
| vs pure-salt baseline (¥/ton) | +188 | +357 | +520 | +657 | **+764** |
| per 8g packet (li, LP / pure-salt) | 0 / 1.5 | 1.3 / 2.9 | 2.7 / 4.2 | 3.7 / 5.3 | **4.6 / 6.1** |

- **2608 ceiling**: the arithmetic sodium floor with KCl maxed at 8 g (393×6+125×2 exactly binding); 2600 infeasible.
- **Shadow price**: exact 161/5895000 ≈ **¥27.31/ton·100mg**, constant on the basis-stable range [2608, **4966**] (4966 = 393×12+125×2, the exact breakpoint where KCl leaves the basis); external wording stays "¥27 (range 27.2–27.6)".

**Extended 12-ingredient palette** (Survey §3.4 expandable variables: I+G / citric acid / mushroom / kelp / spices / potassium-lactate masking / sugar) — a four-segment exact parametric curve; four technical routes activate at different sodium prices:

| Sodium range (mg/100g) | Shadow price (¥/ton·100mg) | Route activated |
|---|---|---|
| [2612, 4716] | 27.31 | KCl substitution (same segment as classic) |
| [2378.25, 2612] | 41.71 | I+G displacing MSG (umami saves sodium) |
| [1641.375, 2378.25] | 78.20 | Potassium-lactate masking relaxes KCl (8→10.5 g) |
| [1494, 1641.375] | 95.17 | Citric-acid saltiness gain (exact feasible floor 1494) |

**Disease modes** (RHS-swap demo, mappings are demo assumptions): hypertension (Na ≤1875, guideline 2000 mg/d × 7.5% of an 8g packet) is infeasible on the classic palette but **solvable on the extended palette** (¥0.4299/100g) — expansion unlocks lower sodium; CKD K-capped (K ≤3000) is **infeasible**: both KCl and potassium lactate carry potassium, so capping K squeezes out the salt-substitute route (the clinical caution that CKD patients avoid KCl salt) — reported honestly. **1+6 switch** (GB 28050): the demo preset keeps all six rows slack; the GB-claims preset (sugar-free 0.5 g) conflicts with the sweetness floor → infeasible, honestly showing the ε-constraint shape.

## G2 · Plant-protein blending

**v01 profile** (literature typicals, the v0.1 audited caliber, seven ingredients):

| Scenario | Meaning | Cost (¥/100g) | ¥/kg protein |
|---|---|---|---|
| S0 | pure-SPI baseline | 1.6622 | 20.78 |
| S1 | adult AAS full compliance | 1.7720 | 22.15* |
| S2 / S2′ | preschool AAS (upgrade free) | 1.7720 | 22.15* |
| S3 | DIAAS caliber (crystals enter, 0.845 g) | 1.7776 | 22.22 |
| S3′ | DIAAS without crystals | **infeasible** | — |

*The LP proves all three share a price (pea/rice equivalence — alternate optima, detected and flagged on the page); the documented vertices are independently verified feasible + equal-cost ⇒ optimal. Beany-flavour dispersion +109.78 li ≈ **¥1098/ton** is ≈**20×** the DIAAS upgrade (+5.57 li ≈ ¥56/ton) — the cost driver is sensory, not nutrition.

**v02 profile** (USDA FDC per-cell + FAO 2013 Table 5 original patterns + per-ingredient digestibility; ten ingredients: + vital wheat gluten / yeast protein / sunflower protein):

| Scenario | Cost (¥/100g) | Key changes |
|---|---|---|
| S0 | 1.2067 | **Vital wheat gluten (¥9/kg) rewrites the baseline**: SPI 33.33 + gluten 66.67, ¥15.08/kg protein |
| S1 | 1.4725 | FAO 2013 adult Lys 48 + wheat Lys 22 → **lysine becomes the hard constraint**: Lys·HCl enters, Lys binding |
| S2 = S3 | 1.4777 | One vertex optimal under both the AAS and digestibility calibers (DIAAS upgrade gap = 0) |
| S2′ / S3′ | **infeasible** | With USDA per-cell values, pure blending no longer reaches preschool level — data caliber changes conclusions |

Quality frontier (ε-constraint): on v02, S2 can push all nine AAS simultaneously to λmax = 563/512 ≈ **1.0996** (¥2.04/100g); the page draws the curve live.

## The three weapons, completed (v0.2)

1. **Optimality proof**: exact-rational vertices + alternate-optima detection (v01 S1 is true: pea/rice equivalent vertices — flagged on the page).
2. **Shadow-price table** (full-constraint dual report): per row LHS/RHS, binding/slack, shadow price, and the **basis-stable RHS range** — whose endpoints are the basis-change breakpoints.
3. **Sensitivity**: beyond sliders — **price breakpoints** ("how high before a swap / how low before entry", exact tableau ranging + a ±0.01 re-solve probe verifying whether the recipe actually changes), the **G1 parametric curve** (four segments above), and the **G2 quality frontier**.

## The caliber trio (the W1–2 acceptance items)

1. **Provenance labels + evidence grading**: every coefficient field carries source + retrieval date + to-be-calibrated; v0.2 adds USDA FDC per-cell values (FDC ID + date transcribed) and FAO 2013 original-report transcription; demo-grade/production-grade grading unchanged.
2. **Dual-baseline reporting + illustrative-price caliber attached**: always on the G1 page; all prices are illustrative public-channel anchors (ChemicalBook / 1688 / Alibaba / Mysteel / Jiabozhihui / USDA FDC), market-dependent.
3. **Sensitivity**: sliders + presets (Met surge, tonnage purchasing, gluten-market stress) + the weapon panels above.

## Honesty checks & reconciliation

Every figure is computed live by this repo's solver; tests hold 21 assertions (all 12 v0.1 classic anchors kept). Three known document discrepancies — **recomputation wins, trail preserved, audit history untouched**:

| # | Document caliber | Exact recomputation / original-report transcription | Handling |
|---|---|---|---|
| 1 | G2 case S1 "all nine ≥1.31" | minimum is Lys ≈ **1.238** (1.31 happens to be Val; likely not the min) | recomputed live; recorded here and on the page |
| 2 | G1 audit-table first shadow-price segment ¥27.6 | exact 161/5895000 ≈ **¥27.31** (27.6 came from rounding the 4-decimal costs) | page shows the live exact value; external wording stays "¥27 (range 27.2–27.6)" |
| 3 | G2 scoring patterns (transcribed) "FAO 2013 adult/preschool" | checked against the FAO 2013 original report (transcribed 2026-10-23): the "adult" pattern is in fact the **2007 >18-y maintenance pattern**; the "preschool" SAA/Thr/Trp cells (31/34/11) disagree with Table 5's child 6 mo–3 y (27/31/8.5) | v01 keeps the transcribed values (anchors untouched); v02 uses Table 5 originals — data caliber changes conclusions (S2′ flips feasible → infeasible) |

## Repository layout

```
├── index.html            entry page (G1/G2/caliber tabs, zh/EN switch, auto dark mode)
├── src/
│   ├── fraction.js       BigInt exact rationals (parse/arithmetic/print, immutable)
│   ├── lp.js             two-phase simplex + duals + reduced costs + RHS/price ranges (all exact)
│   ├── models.js         data-driven assembly (one core for G1/G2; parametric curve / frontier / breakpoints)
│   ├── i18n.js           zh/EN dictionary
│   └── ui.js             rendering & interaction (weapon panels / sliders / SVG / provenance)
├── data/
│   ├── g1-seasoning.json G1 dual palettes + coefficients + provenance + disease modes + 1+6 + sensitivity
│   └── g2-protein.json   G2 dual profiles + AA matrices (USDA per-cell) + FAO patterns + digestibility + presets
├── tests/verify.test.mjs 21 exact assertions (node --test)
└── docs/caliber-zh.md · caliber-en.md   the caliber trio in full (bilingual)
```

## License

- **Code & method**: MIT (see [LICENSE](./LICENSE))
- **Data snapshots** (`data/*.json`): CC-BY 4.0 (see [NOTICE](./NOTICE)) — reuse with source + demo-grade label attached; USDA FDC data is US-government public domain, redistributed with entry IDs

## Disclaimer

This tool and all its figures are **demo-grade**: literature/placeholder coefficients + exact solving, for direction and magnitude discussion only — **not nutritional or medical advice, not a commercial quotation**. Price anchors were retrieved 2026-08–10 from public channels and change with markets. Disease modes are demo mappings of dietary-guideline targets, not individual dietary advice. Claims go only through the nutrient-content channel (GB 28050); no disease-prevention/treatment claims. Found an error? Open an issue — public correction, trail preserved.

# Caliber Discipline & Disclaimer (Canonical) · 口径三件套与免责

> This is the canonical caliber document of the [LP Food Formulation Demo](../index.html) (Chinese version: [caliber-zh.md](caliber-zh.md)). The page shows a summary; on any conflict, this file and `data/*.json` win. v0.1.0 · 2026-10-23.

## 0. Positioning & evidence grading

| Grade | Definition | Status in this demo |
|---|---|---|
| **Demo-grade** | literature coefficients + illustrative public-channel prices + small-sample self-tests (if any); direction & magnitude signal only | **everything currently** |
| **Production-grade** | professional sensory panel ≥30, measured AA profiles (per batch), real supplier quotations, regulatory lab data | not started (professor/industry-academia path) |

Every coefficient inside the demo is labeled with this grading. Every figure on the page is computed live by this repo's solver (BigInt exact-rational simplex) — never hard-coded from documents; `tests/verify.test.mjs` anchors all key figures of the strategy document's dashboard and re-verification table with 12 assertions.

## 1. Trio #1: provenance labels (every coefficient field)

In `data/g1-seasoning.json` and `data/g2-protein.json`, **every coefficient** carries three metadata fields: `source`, `date`, `to_calibrate`. Both pages show the full per-field provenance tables.

### 1.1 Price caliber table (illustrative prices, move with markets)

| Ingredient | Price (¥/kg) | Source | Date | To calibrate |
|---|---|---|---|---|
| Salt NaCl | 1.6 | illustrative, near 1688 food-grade wholesale | 2026-10-22 | ✓ |
| Potassium chloride KCl | 10 | illustrative, near 1688 food-grade wholesale | 2026-10-22 | ✓ |
| MSG | 9 | illustrative, near 1688 food-grade wholesale | 2026-10-22 | ✓ |
| Yeast extract YE | 30 | illustrative, near 1688 food-grade wholesale | 2026-10-22 | ✓ |
| Inert carrier | 3 | commodity common-sense (demo-grade placeholder) | 2026-10-22 | ✓ |
| Soy protein isolate SPI | 18.2 | ChemicalBook food-grade, Shandong spot | 2026-10 | ✓ |
| Pea protein | 20 | 1688 wholesale ¥15–25 midpoint (Shandong Huijia 80%≈¥25, 90%≈¥26.6) | 2026-10-22 | ✓ |
| Rice protein | 20 | Alibaba international, from ¥19.98 | 2026-10-22 | ✓ |
| L-Lysine·HCl 98.5% | 9.1 | Mysteel Liaoning ¥9,100/ton (**feed-grade anchor; food grade needs pricing**) | 2026-08-09 | ✓ |
| DL-Methionine 99% | 23.5 | Jiabao Zhihui Beijing-Tianjin-Hebei 23.2–23.8 (April high ≈52, June 38–41, October falling; GB 14880 compliance check for the DL racemate in food is a production-grade prerequisite) | 2026-10-08 | ✓ |
| L-Threonine 98.5% | 9.7 | Mysteel ¥9,700/ton (Fermentation Net quoted 9.45 in 2026-03) | 2026-08-09 | ✓ |
| Maltodextrin carrier | 4 | commodity common-sense (demo-grade placeholder) | 2026-10-22 | ✓ |

### 1.2 Technical-coefficient highlights

- **NaCl sodium 393 mg/g**: stoichiometric (Na 22.99/58.44 ≈ 39.3%) — the only technical coefficient *not* flagged to-calibrate.
- **KCl saltiness 0.75**: literature typical range 0.6–0.8, midpoint; page slider 0.5–0.95 (trio #3).
- **MSG sodium 125 mg/g**: monohydrate theoretical ≈123 mg/g, rounded — to calibrate.
- **YE sodium/umami**: large product-to-product spread, literature typicals — to calibrate.
- **G2 AA matrices**: literature typicals, batch spread ±10–15% common; v0.2 task = replace cell-by-cell with USDA/China Food Composition Table values.
- **Crystal free-base conversion**: Lys·HCl potency = 14619/18265 ≈ 0.800383 (exact rational in the solver); DL-Met purity 0.99, L-Thr 0.985.
- **FAO 2013 patterns**: adult 15/30/59/45/22/38/23/6/39 and preschool 20/32/66/57/31/52/34/11/43 (mg/g protein, order His/Ile/Leu/Lys/SAA/AAA/Thr/Trp/Val; secondary citation — the age wording 6 mo–3 y vs 3–10 y is inconsistent across sources, FAO original to be checked); DIAAS demand multiplier 1.1.

## 2. Trio #2: dual-baseline reporting + unit conversions

The G1 page permanently carries two cost baselines, live with the sliders:

- **vs LP baseline** (optimal cost at Ncap=4716, 0.3020 ¥/100g): "how much does this sodium-reduction step itself cost" — five tiers 0 / +168 / +332 / +469 / +576 ¥/ton;
- **vs pure-salt baseline** (NaCl 12g + carrier 88g, cost 0.2832 ¥/100g): "how expensive vs industry default" — five tiers +188 / +357 / +520 / +657 / +764 ¥/ton.

**Unit conversions** (`unit_conversions`, uniform across the app):

| From | To | Multiplier |
|---|---|---|
| ¥/100g | ¥/ton | ×10,000 |
| ¥/100g | li per 8g packet | ×80 (¥→li ×1000; 100g→8g ×0.08) |
| ¥/100g (G2) | ¥/kg product | ×10 |
| ¥/kg product (G2) | ¥/kg protein | ÷0.08 (8g protein per 100g base caliber) |

The G2 "per protein" denominator uses the **8g-protein-per-100g-base** caliber (hence S0 20.78, S3 22.22) and must not be mixed with other industry "cost per g protein" calibers.

## 3. Trio #3: sensitivity (the LP weapon, productized)

| Parameter | Range/preset | Verified conclusion |
|---|---|---|
| G1 sodium cap Ncap | 2608–4716 (step 8) | five-tier cost curve; 2608 is the KCl-maxed ceiling (NaCl6/KCl8/MSG2/carrier84, sodium = 393×6+125×2 exactly on the line); 2600 infeasible |
| G1 KCl price | ¥2–30/kg | supporting experiment for the shadow-price range caliber |
| G1 KCl saltiness | 0.5–0.95 | sensitivity of the equivalence assumption |
| G2 ingredient prices | any (input boxes) | — |
| Preset · Met surge | 23.5→52 | S2 price unmoved (Met usage 0.085g, tiny weight); S3 only +2.4 li/100g |
| Preset · tonnage buying | pea/rice 20→15 | S2 falls to ¥1.5490/100g = ¥15.49/kg, entering the media-line ¥15 band |

**Shadow-price caliber**: the dual of the sodium constraint, exactly 161/5895000 ≈ ¥27.31/ton·100mg, constant across 4100→2608; cross-checked with central differences on the page. External wording: "¥27 (range 27.2–27.6)".

## 4. The "1+6" full-constraint schema (GB 28050)

GB 28050 mandates "1+6" on labels: sodium + energy/protein/fat/saturated fat/carbohydrate/sugar. The `schema_1plus6` field of `data/g1-seasoning.json` builds all seven as switchable constraint structures:

- **sodium**: all coefficients verified, solvable here (primary constraint);
- **the other six**: coefficients explicitly marked "placeholder · to be calibrated"; structure in place but not solved by default — demonstrating the multi-objective/ε-constraint shape without fabricating precision.

## 5. Honesty checks & reconciliation

Two known document discrepancies — **recomputation wins, trail preserved, audit history untouched**:

| # | Document wording | Exact recomputation | Handling |
|---|---|---|---|
| 1 | G2 case S1 row "all nine ≥ 1.31" | minimum is Lys ≈ **1.238** (1.31 happens to be Val's value; likely not the min) | demo recomputes live from the coefficient table; discrepancy logged here and on the page |
| 2 | G1 shadow price first audit segment ¥27.6 | 161/5895000 ≈ **¥27.31** (27.6 came from amplifying 4-decimal rounded costs) | page shows the live exact value; external wording stays "¥27 (range 27.2–27.6)" |

All deltas on the page are rounded from solver-exact values (e.g. the vs-LP baseline delta is exactly 575.72 → shown as +576).

## 6. Disclaimer & claims channel

- This tool and all its figures are **demo-grade**: literature/placeholder coefficients + exact solving, for direction and magnitude discussion only;
- **Not nutritional or medical advice; not a commercial quotation**;
- price anchors were retrieved 2026-10-22 (some 2026-08/10) from public channels and move with markets;
- product claims go only through the **nutrient-content claims channel** (GB 28050); no disease-prevention/treatment claims;
- GB 14880 compliance for DL-methionine in food is a production-grade prerequisite check; in the demo it is a mathematical variable only;
- found an error? Open an issue — public correction, trail preserved.

## 7. Changelog

- **v0.1.0 (2026-10-23)**: first release. G1 five tiers + dual baselines + shadow price + sodium ladder; G2 six scenarios + crystal amino acids + price-gap panel; caliber trio fully built in; 12 exact-assertion tests; bilingual; MIT + CC-BY 4.0.

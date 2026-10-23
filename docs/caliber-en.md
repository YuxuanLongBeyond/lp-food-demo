# Caliber Discipline & Disclaimer (Canonical) · 口径三件套与免责

> This is the canonical caliber document of the [LP Food Formulation Demo](../index.html) (Chinese version: [caliber-zh.md](caliber-zh.md)). The page shows a summary; on any conflict, this file and `data/*.json` win. v0.2.1 · 2026-10-23.

## 0. Positioning & evidence grading

| Grade | Definition | Status in this demo |
|---|---|---|
| **Demo-grade, transcribed** | Literature-typical coefficients + illustrative public-channel prices; direction & magnitude signal only | All of v0.1; in v0.2 still the G1 classic palette, the G2 `v01_typical` profile, and every price/flavour coefficient |
| **Demo-grade, direct-copy** | Authoritative original data transcribed per cell (entry ID + retrieval date); still not measured / per-batch | New in v0.2: the USDA FDC amino-acid matrices and FAO 2013 Table 5 scoring patterns of the G2 `v02_usda` profile |
| **Production-grade** | Professional sensory panel ≥30, measured AA profiles (per batch), real supplier quotations, regulatory lab data | not started (professor/industry-academia path) |

Every figure on the page is computed live by this repo's solver (BigInt exact-rational simplex) — never hard-coded; `tests/verify.test.mjs` holds 21 assertions: all 12 v0.1 classic anchors are kept (classic palette + `v01_typical` profile), and the 9 new v0.2 anchors were engine-generated, cross-verified (re-solve probes / central differences), then frozen.

## 1. Trio #1: provenance labels (every coefficient field)

Every coefficient in the data files carries `source` / `date` / `to_calibrate`. v0.2 adds profile switching: G1 `palettes` (classic 5 / extended 12 ingredients) and G2 `data_profiles` (v01 literature-typical / v02 USDA per-cell) — a profile defines both the variable set and the coefficient source, so classic anchors are never overwritten by data upgrades.

### 1.1 Price caliber table (illustrative prices, move with markets)

| Ingredient | Price (¥/kg) | Source | Date | To calibrate |
|---|---|---|---|---|
| Salt NaCl | 1.6 | illustrative, near 1688 food-grade wholesale | 2026-10-22 | ✓ |
| Potassium chloride KCl | 10 | illustrative, near 1688 food-grade wholesale | 2026-10-22 | ✓ |
| MSG | 9 | illustrative, near 1688 food-grade wholesale | 2026-10-22 | ✓ |
| Yeast extract YE | 30 | illustrative, near 1688 food-grade wholesale | 2026-10-22 | ✓ |
| Inert carrier | 3 | commodity common-sense (demo-grade placeholder) | 2026-10-22 | ✓ |
| I+G (disodium ribonucleotides) ·new | 90 | 1688 20% I+G blend, illustrative 70–110, take 90 | 2026-10-23 | ✓ |
| Citric acid ·new | 12 | 1688 anhydrous food grade, illustrative 10–14, take 12 | 2026-10-23 | ✓ |
| Mushroom powder ·new | 45 | 1688 shiitake/mushroom powder, illustrative 35–60, take 45 | 2026-10-23 | ✓ |
| Kelp powder ·new | 35 | 1688 kelp powder, illustrative 25–45, take 35 | 2026-10-23 | ✓ |
| Spices ·new | 22 | 1688 blended spices, illustrative 15–30, take 22 | 2026-10-23 | ✓ |
| Potassium lactate ·new | 18 | 1688 food grade, illustrative 15–22, take 18 (solid basis) | 2026-10-23 | ✓ |
| Sugar ·new | 6 | refined-sugar bulk, illustrative 5.5–7, take 6 | 2026-10-23 | ✓ |
| Soy protein isolate SPI | 18.2 | ChemicalBook food-grade, Shandong spot | 2026-10 | ✓ |
| Pea protein | 20 | 1688 wholesale ¥15–25 midpoint (Shandong Huijia 80%≈¥25, 90%≈¥26.6) | 2026-10-22 | ✓ |
| Rice protein | 20 | Alibaba international, from ¥19.98 | 2026-10-22 | ✓ |
| Vital wheat gluten ·new | 9 | 1688 food grade, illustrative 8–10, take 9 (among the cheapest bulk proteins) | 2026-10-23 | ✓ |
| Yeast protein (2023 novel-food ingredient) ·new | 60 | B2B illustrative 50–80, take 60 (scaling up) | 2026-10-23 | ✓ |
| Sunflower protein ·new | 24 | 1688 sunflower protein powder, illustrative 20–30, take 24 | 2026-10-23 | ✓ |
| L-Lysine·HCl 98.5% | 9.1 | Mysteel Liaoning ¥9,100/ton (**feed-grade anchor; food grade needs pricing**) | 2026-08-09 | ✓ |
| DL-Methionine 99% | 23.5 | Jiabozhihui 23.2–23.8 (Apr high ≈52, Jun 38–41, Oct easing; GB 14880 racemate compliance is a production-grade prerequisite) | 2026-10-08 | ✓ |
| L-Threonine 98.5% | 9.7 | Mysteel ¥9,700/ton (Fermentation Net 2026-03: 9.45) | 2026-08-09 | ✓ |
| Maltodextrin carrier | 4 | commodity common-sense (demo-grade placeholder) | 2026-10-22 | ✓ |

### 1.2 G1 technical coefficients (flavour dimensions, all demo-grade, to be calibrated)

- **NaCl sodium 393 mg/g**, **KCl potassium 524 mg/g**, **potassium-lactate potassium 305 mg/g**: stoichiometry — not to be calibrated.
- **KCl saltiness 0.75**: literature 0.6–0.8 midpoint; slider 0.5–0.95.
- **MSG sodium 125 mg/g**: monohydrate theory ≈123, rounded — to be calibrated.
- **YE sodium/umami (50/0.35)**, **mushroom (15/0.15)**, **kelp (80/0.25)**: literature/product-spec typicals; large product spread.
- **I+G effective umami coefficient 8**: I+G and glutamate act **synergistically (supra-additive, nonlinear)**. The model linearizes to an effective coefficient at typical ratios (MSG ≥2 g, I+G ≤0.3 g per 100 g) — **valid only near those ratios**; linear extrapolation beyond them is unreliable. This is an explicit v0.2 caliber boundary. I+G sodium 65 mg/g (disodium salts ≈6–7% Na).
- **Acid gain 0.25 g salt-equivalent per g citric acid**: illustrative coefficient for the directionally documented acid-enhanced saltiness (Survey §3.4, route 3).
- **Bitterness masking −1 unit per g potassium lactate**: linearized illustrative relaxation of the KCl bitterness cap (same §3.4); cap 8 units ≡ the v0.1 8 g KCl limit.
- **Sweetness floor 2 g, spice floor 0.8 g, sugar cap 6 g, spice cap 4 g**: illustrative midpoints from real label vocabulary (label_work).

### 1.3 G2 amino-acid matrix and scoring patterns (v0.2 data upgrade)

**USDA FDC per-cell values (`v02_usda` profile; mg/g protein = source g/100 g ÷ protein g/100 g ×1000, SAA = Met+Cys, AAA = Phe+Tyr; the solver converts in exact rationals):**

| Ingredient | FDC ID (NDB) | Entry | Protein g/100g | Retrieved | Notes |
|---|---|---|---|---|---|
| SPI | 174276 (16122) | Soy protein isolate (SR Legacy, published 2019-04-01) | 88.32 | 2026-10-23 | USDA protein coexists with the 90% product spec (matrix uses FDC, protein uses the spec; caliber difference recorded) |
| Wheat (gluten) | 169721 (20076) | Wheat, durum (**proxy** AA profile) | 13.68 | 2026-10-23 | The vital-gluten entry 168147 (75.16% protein) has no amino-acid breakdown; profile proxied by whole durum-wheat protein; gluten proteins are 80%+ of wheat protein, gluten Lys slightly below whole-wheat — direction known, uncorrected |
| Yeast | 175043 (18375) | Baker's yeast, active dry (AA profile source) | 40.44 | 2026-10-23 | Crude protein includes nucleic-acid N (not deducted); commercial yeast protein (≥80%, 2023 novel-food ingredient) removes nucleic acid — Lys-rich profile persists, absolute values need calibration |
| Sunflower | 170156 (12041) | Sunflower seed flour, partially defatted | 48.06 | 2026-10-23 | Commercial concentrate ≈55% uses this profile + product spec |
| Pea protein | — | No SR/Foundation isolate entry in FDC (whole peas only; profile not representative of isolates) | — | — | **Literature typicals kept, recorded** |
| Rice protein | — | Same | — | — | **Literature typicals kept, recorded** |

Example: SPI SAA per cell = (1.13+1.046)×1000÷88.32 = **1700/69 ≈ 24.64 mg/g** (v01 literature typical 29 — the USDA value is tighter and directly raises the DIAAS-tier crystal Met demand).

**Per-ingredient digestibility (`v02_usda`; true ileal digestibility literature mid-values, to be calibrated)**: SPI 0.945 (0.91–0.98), pea 0.87 (0.82–0.92), rice 0.935 (0.90–0.97), wheat gluten 0.93 (0.90–0.96 illustrative), yeast 0.88 (0.85–0.92 illustrative), sunflower 0.88 (0.85–0.92 illustrative). The v02 AA constraint reads supply = Pᵢ×AAᵢ×digᵢ ≥ pattern×P (demand unamplified); v01 keeps the flat ×1.1 proxy (audited anchors).

**Scoring patterns**: v01 keeps the transcribed values (adult 15/30/59/45/22/38/23/6/39; preschool 20/32/66/57/31/52/34/11/43); v02 uses **FAO 2013 original report Table 5, transcribed directly** (older child/adolescent/adult 16/30/61/48/23/41/25/6.6/40; child 6 mo–3 y 20/32/66/57/27/52/31/8.5/43; infant 0–6 mo 21/55/96/69/33/94/44/17/55 for reference). The differences are reconciliation item 3.

**Crystal free-base conversion**: Lys·HCl potency = 14619/18265 ≈ 0.800383 (exact fraction in the solve); DL-Met purity 0.99, L-Thr 0.985.

## 2. Trio #2: dual-baseline reporting + unit calibers

G1 always shows two cost baselines, live with every control (both are **same palette, same switches**: the extended-palette LP baseline re-solves the extended palette at 4716):

- **vs LP-solution baseline** (same palette at Ncap=4716): "how much does this sodium step itself cost" — classic five tiers 0 / +168 / +332 / +469 / +576 ¥/ton; extended 2608 also +576 (the fixed flavour-floor cost enters the baseline side equally, so the delta caliber is palette-independent);
- **vs pure-salt baseline** (NaCl 12 g + carrier 88 g, 0.2832 ¥/100 g): "how expensive vs industry practice" — classic tiers +188 / +357 / +520 / +657 / +764 ¥/ton; extended 2608 +978, hypertension tier (1875) +1467 ¥/ton.

**Units** (`unit_conversions`, page-wide): ¥/100g → ¥/ton ×10,000; ¥/100g → li/8 g packet ×80; G2 ¥/100g → ¥/kg product ×10; → ¥/kg protein ÷0.08 (8 g protein per 100 g base; not directly comparable with industry "per g protein" figures).

## 3. Trio #3: sensitivity — the three weapons, completed

### 3.1 Sliders and presets

| Parameter | Range/preset | Verified conclusions |
|---|---|---|
| G1 sodium cap | classic 2608–4716; extended 1200–4716 (ranges now data-driven) | Extended feasible floor = **1494** (393×3.75 + 65×0.25 + 5×0.8 exactly); 1493 infeasible |
| G1 KCl price / saltiness | ¥2–30 / 0.5–0.95 | as v0.1 |
| G2 prices + presets | Met surge 23.5→52; tonnage pea/rice 20→15; **wheat gluten 9→13 (v02 only)** | first two as v0.1; the gluten preset stress-tests the cheapest bulk source |

### 3.2 Full-constraint dual report (shadow-price table)

Per constraint: LHS/RHS, binding/slack, shadow price (¥/ton per unit RHS), and the **basis-stable RHS range [lo, hi]** (endpoints = basis-change breakpoints; "∞" = unbounded). At classic 2608 the sodium range is [2608, **4966**]: the upper end 4966 = 393×12+125×2 is exactly where KCl leaves the basis and MSG caps — inside the range the shadow price is constant at ¥27.31/ton·100mg; beyond it the price jumps to ¥3.56 (the salt-vs-carrier segment).

### 3.3 Price breakpoints

Objective-coefficient ranging on the final tableau gives each ingredient's exact basis-stable price interval: an upper bound for ingredients in use ("how high before a basis change") and a lower bound for unused ones ("how low before entry") — e.g. classic 2608: YE enters at ¥4.929304, NaCl basis-change at ¥37/3 ≈ 12.33, KCl upper-bounded by ∞ (the recipe is pinned by feasibility). Every breakpoint is then probed by a ±0.01 re-solve that reports **whether the recipe actually changes** — "basis changes, recipe does not" at pinned vertices is ordinary degeneracy and is labelled as such, never sold as a swap signal.

### 3.4 Parametric curve and quality frontier

- **G1 sodium parametric curve**: walk downward from 4716 via the RHS ranges; each segment (range × shadow price) comes from one exact solve. Extended palette, four segments: [2612, 4716]×¥27.31 (KCl substitution) → [2378.25, 2612]×¥41.71 (I+G displacing MSG) → [1641.375, 2378.25]×¥78.20 (potassium-lactate masking relaxes KCl) → [1494, 1641.375]×¥95.17 (citric-acid gain). **Four technical routes activate at different sodium prices — the "what to buy first, what later" procurement structure** (the segmented realization of Survey §3.4's route map). Segment slopes are cross-checked against central differences.
- **G2 quality frontier**: an ε-constraint scales all nine AAS floors by λ; minimum cost is swept and the feasibility ceiling λmax bisected to 1/512 — S2 λmax = 1.0645 on v01, and 563/512 ≈ 1.0996 on v02.

## 4. "1+6" full constraints (GB 28050) and disease modes

**1+6 (G1)**: since v0.2 the six nutrients carry **literature-typical coefficients** (per-ingredient `n6` fields, all to be calibrated), behind a page switch:

- **Demo preset** (energy 1700 kJ / protein 0 / fat 3 / saturates 1 / carbohydrate 90 / sugars 5 per 100 g): a typical pack keeps all six rows slack — showing the shape and headroom;
- **GB-claims preset** (sugars 0.5 = "sugar-free", fat 3 = "low-fat (solid)", saturates 1.5 = "low saturates" thresholds; energy/protein/carb keep demo values — no meaningful claims for this category): the sugar-free threshold **conflicts head-on with the 2 g sweetness floor → infeasible, reported honestly** (resolving it needs a sweetener variable, e.g. the sucralose seen on real labels — a v0.3 question).

**Disease modes (G1, RHS-swap demo)**:

| Mode | RHS | Mapping (demo assumption, to be calibrated) | Outcome |
|---|---|---|---|
| Standard | slider | — | — |
| Hypertension | Na ≤1875 | Adult Hypertension Dietary Guideline (2023): sodium ≤2000 mg/d, salt <5 g/d; one 8 g packet carries 7.5% of the daily budget → 150 mg/packet | Classic palette **infeasible** (floor 2608); extended solves at 0.4299 ¥/100g (masking relaxes KCl to 9.71 g + I+G 0.25 g) — **expansion unlocks lower sodium** |
| CKD, K-capped | Na ≤1875 and K ≤3000 | Adult CKD Dietary Guideline (2024): limit phosphorus, control potassium; K mapped to 240 mg/packet | **Infeasible**: KCl (524 mg K/g) and potassium lactate (305) both carry potassium — capping K squeezes the salt-substitute route out, exactly the clinical caution that CKD patients avoid KCl substitutes; remaining routes are I+G / acid / microstructured salt |

Disease modes are not individual dietary advice; the budget shares are demo assumptions.

## 5. Honesty checks and reconciliation

Three known document discrepancies — **recomputation wins, trail preserved, audit history untouched**:

| # | Document caliber | Exact recomputation / original-report transcription | Handling |
|---|---|---|---|
| 1 | G2 case S1 "all nine ≥1.31" | Minimum is Lys ≈ **1.238** (1.31 happens to be Val; likely not the min) | The demo recomputes live; recorded here and on the page |
| 2 | G1 audit-table first shadow-price segment ¥27.6 | 161/5895000 ≈ **¥27.31** (27.6 came from rounding the 4-decimal costs) | Page shows the live exact value; external wording stays "¥27 (range 27.2–27.6)" |
| 3 | G2 scoring patterns (transcribed) "FAO 2013 adult/preschool" | Checked against the FAO 2013 original report (transcribed 2026-10-23): the "adult" 15/30/59/45/22/38/23/6/39 is in fact the **2007 >18-y maintenance pattern** (listed in the 2013 report's Table 3 but not recommended for scoring; Table 5 recommends 16/30/61/48/23/41/25/6.6/40 for ages 3+); the "preschool" SAA/Thr/Trp cells (31/34/11) disagree with Table 5's child 6 mo–3 y (27/31/8.5) | v01 keeps the transcribed values (anchors untouched, caliber annotated); v02 uses Table 5 originals. Data caliber changes conclusions: on v02, S2′ (pure blending to preschool level) flips from feasible to infeasible |

All deltas shown are exact solver values rounded live (e.g. the exact LP-baseline delta 575.72 → displayed +576).

## 6. Disclaimer and claims channel

- This tool and all its figures are **demo-grade**: literature/illustrative coefficients (v02: authoritative data transcribed) + exact solving; direction and magnitude discussion only;
- **Not nutritional or medical advice; not a commercial quotation**; disease modes are demo mappings of guideline targets, not individual dietary advice;
- Price anchors were retrieved 2026-08–10 from public channels (USDA FDC / FAO 2013 transcribed 2026-10-23) and change with markets/versions; USDA data is US-government public domain, redistributed here with entry IDs;
- Product claims go only through the **nutrient-content channel** (GB 28050); no disease-prevention/treatment claims;
- GB 14880 compliance of DL-methionine in food is a production-grade prerequisite; it is a purely mathematical variable in this demo;
- Found an error? Open an issue — public correction, trail preserved.

## 7. Changelog

- **v0.2.1 (2026-10-23, performance & honesty maintenance)**: G2 interaction performance — the hidden tab is rendered lazily (page load no longer pre-pays the full G2 computation); G2 renders in two stages (recipe / cost / dual report paint first; price breakpoints and the quality frontier yield the main thread and fill in asynchronously behind a "computing…" placeholder); the quality frontier is memoized per scenario × data profile × prices (same-key re-render ~0.7s → ~0.05s); frontier bisection probes stop after simplex phase 1 (`feasibilityOnly`), sample points and breakpoint probes skip dual/range exports (`light`), λ=1 reuses the base solve; whole-JSON deep copy replaced by a shallow structural copy. Results and all 21 anchors are unchanged (zero change to the exact arithmetic). Honesty fixes: under a disease mode the G1 parametric curve no longer plots the disease-mode cost point onto the standard-mode curve (marker drawn only in standard mode); when every cap is infeasible the curve shows an explanatory note instead of a blank. G1 sliders are rAF-coalesced. Known limitation (pre-existing): provenance `source` strings are Chinese-only (citation names remain readable); bilingual provenance is slated for v0.3.
- **v0.2.0 (2026-10-23)**: G1 palette 5→12 (I+G / citric acid / mushroom / kelp / spices / potassium lactate / sugar) + bitterness-masking, sweetness, spice and potassium rows; G2 7→10 (vital wheat gluten / yeast protein / sunflower protein) + USDA FDC per-cell matrices (4 entries transcribed, 2 fallbacks recorded) + FAO 2013 Table 5 patterns + per-ingredient digestibility; solver exports reduced costs / alternate optima / RHS ranges / price ranges (exact rationals) and fixes a latent record-block pivoting bug; data-driven constraint assembly (one core for G1/G2); weapons panels — full dual report, price breakpoints (±ε re-solve probes), the G1 four-segment parametric curve (27.31→41.71→78.20→95.17), the G2 quality frontier (bisected λmax); disease modes (hypertension / CKD K-capped) and a live 1+6 switch (demo / GB-claims presets); reconciliation item 3 (FAO pattern cells); tests 12→21, all green.
- **v0.1.0 (2026-10-23)**: First release. G1 five tiers + dual baselines + shadow price + sodium ladder; G2 six scenarios + crystal amino acids + gap panel; the caliber trio built in; 12 exact assertions; bilingual; MIT + CC-BY 4.0.

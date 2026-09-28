# 01. Shaft and Beam Workbench

New tool. Supports unit module 4 (transmission shaft) and the capstone pulley shaft in module 5. Mockup: `mockups/01-shaft-beam-workbench.html`.

## 1. Purpose

Students place bearings and loads on a shaft, then see the reactions, shear and bending moment diagrams, the torque diagram, the stresses along the shaft, the safety factor at the critical section and the diameter needed for a target safety factor. The tool turns the hardest example problem in the unit into one students can predict step by step.

### Learning targets

Students can:

1. Find bearing (support) reactions by taking moments about one support.
2. Sketch and read shear force and bending moment diagrams for point loads.
3. Compute torque from power and speed.
4. Compute bending stress and torsional shear stress in a solid round shaft.
5. Combine them with the maximum shear stress rule and compute a safety factor.
6. Explain why diameter has a cubic effect on stress.
7. Size a shaft for a required safety factor.

## 2. Scope

### In version 1

- Two modes: Beam (bending only, no torque) and Shaft (bending plus torque).
- One solid round shaft of uniform diameter.
- Two supports: a pin at station A and a roller at station B, span L between them.
- Up to 6 point loads, perpendicular to the shaft, all in one plane, upward or downward. Loads may sit between the supports or on an overhang beyond either support (overhang toggle).
- A torque segment: torque T carried between an input station and an output station.
- Stress concentration factors Kb (bending) and Kt (torsion) at the critical section, default 1.
- Failure rules: maximum shear stress (Tresca), default; distortion energy (von Mises), extension switch.
- Deflection curve and maximum deflection, extension panel.
- Import of shaft loads from the Gear Train Workbench and from the Conveyor Designer (JSON).

### Later, not in version 1

- Loads in two perpendicular planes combined by vector sum of moments (needed when several gears push in different directions). Version 1 detects this case on import and warns.
- Stepped shafts, hollow shafts, fatigue (Goodman, endurance limit), bearing life.

## 3. Model and math

All positions x are measured from support A along the shaft, in mm. Support B is at x = L. Loads Pᵢ are positive downward, at positions aᵢ.

### 3.1 Reactions (statics)

Moments about A: R_B = Σ(Pᵢ · aᵢ) / L. Vertical balance: R_A = ΣPᵢ − R_B. This holds for loads on overhangs too (aᵢ < 0 or aᵢ > L). A negative reaction means the support pulls down; show it with a downward arrow and the note "this bearing is pulled, not pushed."

Source check: a single load P at distance a from A and b from B gives R_A = Pb/L and R_B = Pa/L; a centered load gives P/2 each and M_max = PL/4 (Optimal Beam). Moments about a point: OpenStax College Physics 2e, 9.2.

### 3.2 Shear and bending moment

- Evaluate at every load and support station plus at least 400 evenly spaced stations along the full modeled length (including overhangs).
- Shear V(x) is the sum of vertical forces to the left of x (reactions up positive, loads down negative).
- Bending moment M(x) is the sum of moments of forces to the left of x about x. Sagging positive.
- Mark |M|max and its station.

### 3.3 Torque

- Shaft mode inputs: either torque T directly, or power P and speed N with T = P/ω and ω = 2πN/60 (OpenStax University Physics Vol. 1, 10.8).
- Torque is T between the input station and the output station and zero elsewhere. Default: input at A, output at the heaviest load station.

### 3.4 Stress at a section (solid round, diameter d)

- Bending stress σ = 32·Kb·M / (π d³).
- Torsional shear stress τ = 16·Kt·T / (π d³).
- Tresca: τ_max = (16 / (π d³)) · √((Kb M)² + (Kt T)²). Allowable τ = Sy / (2n). Safety factor n = Sy / (2 τ_max).
- von Mises (extension): σ′ = √(σ² + 3τ²). Safety factor n = Sy / σ′.
- Required diameter for target n:
  - Tresca: d = ∛[16 · √((Kb M)² + (Kt T)²) / (π · Sy / (2n))]
  - von Mises: d = ∛[(32 n / (π Sy)) · √((Kb M)² + 0.75 (Kt T)²)]. This follows from substituting σ and τ above into σ′.
- Critical section: the station with the lowest safety factor. Evaluate every station, not only the |M|max station, because torque may not reach it.
- Sources: Omni Calculator shaft size (32M/πd³, 16T/πd³, Tresca combined form); Reuven Engineering Tools shaft design (τ_allow = Sy/2n, Kb and Kt placement, worked example); Steltech combined torsion and bending (von Mises √(σ² + 3τ²)).

### 3.5 Deflection (extension panel)

- Second moment of area I = π d⁴ / 64.
- Deflection y(x) from double numerical integration of M(x)/(E I) with y = 0 at both supports.
- Validate against the closed form for a centered load: δ_max = P L³ / (48 E I) (Optimal Beam).
- Show the deflected shape exaggerated with a scale label ("drawn 200× actual").

### 3.6 Stress concentration note

When Kb or Kt is above 1, show the note: "Shoulders, keyways and holes raise local stress. Factors of 2 or more are typical at keyways. Take values from a reference chart." (Fiveable shaft design guide.)

## 4. Inputs and controls

| Input | Symbol | Unit | Range | Default | Step | Notes |
|---|---|---|---|---|---|---|
| Mode | | | Beam, Shaft | Shaft | | |
| Span between supports | L | mm | 20 to 3000 | 300 | 1 | |
| Overhang left, right | | mm | 0 to L | 0, 0 | 1 | Hidden unless overhang toggle is on |
| Load magnitude | Pᵢ | N | −20,000 to 20,000 | 1000 | 1 | Negative means upward |
| Load position | aᵢ | mm | within modeled length | L/2 | 1 | Drag handle or type |
| Load label | | text | 20 characters | "Gear 1" | | Shown on drawing |
| Torque entry method | | | Torque, Power and speed | Power and speed | | |
| Torque | T | N·m | 0 to 5000 | 15.9 | 0.1 | |
| Power | P | W | 0 to 100,000 | 500 | 1 | |
| Speed | N | rpm | 1 to 20,000 | 300 | 1 | |
| Torque input, output stations | | mm | within modeled length | 0, L/2 | 1 | |
| Diameter | d | mm | 1 to 500 | 20 | 0.1 | |
| Yield strength | Sy | MPa | 1 to 3000 | 400 | 1 | Placeholder preset list, see 00 section 9 |
| Elastic modulus | E | GPa | 0.1 to 400 | 200 | 1 | Deflection panel only |
| Target safety factor | n | | 1 to 10 | 2 | 0.1 | |
| Kb, Kt | | | 1 to 5 | 1, 1 | 0.1 | |
| Failure rule | | | Tresca, von Mises | Tresca | | von Mises behind "Extension" switch |

## 5. Interactions

1. Add load: click Add load, then click the shaft. The load appears with a drag handle. Keyboard: select the shaft, press A, then arrow keys move the load 1 mm (Shift for 10 mm).
2. Drag or type position and magnitude. All diagrams update live.
3. Toggle overhang to allow loads beyond a support. A load dragged past a support without overhang enabled stops at the support and shows a hint.
4. Switch Beam and Shaft modes. Beam mode hides torque inputs, the torque diagram and torsional stress.
5. Import loads: Load → Import shaft loads. Accepts the Gear Train Workbench shaft-load export and the Conveyor Designer pulley-shaft export (schema in section 7). The dialog lists loads found and asks the student to place each one along the shaft. If imported loads act in different directions (angles more than 5° apart), show: "These loads push in different directions. Version 1 treats them as one plane, which is only exact when they line up. Your teacher may want the two-plane version." and use their magnitudes.
6. Find diameter: button solves the required d for the target n and offers "Use this diameter", which rounds up to the next 0.5 mm.
7. Click any point on the moment diagram to read V, M, σ, τ and n at that station. The station readout is keyboard reachable.

## 6. Outputs

### Drawing (top to bottom, shared x axis)

1. Shaft with supports, loads (arrows with values and labels), reaction arrows with values, torque input and output markers.
2. Shear force diagram, filled, zero line, values at jumps.
3. Bending moment diagram, filled, |M|max labeled with value and station.
4. Torque diagram (Shaft mode).
5. Safety factor along the shaft (Shaft mode), with a horizontal line at the target n and the critical section marked.
6. Deflection curve (extension panel).

### Readout table

- R_A, R_B (N)
- |M|max (N·m) and station (mm)
- T (N·m)
- At the critical section: M, T, σ, τ, τ_max or σ′ (MPa)
- Safety factor n, with pass or fail against the target
- Required diameter for target n (mm)
- Max deflection (mm) and its station, extension panel

Predict first targets: R_A, |M|max, n at the critical section, required diameter.

## 7. Import schema (shaft loads)

A JSON object with `schema: "shaft-loads"`, `schemaVersion: 1`, `source` (tool name), `units: { force: "N", torque: "N·m" }`, and a `loads` array. Each load has `label`, `magnitude` (N, positive), `angleDeg` (direction in the source drawing, 0° = +x of the source sheet, counterclockwise positive), and optional `torque` (N·m) carried by that element. The Gear Train Workbench upgrade (file 08, item 4) and the Conveyor Designer (file 05) produce this format.

## 8. Test cases

| ID | Setup | Expected |
|---|---|---|
| SB-1 | Beam mode. L = 300 mm, one load 1000 N at 150 mm | R_A = R_B = 500 N. M_max = 75.0 N·m at 150 mm |
| SB-2 | Beam mode. L = 2000 mm, 600 N at 500 mm | R_A = 450 N, R_B = 150 N. M_max = 225 N·m at 500 mm |
| SB-3 | Beam mode, overhang right 50 mm. L = 200 mm, 100 N at 250 mm | R_B = 125 N up, R_A = −25 N (pulled down). |M|max = 5.00 N·m at x = 200 mm (support B) |
| SB-4 | Shaft mode. M and T entered directly through a test hook: M = T = 1000 N·m (1.0 × 10⁶ N·mm), Sy = 400 MPa, n = 2, Tresca | Required d = 41.6 mm. At d = 41.6 mm: σ = 141.5 MPa, τ = 70.7 MPa, σ′ = 187 MPa (matches Reuven worked example) |
| SB-5 | Same as SB-4, von Mises | Required d = 40.7 mm (Reuven reports 40.7 mm) |
| SB-6 | Shaft mode. L = 300 mm, 1000 N at 150 mm, P = 500 W at 300 rpm, torque from A to 150 mm, d = 20 mm, Sy = 400 MPa, Tresca | T = 15.9 N·m. At 150 mm: σ = 95.5 MPa, τ = 10.1 MPa, τ_max = 48.8 MPa, n = 4.10. Required d for n = 2: 15.7 mm |
| SB-7 | SB-6 with von Mises | σ′ = 97.1 MPa, n = 4.12 |
| SB-8 | Torque only: T = 10 N·m, allowable τ entered as Sy = 100 MPa with n = 1 (τ_allow = 50 MPa), no loads | Required d = 10.1 mm (10.06) |
| SB-9 | SB-6 with d doubled to 40 mm | σ, τ, τ_max each exactly 1/8 of SB-6 values. n = 32.8 |
| SB-10 | SB-6 with Kb = Kt = 2 | τ_max = 97.6 MPa, n = 2.05 (half of SB-6) |
| SB-11 | Deflection. L = 300 mm, 1000 N at center, d = 20 mm, E = 200 GPa | I = 7854 mm⁴. δ_max = 0.358 mm at 150 mm, within 0.5% of PL³/48EI |
| SB-12 | Torque segment check. SB-6 but torque carried only from 200 mm to 300 mm | At 150 mm τ = 0, τ_max = σ/2 = 47.7 MPa, n = 4.19. At 200 mm M = 50.0 N·m with T = 15.9 N·m, n = 5.99. Critical section reported at 150 mm with n = 4.19. The tool must find this by scanning all stations |
| SB-13 | Validation. d = 0, then L = 0 | Field messages "Diameter must be greater than 0 mm." and "Span must be greater than 0 mm." No NaN anywhere |
| SB-14 | Zero load, zero torque | n shows "not defined: no load" instead of Infinity |
| SB-15 | Import a Workbench file with two loads at 0° and 90° | Warning message from section 5 step 5 appears. Loads placed at chosen stations |

## 9. Acceptance criteria

- [ ] All test cases pass in the Node test runner and match in the interface.
- [ ] Moving a load updates every diagram in under 50 ms on a mid-range Chromebook.
- [ ] Show the working lists the reaction calculation, M at the critical section, T, σ, τ, the combined value, n and the required diameter, each with substituted numbers and units.
- [ ] Predict first hides R_A, |M|max, n and required d, and the moment peak label on the drawing.
- [ ] Exported report reproduces the diagrams and every readout.
- [ ] Keyboard-only session can add, move and delete loads and read the station readout.

## 10. Sources

- Optimal Beam, simply supported beam: https://optimalbeam.com/engineering-guides/simply-supported-beam
- Omni Calculator, shaft size: https://www.omnicalculator.com/physics/shaft-size
- Reuven Engineering Tools, shaft design: https://reuven.tools/tools/shaft-design/
- Steltech, combined torsion and bending: https://steltech.co/en/genel-en/how-to-calculate-combined-torsion-and-bending-in-shafts/
- Fiveable, shaft design and analysis: https://fiveable.me/elements-mechanical-engineering-design/unit-9/shaft-design-analysis/study-guide/AKaXbq1Ti6ao3oRz
- Engineering Hulk, column buckling page (I = πD⁴/64 for a solid circle): https://engineeringhulk.com/mechanical/strength-of-materials/column-buckling/
- OpenStax College Physics 2e, 9.2: https://openstax.org/books/college-physics-2e/pages/9-2-the-second-condition-for-equilibrium
- OpenStax University Physics Vol. 1, 10.8: https://openstax.org/books/university-physics-volume-1/pages/10-8-work-and-power-for-rotational-motion

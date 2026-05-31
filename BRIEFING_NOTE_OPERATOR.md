# Safety Monitor — Operator Briefing Note

## 1. What It Is

Your airline's safety data submission and monitoring portal within a national Safety Management System (SMS). You upload safety reports (MORs, VSRs, Hazard Logs, Diversion reports) and get immediate automated processing: PII anonymization, risk scoring, alert generation, and taxonomy classification — all tenant-isolated so your data is visible only to your airline and the regulator (as anonymous aggregates).

Aligned with **ICAO Annex 19, Amendment 2** (Safety Management), **Doc 9859 4th Ed** (SMM), and **Doc 10959** (Safety Intelligence Manual).

## 2. How It Works (Operator View)

1. **Upload** your Excel safety data (Master Logsheet, Occurrence Log, Hazard Logsheet, Safety Deficiency, Diversion sheets) via the Upload tab.
2. **Automated processing** happens immediately:
   - PII is redacted from descriptions and encrypted (AES-256-GCM) — original data stored separately, accessible only to authorized personnel
   - Occurrence dates are normalized to the Monday of the week
   - Risk level calculated: Severity × Probability = 1–25 (Low/Medium/High/Critical)
   - Taxonomy classification assigns ICAO ADREP occurrence category, event type, and hazard category based on description keywords
   - Alert rules are evaluated: matching signals generate alerts (in-app, and email for CRITICAL level)
3. **Dashboard (My Signals tab)** shows:
   - Summary cards: total signals, average risk level, pending count, types breakdown
   - Charts: signals by type (bar), risk level distribution (doughnut)
   - Recent signals table (latest 100)
4. **Industry risks** declared by the regulator are visible in the Top Risks register.
5. Your data contributes anonymously to the regulator's **cross-industry SPI aggregation** — raw data is never shared.

## 3. ICAO Requirements Met

### ICAO Annex 19, 2nd Edition — Safety Management

| Section | Requirement | How Your Participation Satisfies It |
|---------|-------------|--------------------------------------|
| §5.1 | Safety data collection | Upload MORs, VSRs, Hazard reports, Diversions via Excel or API |
| §5.2 | Risk assessment | Every signal receives Severity × Probability risk scoring |
| §5.3 | Hazard identification | Keyword-based taxonomy classification aligns with ICAO ADREP codes |
| §5.4 | Just Culture protection | PII is automatically redacted and encrypted; reporter anonymity preserved |
| §6.1 | SPI contribution | Your signals feed into regulator's industry-level SPI aggregation |

### ICAO Doc 9859, 4th Edition (SMM)

| Section | Requirement | How Your Participation Satisfies It |
|---------|-------------|--------------------------------------|
| Ch.4 | Hazard identification | Structured taxonomy classification of every signal |
| Ch.5 | SMS operation | Defined roles (admin uploads, member views) with tenant isolation |
| Ch.6 | Safety performance monitoring | Dashboard charts show your own risk trends and signal patterns |

### ICAO Doc 10959 — Safety Intelligence Manual

- Your data contributes anonymously to industry Just Culture metrics (reporting rate, health score, trend analysis)
- Regulator computes benchmarks without exposing your raw data

### EU 376/2014

- Report types (MOR, VSR, Hazard) align with EU Occurrence Reporting Regulation categories

## 4. What the Application Does Automatically

| Process | What It Does for You |
|---------|----------------------|
| PII Anonymization | Redacts names ("Pilot: John Smith" → "Pilot: [REDACTED]"), flight numbers, tail numbers; shifts dates to Monday of the week; encrypts original data |
| Taxonomy Classification | Reads description text → assigns ICAO ADREP occurrence category (e.g., ARC, LOC-I, FUEL), event type, and hazard category (OPS/TECH/GRD/ENV/SEC/HF) |
| Risk Scoring | Severity × Probability = Risk Level (1–25) with color-coded bands |
| Alert Evaluation | Checks every signal against your airline's alert rules; creates in-app alerts; sends email for CRITICAL-level events |
| SPI Aggregation (Regulator) | Your anonymized data is aggregated with other operators — your individual signals are never exposed |
| Just Culture Metrics | Your voluntary report counts contribute to regulator's industry health score |

## 5. What You Must Do

| Task | Frequency | Description |
|------|-----------|-------------|
| Upload safety data | Per reporting period | Export your Excel sheets (Master Logsheet, MOR, VSR, Hazard, Diversion) and upload via the Upload tab — supports batch upload (up to 10 files) |
| Monitor dashboard | Regularly | Review your signals, risk distribution, and type breakdown on My Signals tab |
| Review alerts | As triggered | Check alerts in the alerts table; acknowledge CRITICAL alerts |
| Review Industry Top Risks | As published | Regulator declares and ranks industry risks; visible to your airline but not downloadable as raw data |

## 6. Gaps — Not Yet Implemented

| Gap | Impact for Operators |
|-----|---------------------|
| No signal update/edit | Once uploaded, you cannot update status or taxonomy assignment — no PUT/PATCH endpoint exists |
| No signal delete | No endpoint to remove erroneous signal submissions |
| No pagination on signals list | If you have thousands of signals, the table shows the latest 100 but the API returns all rows |
| No user self-registration | Users must be created manually in the database by an administrator |
| No corrective action tracking | If the regulator requests corrective actions, there is no system to track them here |
| No real-time updates | Dashboard requires manual page refresh to see new data |
| Rate-based SPIs pending | Metrics are not yet normalized by total operations, so cross-operator comparison is not available |

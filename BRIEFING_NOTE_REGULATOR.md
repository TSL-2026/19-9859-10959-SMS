# Safety Monitor — Regulator Briefing Note

## 1. What It Is

A multi-tenant safety data aggregation and analysis platform designed for National Aviation Safety Regulators (e.g., CAA) to collect, process, and monitor safety signals from multiple operators under a single Safety Management System (SMS). Aligned with **ICAO Annex 19, Amendment 2** (Safety Management), **Doc 9859 4th Ed** (Safety Management Manual), and **Doc 10959** (Safety Intelligence Manual).

## 2. How It Works (Regulator View)

1. **Operators upload data** via Excel or API into their own tenant-isolated database partition.
2. **Automated processing** applies on every signal: PII redaction + encryption, keyword-based taxonomy classification (27 ICAO ADREP occurrence categories, 47 event types, 6 hazard categories), risk scoring (Severity × Probability = 1–25), and alert rule evaluation.
3. **Aggregated regulator dashboard** presents cross-tenant SPI metrics, trend charts, and taxonomy distributions — all computed on-demand via SECURITY DEFINER SQL functions that bypass tenant isolation to return anonymous, aggregated industry totals.
4. **Just Culture dashboard** calculates reporting rate (actual vs. expected voluntary reports), health score, trend direction, diversity score, and ICAO benchmark comparison.
5. **Top Risks register** allows the regulator to declare, rank, and maintain an industry-level risk register visible to all operators.
6. **PDF export** generates an Annex 19-formatted SPI report from current dashboard data.

## 3. ICAO Requirements Met

### ICAO Annex 19, 2nd Edition — Safety Management

| Section | Requirement | Status |
|---------|-------------|--------|
| §5.1 | Safety data collection systems (MOR, VSR, Hazard reports) | Met — full multi-type ingestion pipeline |
| §5.2 | Risk assessment methodology (SMM-compliant matrix) | Met — Severity × Probability = Risk Level algorithm with 4 bands |
| §6.1 | SPIs for monitoring safety performance | Met — 6 SPI charts with taxonomy drill-down filters |
| §5.3 | Data analysis for hazard identification | Met — keyword-based taxonomy classification + trend analysis |
| §5.4 | Just Culture principles for voluntary reporting | Met — Just Culture metrics dashboard with anonymity guarantees |
| §7.1 | Safety communication and promotion | Met — operator-visible Top Risks register, public documentation |

### ICAO Doc 9859, 4th Edition — Safety Management Manual (SMM)

| Section | Requirement | Status |
|---------|-------------|--------|
| Ch.4 | Hazard identification and risk management process | Met — structured hazard categories + risk matrix |
| Ch.5 | SMS implementation and operation | Met — multi-tenant SMS with defined roles (admin/member/regulator) |
| Ch.6 | Safety assurance — monitoring and measurement of safety performance | Met — SPI trends, alerts, taxonomy aggregation |
| Ch.9 | SMS documentation and records | Met — PII-encrypted records, PDF exports |

### ICAO Doc 10959 — Safety Intelligence Manual

| Section | Requirement | Status |
|---------|-------------|--------|
| Ch.1 | Principles of safety intelligence | Met — cross-tenant aggregation without raw data exposure |
| Ch.3 | Data-driven decision-making | Met — Just Culture metrics, trend analysis, recommendation engine |
| Ch.4 | Industry benchmarking | Met — ICAO 80% benchmark, best-in-class comparison, per-tenant rates |
| Ch.5 | Safety culture measurement | Met — reporting rate, health score, diversity score, trend monitoring |

### Regulatory Alignment

| Regulation | Alignment | Status |
|-----------|-----------|--------|
| EU 376/2014 | Occurrence reporting classification (MOR/VSR) | Met |
| ICAO ADREP | 27 occurrence categories, 47 event types | Met — taxonomy system |

## 4. What the Application Does Automatically

| Process | Details |
|---------|---------|
| PII Anonymization | Redacts names, flight numbers, tail numbers; normalizes dates to Monday of week; encrypts original data with AES-256-GCM |
| Taxonomy Classification | Keyword-maps description text to ICAO ADREP occurrence category, event type, and hazard category |
| Risk Scoring | Computes Severity × Probability on every signal |
| Alert Evaluation | Matches signals against tenant alert rules; generates in-app + email alerts for CRITICAL events |
| Cross-Tenant Aggregation | SECURITY DEFINER functions compute industry-level totals, distributions, trends without exposing individual operator data |
| Just Culture Metrics | On-demand calculation of reporting rate, health score, trend, diversity, recommendations |
| Filter Re-calculation | Taxonomy drill-down filters recompute all 6 SPI charts in real time |

## 5. What the Regulator Must Do

| Task | Frequency | Description |
|------|-----------|-------------|
| Monitor SPI Dashboard | Regularly | Review summary cards, trend charts, taxonomy distributions for emerging risks |
| Monitor Just Culture | Monthly | Track reporting rate, health score, diversity; review automated recommendations |
| Declare Top Risks | As needed | Add, rank, describe, and deactivate industry-level top risks visible to operators |
| Export PDF Reports | Per reporting period | Click Export PDF for Annex 19-formatted SPI reports |
| Review Operators | As needed | Verify data quality by checking per-tenant signal volumes and patterns |
| Initiate Data Collection | One-time / Annual | Coordinate with operators to ensure Excel files or API integrations are set up |

## 6. Gaps — Not Yet Implemented

| Gap | Impact | Priority |
|-----|--------|----------|
| Rate-based SPIs (normalized by operations) | Current SPI counts are raw totals, not normalized; prevents fair cross-operator comparison | High |
| Corrective action tracking | No system to track safety assurance closure; regulator cannot verify actions taken | High |
| Automated scheduled reports | No cron/email-based report distribution; PDF export is manual only | Medium |
| Real-time updates | No WebSocket/polling; dashboard refresh requires page reload | Medium |
| Signal status updates | No API endpoint to update status (open/investigation/closed); regulator cannot track resolution | Medium |
| No seeder-supplied alert rules | Demo alert rules are minimal; no rules for Just Culture triggers | Low |
| Component breakdown in Just Culture | Dashboard references placeholder; always shows "No data" | Low |
| Bull queue not wired | All processing is synchronous; no background job visibility | Low |
| No `excel_imports` audit writing | Import audit table exists but is never written to | Low |

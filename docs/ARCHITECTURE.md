# Application Architecture & Action Flow

## Role-Based Access

```mermaid
graph LR
    JWT[JWT: tenant_id + role] --> ADMIN[admin]
    JWT --> MEMBER[member]
    JWT --> REG[regulator]

    ADMIN -->|Upload + View| A1[Own signals]
    MEMBER -->|View only| M1[Own signals]
    REG -->|View aggregates| R1[Cross-tenant SPI / Just Culture]
```

| Role | Description | Can Upload | Can View |
|------|-------------|-----------|----------|
| `admin` | Safety department | ✅ Yes (own tenant) | Own signals + Upload tab |
| `member` | Operator staff | ❌ No | Own signals only |
| `regulator` | Regulatory authority | ❌ No | Cross-tenant aggregates |

---

## Upload & Processing Flow

```mermaid
flowchart TD
    subgraph Upload["Upload (Dashboard / API)"]
        ADMIN[Admin user<br/>JWT: admin role] --> BATCH[POST /api/import/batch]
        BATCH --> AUTH{authenticate + requireAdmin}
        AUTH -->|JWT valid, role=admin| PARSE[parseMultipleExcelFiles]
        AUTH -->|Rejected| ERR[403 Forbidden]
    end

    subgraph Parser["Excel Parser (excelParser.js)"]
        PARSE --> SHEET1[classifySheet name]
        SHEET1 -->|master| M1[processMasterSheet]
        SHEET1 -->|occurrence| M2[processOccurrenceSheet]
        SHEET1 -->|hazard| M3[processHazardSheet]
        SHEET1 -->|safety_defi| M4[processSafetyDeficiencySheet]
        SHEET1 -->|diversion| M5[processDiversionSheet]
        SHEET1 -->|risk_register| SKIP[Skipped - reference]

        M1 & M2 & M3 & M4 & M5 --> REDACT[redactPII inline]
        REDACT --> SIGNALS[signal objects]
    end

    subgraph PII["PII Anonymizer (piiAnonymizer.js)"]
        SIGNALS --> EXTRACT[extractAndRedact]
        EXTRACT --> REDACTED[redacted fields]
        EXTRACT --> ENCRYPTED[AES-256-GCM encrypted originals]
    end

    subgraph Storage["Database Insert (storeSignal)"]
        REDACTED & ENCRYPTED --> TX{BEGIN TRANSACTION}
        TX --> INS1[INSERT safety_signals<br/>tenant scope from JWT]
        TX --> INS2[INSERT pii_store<br/>encrypted PII]
        TX --> COMMIT[COMMIT]
        COMMIT --> RESULT[{ id, ...signalData }]
    end

    subgraph Alerts["Alert Engine (alertEngine.js)"]
        RESULT --> EVAL[evaluateSignal]
        EVAL --> RULES{Match alert_rules?}
        RULES -->|Yes| IN[INSERT alerts]
        RULES -->|No| DONE[Done]
        IN --> EMAIL[Optional: send email via Nodemailer]
    end
```

---

## Query Flows

```mermaid
sequenceDiagram
    participant Op as Operator (admin/member)
    participant Reg as Regulator
    participant Dash as Dashboard
    participant API as Express API
    participant DB as PostgreSQL

    Note over Op,DB: OPERATOR: View own signals
    Op->>Dash: Open dashboard?token=JWT
    Dash->>Dash: Decode JWT → role=admin/member
    Dash->>API: GET /api/signals
    API->>API: authenticate → extract tenant_id
    API->>DB: set_tenant_context(tenant_id)
    API->>DB: SELECT * FROM safety_signals
    DB->>DB: RLS: tenant_id = current_tenant_id()
    DB-->>API: scoped rows
    API-->>Dash: { signals: [...] }
    Dash-->>Op: My Signals tab (cards, charts, table)

    Note over Op,DB: ADMIN: Upload Excel
    Op->>Dash: Upload files in Upload tab
    Dash->>API: POST /api/import/batch (FormData)
    API->>API: authenticate + requireAdmin
    API->>API: parseMultipleExcelFiles → excelParser
    API->>DB: INSERT safety_signals + pii_store (transaction)
    API->>DB: alertEngine.evaluateSignal
    API-->>Dash: { total_signals, details }
    Dash-->>Op: Results table

    Note over Reg,DB: REGULATOR: View cross-tenant aggregates
    Reg->>Dash: Open dashboard?token=JWT
    Dash->>Dash: Decode JWT → role=regulator
    Dash->>API: GET /api/regulator/spis
    API->>API: regulatorAuth → role=regulator
    API->>DB: SELECT regulator_spi_summary()
    DB->>DB: SECURITY DEFINER (bypass RLS)
    DB-->>API: aggregated JSONB
    API-->>Dash: SPI Overview tab (cards, charts, PDF)

    Dash->>API: GET /api/just-culture/health
    API->>DB: SELECT just_culture_health()
    DB-->>API: health metrics JSONB
    API-->>Dash: Just Culture tab
```

---

## Database Schema

```mermaid
erDiagram
    safety_signals {
        uuid id PK
        uuid tenant_id FK
        varchar report_id
        varchar report_type
        date occurrence_date
        int severity
        int probability
        int risk_level
        text description_raw
        varchar status
        varchar source
        boolean is_voluntary
        varchar reporter_role
        varchar assigned_department
        timestamptz created_at
    }

    pii_store {
        uuid id PK
        uuid tenant_id FK
        uuid signal_id FK
        jsonb encrypted_pii
        timestamptz created_at
    }

    alerts {
        uuid id PK
        uuid tenant_id FK
        uuid signal_id FK
        uuid rule_id FK
        varchar alert_level
        timestamptz triggered_at
        timestamptz acknowledged_at
        uuid acknowledged_by FK
    }

    alert_rules {
        uuid id PK
        uuid tenant_id FK
        varchar rule_name
        int severity_threshold
        int probability_threshold
        varchar alert_level
        jsonb channels
        boolean is_active
        timestamptz created_at
    }

    users {
        uuid id PK
        uuid tenant_id
        varchar role
        varchar tenant_type
    }

    excel_imports {
        uuid id PK
        uuid tenant_id FK
        varchar filename
        int row_count
        varchar status
        jsonb error_log
        timestamptz imported_at
    }

    tenant_config {
        int id PK
        uuid tenant_id FK
        jsonb config
        timestamptz created_at
        timestamptz updated_at
    }

    safety_signals ||--o| pii_store : "1-to-1 (optional)"
    safety_signals ||--o{ alerts : "1-to-many"
    alert_rules ||--o{ alerts : "1-to-many"
    users ||--o{ safety_signals : "tenant isolation"
    users ||--o{ alerts : "tenant isolation"
```

### Row Level Security

All data tables have RLS enforced:

```sql
CREATE POLICY tenant_isolation ON safety_signals
  USING (tenant_id = current_tenant_id());
```

### Regulator Bypass (SECURITY DEFINER)

| Function | Returns |
|----------|---------|
| `regulator_spi_summary()` | Total signals, avg risk, alerts, by-type breakdown |
| `regulator_trends(months)` | Monthly signal counts and avg risk |
| `regulator_tenants()` | Per-tenant signal count, avg risk, by-type |
| `just_culture_health()` | Reporting rate, health score, trend, recommendations |
| `just_culture_timeline(months)` | Monthly voluntary report counts |
| `just_culture_benchmark()` | Industry avg, best-in-class, ICAO benchmark |

---

## Migration Order

```mermaid
graph LR
    subgraph Migrations
        001[001_rls] --> 002[002_safety_tables]
        002 --> 003[003_pii_store]
        003 --> 004[004_regulator_functions]
        004 --> 005[005_just_culture]
        005 --> 006[006_tenant_types]
        006 --> 007[007_update_report_types]
        007 --> 008[008_update_status_constraint]
        008 --> 009[009_add_source_assigned_dept]
    end
```

| # | File | Purpose |
|---|------|---------|
| 001 | `001_rls.sql` | RLS infrastructure, users, documents |
| 002 | `002_safety_tables.sql` | safety_signals, alert_rules, alerts, excel_imports |
| 003 | `003_pii_store.sql` | Encrypted PII storage with RLS |
| 004 | `004_regulator_functions.sql` | SECURITY DEFINER aggregation functions |
| 005 | `005_just_culture.sql` | Just Culture columns, tenant_config, analytics |
| 006 | `006_tenant_types.sql` | tenant_type column on users |
| 007 | `007_update_report_types.sql` | Extended report_type CHECK constraint |
| 008 | `008_update_status_constraint.sql` | 'Reported' added to status CHECK |
| 009 | `009_add_source_assigned_dept.sql` | source + assigned_department columns |

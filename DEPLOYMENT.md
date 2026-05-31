# Deployment Guide — Safety Monitor on Google Cloud Platform

> **Goal**: Deploy a live demo for stakeholder review and funding discussions.
> **Estimated time**: 30–45 minutes.
> **Monthly cost**: ~$8–12 (db-f1-micro Cloud SQL, Cloud Run scale-to-zero, Artifact Registry storage).

---

## Prerequisites

- **Google Cloud Project** with [Blaze billing enabled](https://console.cloud.google.com/billing)
- **Tools installed locally**:
  ```bash
  # macOS
  brew install --cask google-cloud-sdk
  brew install terraform docker cloud-sql-proxy

  gcloud auth login
  gcloud config set project YOUR_PROJECT_ID
  ```

---

## Quick Deploy (30 min)

```bash
cd /path/to/19-9859-10959-SMS

# One-command deploy (automates everything below):
./scripts/deploy.sh YOUR_PROJECT_ID
```

---

## Step-by-Step (manual, for understanding)

### 1. Enable APIs

```bash
gcloud services enable \
  cloudrun.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  artifactregistry.googleapis.com \
  vpcaccess.googleapis.com \
  cloudbuild.googleapis.com
```

### 2. Provision Infrastructure

```bash
cd infra

# Copy and edit with your project ID and billing account ID
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — set project_id and billing_account_id
# Find billing account: gcloud billing accounts list

terraform init
terraform apply
```

This creates:
- **VPC** with private IP access for Cloud SQL
- **Cloud SQL PostgreSQL** (db-f1-micro, ~$8/mo, private IP, automated backups)
- **Secret Manager** secrets: `DB_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`
- **Cloud Storage** bucket for uploads (30-day auto-delete)
- **Cloud Run** service (scale-to-zero, public HTTPS endpoint)
- **Service account** with least-privilege roles
- **Budget alert** at $25/mo (50/80/90/100% thresholds)

```bash
# Save outputs for next steps
export CLOUD_RUN_URL=$(terraform output -raw cloud_run_url)
export DB_CONN=$(terraform output -raw cloud_sql_connection_name)
export SA_EMAIL=$(terraform output -raw service_account_email)
```

### 3. Build & Push Docker Image

```bash
# Create Artifact Registry repo
gcloud artifacts repositories create cloud-run-source-deploy \
  --repository-format=docker --location=us-central1

# Build and push
docker build -t us-central1-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/safety-monitor:latest ..
docker push us-central1-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/safety-monitor:latest
```

### 4. Run Database Migrations

```bash
# Fetch secrets from Secret Manager
DB_PASSWORD=$(gcloud secrets versions access latest --secret="DB_PASSWORD")
JWT_SECRET=$(gcloud secrets versions access latest --secret="JWT_SECRET")

# Start Cloud SQL proxy
cloud-sql-proxy --port 5432 "$DB_CONN" &
sleep 3

# Run migrations
DB_HOST=localhost DB_NAME=safety_monitor_prod DB_USER=safety_user DB_PASSWORD="$DB_PASSWORD" \
  node src/db/migrations/run.js

# Seed demo data (1,430 signals, 13 operators, 3 regions)
DB_HOST=localhost DB_NAME=safety_monitor_prod DB_USER=safety_user DB_PASSWORD="$DB_PASSWORD" \
  JWT_SECRET="$JWT_SECRET" \
  node scripts/seed-demo.js
```

### 5. Deploy to Cloud Run

```bash
gcloud run deploy safety-monitor \
  --image us-central1-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/safety-monitor:latest \
  --region us-central1 \
  --add-cloudsql-instances "$DB_CONN" \
  --set-env-vars "DB_NAME=safety_monitor_prod,DB_USER=safety_user,PORT=3000" \
  --set-env-vars "DB_HOST=/cloudsql/$DB_CONN" \
  --set-secrets "DB_PASSWORD=DB_PASSWORD:latest,JWT_SECRET=JWT_SECRET:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest" \
  --service-account "$SA_EMAIL" \
  --allow-unauthenticated
```

### 6. Verify

```bash
curl -s $CLOUD_RUN_URL/health
# → {"status":"ok","db":"connected"}

curl -s $CLOUD_RUN_URL
# → Landing page with live stats and login selector
```

Open the URL in a browser — full demo is ready.

---

## Cost Breakdown (Blaze, demo scale)

| Service | SKU | Est. Monthly |
|---------|-----|-------------|
| Cloud SQL | db-f1-micro (10GB SSD) | $8.03 |
| Cloud Run | 0–10 instances, scale-to-zero | $0–3 |
| Secret Manager | 4 secrets, minimal access | $0 |
| Cloud Storage | 10GB, 30-day lifecycle | $0.02 |
| Artifact Registry | 1 image | $0 |
| **Total** | | **~$8–12/mo** |

Budget alert is set at $25/mo in the Terraform. You'll get email notifications at 50/80/90/100%.

---

## After Deployment

1. **Send stakeholder the URL** — the landing page has live stats, FAQ, and a login dropdown
2. **Demonstrate** sign-in as any operator or the regulator
3. **Submit a Quick Report** at `https://URL/report`
4. **Show SPI charts** with taxonomy/region filters
5. **Walk through workflow** — assign, investigate, resolve signals

---

## Tearing Down (when demo is done)

```bash
cd infra
terraform destroy

# Delete container images
gcloud artifacts docker images delete \
  us-central1-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/safety-monitor:latest
```

#!/usr/bin/env bash
set -euo pipefail

# One-command GCP deployment for Safety Monitor
# Usage: ./deploy.sh [project-id]
# Prerequisites: gcloud, terraform >=1.5, docker, jq, cloud-sql-proxy

PROJECT_ID="${1:-${GCP_PROJECT_ID:?Usage: deploy.sh <project-id>}}"
REGION="${GCP_REGION:-us-central1}"
SERVICE="${CLOUD_RUN_SERVICE:-safety-monitor}"
DB_NAME="${DB_NAME:-safety_monitor_prod}"
DB_USER="${DB_USER:-safety_user}"

echo "============================================"
echo "  Safety Monitor — GCP Deployment"
echo "  Project: $PROJECT_ID"
echo "  Region:  $REGION"
echo "  Service: $SERVICE"
echo "============================================"
echo ""

# --------------------------------------------------
# 1. Set GCP project
# --------------------------------------------------
echo "--- [1/6] Setting GCP project ---"
gcloud config set project "$PROJECT_ID"

# --------------------------------------------------
# 2. Enable required APIs
# --------------------------------------------------
echo ""
echo "--- [2/6] Enabling required APIs ---"
gcloud services enable \
  cloudrun.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  artifactregistry.googleapis.com \
  vpcaccess.googleapis.com \
  cloudbuild.googleapis.com \
  iamcredentials.googleapis.com \
  monitoring.googleapis.com \
  --project="$PROJECT_ID"

# --------------------------------------------------
# 3. Terraform — provision infrastructure
# --------------------------------------------------
echo ""
echo "--- [3/6] Provisioning infrastructure with Terraform ---"

cd "$(dirname "$0")/../infra"

terraform init
terraform apply -auto-approve

CLOUD_RUN_URL=$(terraform output -raw cloud_run_url)
DB_CONN=$(terraform output -raw cloud_sql_connection_name)
SA_EMAIL=$(terraform output -raw service_account_email)
echo "Cloud Run URL: $CLOUD_RUN_URL"
echo "DB Connection: $DB_CONN"

# --------------------------------------------------
# 4. Build & push Docker image
# --------------------------------------------------
echo ""
echo "--- [4/6] Building and pushing Docker image ---"

# Create Artifact Registry repo if needed
gcloud artifacts repositories describe cloud-run-source-deploy \
  --location="$REGION" 2>/dev/null || \
gcloud artifacts repositories create cloud-run-source-deploy \
  --repository-format=docker \
  --location="$REGION" \
  --description="Safety Monitor images"

IMAGE_TAG="$REGION-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/$SERVICE:latest"
docker build -t "$IMAGE_TAG" "$(dirname "$0")/.."
docker push "$IMAGE_TAG"

# --------------------------------------------------
# 5. Run database migrations
# --------------------------------------------------
echo ""
echo "--- [5/6] Running database migrations ---"

# Fetch DB password from Secret Manager
DB_PASSWORD=$(gcloud secrets versions access latest \
  --secret="DB_PASSWORD" \
  --project="$PROJECT_ID")

# Start Cloud SQL proxy
cloud-sql-proxy --port 5432 "$DB_CONN" &
PROXY_PID=$!
trap "kill $PROXY_PID 2>/dev/null || true" EXIT
sleep 5

DB_HOST=localhost DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" \
  node "$(dirname "$0")/../src/db/migrations/run.js"

# Seed demo data
echo "--- Seeding demo data ---"
JWT_SECRET=$(gcloud secrets versions access latest \
  --secret="JWT_SECRET" \
  --project="$PROJECT_ID")
DB_HOST=localhost DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" \
  JWT_SECRET="$JWT_SECRET" \
  node "$(dirname "$0")/../scripts/seed-demo.js"

# --------------------------------------------------
# 6. Deploy to Cloud Run
# --------------------------------------------------
echo ""
echo "--- [6/6] Deploying to Cloud Run ---"

gcloud run deploy "$SERVICE" \
  --image "$IMAGE_TAG" \
  --region "$REGION" \
  --platform managed \
  --add-cloudsql-instances "$DB_CONN" \
  --set-env-vars "DB_NAME=$DB_NAME,DB_USER=$DB_USER,PORT=3000" \
  --set-env-vars "DB_HOST=/cloudsql/$DB_CONN" \
  --set-secrets "DB_PASSWORD=DB_PASSWORD:latest,JWT_SECRET=JWT_SECRET:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest" \
  --service-account "$SA_EMAIL" \
  --allow-unauthenticated \
  --quiet

# --------------------------------------------------
# Smoke test
# --------------------------------------------------
echo ""
echo "--- Smoke test ---"

sleep 10
for i in 1 2 3 4 5; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$CLOUD_RUN_URL/health" 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "SUCCESS — health check passed!"
    echo "Service URL: $CLOUD_RUN_URL"
    echo "Open in browser: $CLOUD_RUN_URL"
    exit 0
  fi
  echo "Retry $i — HTTP $STATUS, waiting 5s..."
  sleep 5
done

echo "ERROR — health check failed after 5 attempts"
curl -v "$CLOUD_RUN_URL/health" 2>&1 || true
exit 1

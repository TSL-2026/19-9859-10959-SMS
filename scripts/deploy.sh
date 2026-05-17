#!/usr/bin/env bash
set -euo pipefail

# One-command GCP deployment for Safety Monitor
# Usage: ./deploy.sh [project-id]
# Prerequisites: gcloud, terraform >=1.5, docker, jq

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
echo "--- [1/7] Setting GCP project ---"
gcloud config set project "$PROJECT_ID"

# --------------------------------------------------
# 2. Enable required APIs
# --------------------------------------------------
echo ""
echo "--- [2/7] Enabling required APIs ---"
gcloud services enable \
  cloudrun.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  vpcaccess.googleapis.com \
  cloudbuild.googleapis.com \
  iamcredentials.googleapis.com \
  monitoring.googleapis.com \
  --project="$PROJECT_ID"

# --------------------------------------------------
# 3. Terraform — provision infrastructure
# --------------------------------------------------
echo ""
echo "--- [3/7] Provisioning infrastructure with Terraform ---"

# Verify required secrets are set
: "${DB_PASSWORD:?Must set DB_PASSWORD}"
: "${JWT_SECRET:?Must set JWT_SECRET}"
: "${ENCRYPTION_KEY:?Must set ENCRYPTION_KEY}"

cd "$(dirname "$0")/../infra"

cat > terraform.tfvars <<EOF
project_id         = "$PROJECT_ID"
region             = "$REGION"
environment        = "dev"
db_password        = "$DB_PASSWORD"
jwt_secret         = "$JWT_SECRET"
encryption_key     = "$ENCRYPTION_KEY"
budget_alert_email = "${BUDGET_ALERT_EMAIL:-admin@example.com}"
billing_account_id = "${BILLING_ACCOUNT_ID:-null}"
EOF

terraform init
terraform apply -auto-approve

CLOUD_RUN_URL=$(terraform output -raw cloud_run_url)
echo "Cloud Run URL: $CLOUD_RUN_URL"

# --------------------------------------------------
# 4. Build & push Docker image
# --------------------------------------------------
echo ""
echo "--- [4/7] Building and pushing Docker image ---"

IMAGE_TAG="$REGION-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/$SERVICE:$(git rev-parse --short HEAD)"
docker build -t "$IMAGE_TAG" "$(dirname "$0")/.."
docker push "$IMAGE_TAG"

# --------------------------------------------------
# 5. Run database migrations
# --------------------------------------------------
echo ""
echo "--- [5/7] Running database migrations ---"

DB_PASSWORD_VALUE="$DB_PASSWORD"

# Start Cloud SQL proxy
cloud-sql-proxy --port 5432 "$PROJECT_ID:$REGION:safety-monitor-db" &
PROXY_PID=$!
trap "kill $PROXY_PID 2>/dev/null || true" EXIT
sleep 5

DB_HOST=localhost DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD_VALUE" \
  node "$(dirname "$0")/../src/db/migrations/run.js"

# --------------------------------------------------
# 6. Deploy to Cloud Run
# --------------------------------------------------
echo ""
echo "--- [6/7] Deploying to Cloud Run ---"

gcloud run deploy "$SERVICE" \
  --image "$IMAGE_TAG" \
  --region "$REGION" \
  --platform managed \
  --quiet

# --------------------------------------------------
# 7. Smoke test
# --------------------------------------------------
echo ""
echo "--- [7/7] Running smoke test ---"

sleep 15
for i in 1 2 3 4 5; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$CLOUD_RUN_URL/health" 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "SUCCESS — health check passed!"
    echo "Service URL: $CLOUD_RUN_URL"
    exit 0
  fi
  echo "Retry $i — HTTP $STATUS, waiting 5s..."
  sleep 5
done

echo "ERROR — health check failed after 5 attempts"
curl -v "$CLOUD_RUN_URL/health" 2>&1 || true
exit 1

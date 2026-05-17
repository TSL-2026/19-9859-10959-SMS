#!/usr/bin/env bash
set -euo pipefail

# Run database migrations against the Cloud SQL instance
# using Cloud SQL Proxy for a secure connection.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

export GCP_PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
export GCP_REGION="${GCP_REGION:-us-central1}"
export CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-safety-monitor-db}"
export DB_NAME="${DB_NAME:-safety_monitor_prod}"
export DB_USER="${DB_USER:-safety_user}"

echo "=== Running migrations for $DB_NAME on $CLOUD_SQL_INSTANCE ==="

# Fetch DB password from Secret Manager
DB_PASSWORD=$(gcloud secrets versions access latest \
  --secret="DB_PASSWORD" \
  --project="$GCP_PROJECT_ID")

# Start Cloud SQL proxy in background
echo "Starting Cloud SQL proxy..."
cloud-sql-proxy --port 5432 "$GCP_PROJECT_ID:$GCP_REGION:$CLOUD_SQL_INSTANCE" &
PROXY_PID=$!
trap "kill $PROXY_PID 2>/dev/null" EXIT

sleep 5

export DB_HOST=localhost
export DB_NAME
export DB_USER
export DB_PASSWORD

echo "Running migrations..."
node "$PROJECT_DIR/src/db/migrations/run.js"

echo "Migrations complete."

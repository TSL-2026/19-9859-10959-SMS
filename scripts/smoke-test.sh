#!/usr/bin/env bash
set -euo pipefail

# Verify the deployment is healthy by hitting the /health endpoint.
# Usage: ./smoke-test.sh <service-url>
#   or:  ./smoke-test.sh (auto-detects URL from gcloud)

if [ $# -ge 1 ]; then
  URL="$1"
else
  GCP_REGION="${GCP_REGION:-us-central1}"
  CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-safety-monitor}"
  URL=$(gcloud run services describe "$CLOUD_RUN_SERVICE" \
    --region "$GCP_REGION" \
    --format='value(status.url)') || {
    echo "Error: Could not auto-detect Cloud Run URL."
    echo "Set CLOUD_RUN_SERVICE and GCP_REGION, or pass a URL as argument."
    exit 1
  }
fi

echo "Smoke testing: $URL"
echo ""

# Endpoint checks
ENDPOINTS=(
  "/health"
  "/api/just-culture/health"
)

ALL_PASSED=true

for EP in "${ENDPOINTS[@]}"; do
  for i in 1 2 3; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL$EP" --max-time 10)
    if [ "$STATUS" = "200" ]; then
      echo "  PASS [$STATUS] $EP"
      break
    fi
    if [ "$i" -eq 3 ]; then
      echo "  FAIL [$STATUS] $EP (after 3 attempts)"
      ALL_PASSED=false
    else
      sleep 2
    fi
  done
done

echo ""
if [ "$ALL_PASSED" = true ]; then
  echo "All smoke tests passed."
  exit 0
else
  echo "Some smoke tests failed."
  exit 1
fi

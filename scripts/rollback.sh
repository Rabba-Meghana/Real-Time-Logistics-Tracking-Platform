#!/usr/bin/env bash
# Scripted rollback — triggered automatically by CI/CD on failed health check
# or manually: ./scripts/rollback.sh <previous_image_tag>

set -euo pipefail

PREV_TAG="${1:-$(cat .previous_tag 2>/dev/null || echo '')}"

if [ -z "$PREV_TAG" ]; then
  echo "Error: no previous tag supplied and .previous_tag not found"
  exit 1
fi

echo "Rolling back to image tag: $PREV_TAG"

export API_IMAGE_TAG="$PREV_TAG"
export FRONTEND_IMAGE_TAG="$PREV_TAG"

docker-compose pull api frontend
docker-compose up -d --no-deps api frontend

echo "Waiting 30s for services to come up..."
sleep 30

HEALTH_URL="${HEALTH_URL:-http://localhost:8000/api/health/}"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL")

if [ "$STATUS" = "200" ]; then
  echo "Rollback succeeded. Health check passed."
else
  echo "Rollback health check failed (HTTP $STATUS). Manual intervention required."
  exit 1
fi

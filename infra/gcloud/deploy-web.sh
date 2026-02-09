#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-softsky-web}"
API_SERVICE_NAME="${API_SERVICE_NAME:-softsky-api}"
API_ORIGIN="${API_ORIGIN:-}"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_EMAIL:-softsky-api@${PROJECT_ID}.iam.gserviceaccount.com}"

MAX_INSTANCES="${MAX_INSTANCES:-100}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
CONCURRENCY="${CONCURRENCY:-80}"
TIMEOUT="${TIMEOUT:-180s}"
MEMORY="${MEMORY:-512Mi}"
CPU="${CPU:-1}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required (or set an active gcloud project)." >&2
  exit 1
fi

if [[ -z "${API_ORIGIN}" ]]; then
  API_ORIGIN="$(gcloud run services describe "${API_SERVICE_NAME}" --project "${PROJECT_ID}" --region "${REGION}" --format='value(status.url)')"
fi

if [[ -z "${API_ORIGIN}" ]]; then
  echo "Could not determine API origin. Set API_ORIGIN explicitly." >&2
  exit 1
fi

echo "Deploying ${SERVICE_NAME} to ${PROJECT_ID}/${REGION}"
echo "API origin: ${API_ORIGIN}"

DEPLOY_ARGS=(
  run deploy "${SERVICE_NAME}"
  --source .
  --project "${PROJECT_ID}"
  --region "${REGION}"
  --allow-unauthenticated
  --port 8080
  --cpu "${CPU}"
  --memory "${MEMORY}"
  --concurrency "${CONCURRENCY}"
  --timeout "${TIMEOUT}"
  --max-instances "${MAX_INSTANCES}"
  --min-instances "${MIN_INSTANCES}"
  --set-env-vars "SOFTSKY_API_ORIGIN=${API_ORIGIN}"
)

if [[ -n "${SERVICE_ACCOUNT_EMAIL}" ]]; then
  DEPLOY_ARGS+=(--service-account "${SERVICE_ACCOUNT_EMAIL}")
fi

gcloud "${DEPLOY_ARGS[@]}"

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" --project "${PROJECT_ID}" --region "${REGION}" --format='value(status.url)')"
echo "Deployment complete for service: ${SERVICE_NAME}"
echo "Frontend URL: ${SERVICE_URL}"

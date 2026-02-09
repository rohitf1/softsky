#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-us-central1}"
FIRESTORE_LOCATION="${FIRESTORE_LOCATION:-nam5}"
SHARE_BUCKET="${SHARE_BUCKET:-${PROJECT_ID}-softsky-shares}"
QUEUE_NAME="${QUEUE_NAME:-softsky-generation}"
SERVICE_ACCOUNT_NAME="${SERVICE_ACCOUNT_NAME:-softsky-api}"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
QUEUE_DISPATCHES_PER_SECOND="${QUEUE_DISPATCHES_PER_SECOND:-250}"
QUEUE_MAX_CONCURRENT_DISPATCHES="${QUEUE_MAX_CONCURRENT_DISPATCHES:-120}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required (or set an active gcloud project)." >&2
  exit 1
fi

echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Bucket: ${SHARE_BUCKET}"
echo "Queue: ${QUEUE_NAME}"

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com \
  cloudtasks.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  --project "${PROJECT_ID}"

if ! gcloud firestore databases describe --database='(default)' --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud firestore databases create \
    --database='(default)' \
    --location="${FIRESTORE_LOCATION}" \
    --type=firestore-native \
    --project "${PROJECT_ID}"
fi

if ! gcloud storage buckets describe "gs://${SHARE_BUCKET}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${SHARE_BUCKET}" \
    --project "${PROJECT_ID}" \
    --location "${REGION}" \
    --uniform-bucket-level-access
fi

if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT_EMAIL}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SERVICE_ACCOUNT_NAME}" \
    --display-name="Softsky API Service Account" \
    --project "${PROJECT_ID}"
fi

if ! gcloud tasks queues describe "${QUEUE_NAME}" --location "${REGION}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud tasks queues create "${QUEUE_NAME}" \
    --location "${REGION}" \
    --max-dispatches-per-second "${QUEUE_DISPATCHES_PER_SECOND}" \
    --max-concurrent-dispatches "${QUEUE_MAX_CONCURRENT_DISPATCHES}" \
    --project "${PROJECT_ID}"
fi

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member "serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role "roles/datastore.user" >/dev/null

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member "serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role "roles/cloudtasks.enqueuer" >/dev/null

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member "serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role "roles/run.invoker" >/dev/null

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member "serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role "roles/secretmanager.secretAccessor" >/dev/null

gcloud storage buckets add-iam-policy-binding "gs://${SHARE_BUCKET}" \
  --member "serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role "roles/storage.objectAdmin" >/dev/null

gcloud iam service-accounts add-iam-policy-binding "${SERVICE_ACCOUNT_EMAIL}" \
  --member "serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role "roles/iam.serviceAccountUser" \
  --project "${PROJECT_ID}" >/dev/null

echo "Bootstrap complete."
echo "Next: run infra/gcloud/deploy-api.sh"

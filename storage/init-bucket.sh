#!/bin/sh
set -e

BUCKET="${S3_BUCKET:-demo-bucket}"
S3="aws --endpoint-url http://rustfs:9000 s3api"

aws configure set default.s3.addressing_style path

# Attend que RustFS accepte les connexions
until $S3 list-buckets >/dev/null 2>&1; do
  echo "En attente de RustFS..."
  sleep 1
done

$S3 head-bucket --bucket "$BUCKET" 2>/dev/null || $S3 create-bucket --bucket "$BUCKET"
$S3 put-bucket-cors --bucket "$BUCKET" --cors-configuration file:///cors.json
$S3 get-bucket-cors --bucket "$BUCKET"
echo "Bucket $BUCKET prêt (privé par défaut)."

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
$S3 head-bucket --bucket drop-bucket 2>/dev/null || $S3 create-bucket --bucket drop-bucket
$S3 put-bucket-cors --bucket "$BUCKET" --cors-configuration file:///cors.json
$S3 put-bucket-cors --bucket drop-bucket --cors-configuration file:///cors.json
$S3 get-bucket-cors --bucket "$BUCKET"
# Notifications Kafka : seulement si docker-compose.kafka.yml est utilisé
[ "$KAFKA_NOTIFY" = "on" ] && $S3 put-bucket-notification-configuration --bucket "$BUCKET" --notification-configuration '{
  "QueueConfigurations": [{
    "Id": "all-object-events",
    "QueueArn": "arn:rustfs:sqs:'"${S3_REGION:-us-east-1}"':primary:kafka",
    "Events": ["s3:ObjectCreated:*", "s3:ObjectRemoved:*", "s3:ObjectAccessed:*"]
  }]
}'
echo "Bucket $BUCKET prêt (privé par défaut)."

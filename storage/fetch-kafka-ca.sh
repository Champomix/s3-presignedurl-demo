#!/bin/sh
# Usage : ./storage/fetch-kafka-ca.sh [host:port]   (defaut : KAFKA_BROKERS de .env, premier broker)
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/kafka-ca.pem"

if [ -n "$1" ]; then
  BROKER="$1"
else
  BROKER="$(sed -n 's/^KAFKA_BROKERS=//p' "$DIR/../.env" | cut -d, -f1)"
fi
[ -n "$BROKER" ] || { echo "Broker introuvable : passer host:port en argument" >&2; exit 1; }

HOST="${BROKER%:*}"
PORT="${BROKER##*:}"

# -showcerts : chaine complete envoyee par le broker (feuille + CA eventuel)
openssl s_client -connect "$HOST:$PORT" -servername "$HOST" -showcerts </dev/null 2>/dev/null \
  | awk '/BEGIN CERTIFICATE/{p=1} p{print} /END CERTIFICATE/{p=0}' > "$OUT"

[ -s "$OUT" ] || { rm -f "$OUT"; echo "Aucun certificat recupere depuis $HOST:$PORT" >&2; exit 1; }

echo "Ecrit $OUT ($(grep -c 'BEGIN CERTIFICATE' "$OUT") certificat(s))"
openssl x509 -in "$OUT" -noout -subject -issuer -enddate

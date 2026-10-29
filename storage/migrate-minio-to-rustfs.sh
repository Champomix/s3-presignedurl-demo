#!/bin/sh
# Migre buckets, policies, users, groupes, attachements IAM et notifications d'evenements de MinIO vers RustFS.
# Prerequis : mc, jq.
#
# SRC_URL SRC_ACCESS_KEY SRC_SECRET_KEY   MinIO source
# DST_URL DST_ACCESS_KEY DST_SECRET_KEY   RustFS cible
# DST_EVENT_ARN                           ARN du target Kafka RustFS (ex : arn:rustfs:sqs:us-east-1:primary:kafka)
# MC_FLAGS                                ex : --insecure pour un certificat auto-signe
# DRY_RUN=1 ou --dry-run                  affiche les ecritures sur RustFS sans les executer (lectures MinIO reelles)
# USERS_SECRETS_FILE                      optionnel, lignes "accesskey,secret" ; sinon secret genere
#
# Les secrets MinIO ne sont pas exportables : un secret est genere (ou lu dans USERS_SECRETS_FILE)
# et ecrit dans users-secrets.out.csv. Meme principe pour les cles d API : apikeys-secrets.out.csv (user,accesskey,secret).
# Les donnees des objets ne sont pas copiees : mc mirror src/<bucket> dst/<bucket>
set -e

[ "$1" = "--dry-run" ] && DRY_RUN=1
# W : execute la commande, ou l'affiche en dry-run
W() { if [ -n "$DRY_RUN" ]; then echo "[dry-run] $*"; else "$@"; fi; }

: "${SRC_URL:?}" "${SRC_ACCESS_KEY:?}" "${SRC_SECRET_KEY:?}"
: "${DST_URL:?}" "${DST_ACCESS_KEY:?}" "${DST_SECRET_KEY:?}"
MC="mc ${MC_FLAGS:-}"
OUT_SECRETS="users-secrets.out.csv"
OUT_KEYS="apikeys-secrets.out.csv"
[ -n "$DRY_RUN" ] && OUT_SECRETS=/dev/null && OUT_KEYS=/dev/null
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

$MC alias set src "$SRC_URL" "$SRC_ACCESS_KEY" "$SRC_SECRET_KEY" >/dev/null
$MC alias set dst "$DST_URL" "$DST_ACCESS_KEY" "$DST_SECRET_KEY" >/dev/null

echo "== Buckets"
BUCKETS="$($MC ls src --json | jq -r 'select(.type=="folder") | .key | rtrimstr("/")')"
for b in $BUCKETS; do
  W $MC mb --ignore-existing "dst/$b"
done

echo "== Policies"
# Les policies integrees (readonly, readwrite, writeonly, diagnostics, consoleAdmin) existent deja
for p in $($MC admin policy list src --json | jq -r '.policy // .policyName'); do
  case "$p" in readonly|readwrite|writeonly|diagnostics|consoleAdmin) continue ;; esac
  $MC admin policy info src "$p" --json | jq '.policyInfo.Policy // .policyInfo.policy' > "$TMP/$p.json"
  W $MC admin policy create dst "$p" "$TMP/$p.json"
done

echo "== Users"
: > "$OUT_SECRETS"
$MC admin user list src --json > "$TMP/users.json"
for u in $(jq -r '.accessKey' "$TMP/users.json"); do
  secret=""
  [ -n "$USERS_SECRETS_FILE" ] && secret="$(grep "^$u," "$USERS_SECRETS_FILE" | head -1 | cut -d, -f2-)"
  [ -n "$secret" ] || secret="$(openssl rand -base64 24 | tr -d '/+=')"
  echo "$u,$secret" >> "$OUT_SECRETS"
  [ -n "$DRY_RUN" ] && secret="***"
  W $MC admin user add dst "$u" "$secret"
  [ "$(jq -r "select(.accessKey==\"$u\") | .userStatus" "$TMP/users.json")" = "disabled" ] && W $MC admin user disable dst "$u"
  for p in $(jq -r "select(.accessKey==\"$u\") | .policyName // empty" "$TMP/users.json" | tr ',' ' '); do
    W $MC admin policy attach dst "$p" --user "$u"
  done
done
chmod 600 "$OUT_SECRETS"

echo "== Cles d'API (service accounts)"
: > "$OUT_KEYS"
for u in $(jq -r '.accessKey' "$TMP/users.json"); do
  for ak in $($MC admin user svcacct list src "$u" --json | jq -r '.accessKey // empty'); do
    $MC admin user svcacct info src "$ak" --json > "$TMP/sa.json"
    sk="$(openssl rand -base64 30 | tr -d '/+=')"
    set -- "$u" --access-key "$ak" --secret-key "$sk"
    name="$(jq -r '.name // empty' "$TMP/sa.json")"
    desc="$(jq -r '.description // empty' "$TMP/sa.json")"
    [ -n "$name" ] && set -- "$@" --name "$name"
    [ -n "$desc" ] && set -- "$@" --description "$desc"
    # Policy propre a la cle : sinon elle herite de celle du user
    if [ "$(jq -r '.impliedPolicy // true' "$TMP/sa.json")" = "false" ]; then
      jq -r '.policy' "$TMP/sa.json" > "$TMP/sa-policy.json"
      set -- "$@" --policy "$TMP/sa-policy.json"
    fi
    if [ -n "$DRY_RUN" ]; then set -- "$u" --access-key "$ak" --secret-key "***"; fi
    W $MC admin user svcacct add dst "$@"
    echo "$u,$ak,$sk" >> "$OUT_KEYS"
  done
done
chmod 600 "$OUT_KEYS"

echo "== Groupes"
for g in $($MC admin group list src --json | jq -r '.groups[]? // .group? // empty'); do
  $MC admin group info src "$g" --json > "$TMP/g.json"
  members="$(jq -r '.members[]?' "$TMP/g.json" | tr '\n' ' ')"
  [ -n "$members" ] && W $MC admin group add dst "$g" $members
  for p in $(jq -r '.groupPolicy // empty' "$TMP/g.json" | tr ',' ' '); do
    W $MC admin policy attach dst "$p" --group "$g"
  done
done

echo "== Notifications d'evenements"
: "${DST_EVENT_ARN:?DST_EVENT_ARN requis pour migrer les notifications}"
for b in $BUCKETS; do
  $MC event list "src/$b" --json 2>/dev/null | jq -c 'select(.arn)' | while read -r r; do
    ev="$(echo "$r" | jq -r '.event | if type=="array" then join(",") else . end')"
    prefix="$(echo "$r" | jq -r '.prefix // ""')"
    suffix="$(echo "$r" | jq -r '.suffix // ""')"
    W $MC event add "dst/$b" "$DST_EVENT_ARN" --event "$ev" ${prefix:+--prefix "$prefix"} ${suffix:+--suffix "$suffix"}
  done
done

echo "== Lifecycle"
for b in $BUCKETS; do
  # Un bucket sans lifecycle fait echouer l'export : on l'ignore
  if $MC ilm rule export "src/$b" > "$TMP/ilm.json" 2>/dev/null || $MC ilm export "src/$b" > "$TMP/ilm.json" 2>/dev/null; then
    [ -s "$TMP/ilm.json" ] || continue
    W $MC ilm rule import "dst/$b" < "$TMP/ilm.json" || W $MC ilm import "dst/$b" < "$TMP/ilm.json"
    echo "lifecycle copie : $b"
  fi
done

echo "Termine. Secrets dans $OUT_SECRETS et $OUT_KEYS"

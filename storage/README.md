# Storage (RustFS)

MinIO ne publie plus d'images Docker (dépôt archivé) : le stockage S3 est assuré par [RustFS](https://docs.rustfs.com) (`rustfs/rustfs`).

## Endpoint unique : http://localhost:9000

RustFS n'est pas exposé directement : la gateway nginx ([gateway/nginx.conf](../gateway/nginx.conf)) publie `localhost:9000` et relaie vers `rustfs:9000` en conservant le header `Host`.

- Le navigateur joint `localhost:9000` via le port publié.
- Le backend partage la pile réseau de la gateway (`network_mode: service:gateway`) : pour lui aussi, `localhost:9000` est la gateway.

Même URL des deux côtés, donc signature SigV4 valide. Aucune modification du poste (`/etc/hosts`) n'est nécessaire.

## Démarrage

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.storage.yml up
```

`storage-init` (image `amazon/aws-cli`) crée le bucket et applique `cors.json` via `put-bucket-cors`, puis s'arrête. Le bucket est privé par défaut.

## Buckets

`storage-init` crée `demo-bucket` et `drop-bucket` (destination en écriture seule côté application, voir [README](../README.md#buckets)) et applique le CORS aux deux.

## Notifications Kafka (optionnel)

```bash
./storage/fetch-kafka-ca.sh kafka.example.lan:9093   # écrit storage/kafka-ca.pem
docker compose -f docker-compose.yml -f docker-compose.kafka.yml up
```

`storage-init` ne configure la notification du bucket que si `docker-compose.kafka.yml` est utilisé (variable `KAFKA_NOTIFY=on`).

## Migration depuis MinIO

`./storage/migrate-minio-to-rustfs.sh --dry-run` : voir la section "Migration depuis MinIO" du [README](../README.md#migration-depuis-minio).

## Vérifications

```bash
curl -f http://localhost:9000/health
docker compose run --rm --entrypoint sh storage-init -c 'aws --endpoint-url http://rustfs:9000 s3api get-bucket-cors --bucket "$S3_BUCKET"'
```

Console : http://localhost:9001/rustfs/console/ (rustfsadmin / rustfsadmin).

# Démonstrateur d'URL présignées S3

Application pédagogique montrant comment un navigateur envoie et télécharge des fichiers **directement** vers un stockage S3, grâce à des URL présignées générées par un backend qui garde seul les secrets.

- **Frontend** : React (Vite), requêtes exclusivement en `XMLHttpRequest` (progression d'upload et de download).
- **Backend** : Node.js / Express, signe les URL avec le SDK AWS v3.
- **Storage** : [RustFS](https://docs.rustfs.com), compatible S3 (MinIO ne publie plus d'images Docker).
- **Gateway** : nginx, expose le stockage sur `http://localhost:9000` (voir "Piège de l'endpoint unique").

```
                      PUT / GET (URL présignée)
navigateur ---------------------------------------> localhost:9000 --+
    |                                                                 |
    | /api (presign, liste)                                           +--> gateway nginx --> rustfs:9000
    v                                                                 |
frontend (8080) --> backend (3001) --- ListObjects -> localhost:9000 --+
```

## Prérequis

- Docker 24+ avec Docker Compose 2.24.4+
- Node.js 22 uniquement pour le développement hors Docker
- Ports libres : 8080, 3001, 9000, 9001

Aucune modification du poste n'est nécessaire (pas d'édition de `/etc/hosts`).

## Démarrage rapide

```bash
cp .env.example .env
docker compose up --build
```

Puis ouvrir http://localhost:8080 :

1. Choisir l'endpoint `RustFS local` (ou `MinIO HTTPS (auto-signé)` une fois les variables `MINIO_TLS_*` renseignées, voir "Endpoint HTTPS avec certificat auto-signé").
2. Choisir le **bucket de destination** (liste propre à l'endpoint, voir "Buckets").
3. Sélectionner un fichier et cliquer **Uploader** : l'URL présignée PUT s'affiche avec son compte à rebours, la barre de progression avance.
4. Le fichier apparaît dans la liste : **Télécharger** génère une URL présignée GET et lance le téléchargement.
5. **Supprimer** retire le fichier du bucket après confirmation (suppression faite par le backend).
6. Le panneau **Console S3**, en bas de page, affiche les commandes S3 réalisées par l'application, avec leur équivalent AWS CLI et HTTP.

## URLs

| Service | URL | Notes |
|---|---|---|
| Frontend | http://localhost:8080 | `http://localhost:5173` en dev (`npm run dev`) |
| Backend API | http://localhost:3001/api/health | |
| API S3 (via gateway) | http://localhost:9000 | même URL pour le navigateur et le backend |
| Console RustFS | http://localhost:9001/rustfs/console/ | `rustfsadmin` / `rustfsadmin` |

## Piège de l'endpoint unique

Une URL présignée n'est valide que pour le **host** avec lequel elle a été signée : la signature SigV4 inclut le header `Host`. Si le navigateur appelle un autre host que celui utilisé par le backend pour signer, le stockage répond `403 SignatureDoesNotMatch`.

Il faut donc **une seule URL d'endpoint**, joignable à la fois par le backend (dans Docker) et par le navigateur (sur l'hôte). Ici, cette URL est `http://localhost:9000` :

- **Navigateur** : `localhost:9000` est le port publié par la gateway nginx.
- **Backend** : il tourne avec `network_mode: service:gateway` et partage donc la pile réseau de la gateway. Pour lui aussi, `localhost:9000` est la gateway.
- **Gateway** : elle relaie vers `rustfs:9000` en conservant le header `Host` (`proxy_set_header Host $http_host`). RustFS reçoit `Host: localhost:9000`, exactement la valeur signée.

`backend/config/endpoints.json` ne contient donc qu'un seul champ `endpoint` par entrée ; un champ `publicEndpoint` est refusé au démarrage.

Conséquences pratiques :

- Le port `3001` du backend est publié par le service `gateway` (un service en `network_mode` ne peut pas publier de ports).
- Si la gateway est redémarrée seule, redémarrer aussi le backend : `docker compose restart gateway backend`.
- Backend lancé hors Docker (`npm start`) : `localhost:9000` reste joignable, aucune configuration à changer.

Sur AWS S3, le principe est identique : l'endpoint (`https://s3.eu-west-1.amazonaws.com`) est le même côté serveur et côté navigateur.

## Console S3

La console liste, au fil des actions, les opérations S3 de l'application :

| Opération | Exécutée par | Déclenchée par |
|---|---|---|
| `ListObjectsV2`, `HeadObject`, `DeleteObject` | backend | liste, métadonnées, suppression |
| `Presign` | backend (signature locale, aucun appel au stockage) | upload et download |
| `PutObject`, `GetObject` | navigateur, avec l'URL présignée | upload et download |

Chaque entrée montre la commande `aws s3api ...` et la requête HTTP équivalentes. Les signatures ne sont jamais affichées (`?<signature>`). Le backend garde les 100 dernières opérations en mémoire (`GET /api/console?after=<id>`) ; le résultat des PUT et GET du navigateur n'y figure pas, le backend ne les voyant pas passer.

## Endpoint HTTPS avec certificat auto-signé

`endpoints.json` contient un second endpoint, `minio-tls`, prévu pour un MinIO (ou tout S3) en HTTPS dont le certificat est auto-signé. Ses informations viennent du `.env` :

```bash
MINIO_TLS_ENDPOINT=https://minio.example.lan:9000
MINIO_TLS_REGION=us-east-1
MINIO_TLS_BUCKET=demo-bucket
MINIO_TLS_ACCESS_KEY=minioadmin
MINIO_TLS_SECRET_KEY=minioadmin
```

Ces cinq variables sont obligatoires : si l'une manque, le backend refuse de démarrer (retirer l'entrée de `endpoints.json` si l'endpoint n'est pas utilisé).

Le champ `"allowSelfSigned": true` (défaut `false`, par endpoint) désactive la vérification du certificat pour les appels **du backend** vers ce stockage (liste, métadonnées). Il ne concerne pas les URL présignées, que le navigateur appelle directement :

- ouvrir une fois l'URL de l'endpoint dans le navigateur et accepter le certificat, sinon les PUT et GET présignés échouent avec une erreur réseau ;
- configurer le CORS du bucket pour autoriser l'origine du front (`http://localhost:8080`) : `storage-init` ne le fait que pour RustFS.

## Buckets

Chaque entrée de `endpoints.json` peut déclarer plusieurs buckets de destination :

```json
"bucket": "demo-bucket",
"buckets": [
  { "name": "demo-bucket" },
  { "name": "drop-bucket", "writeOnly": true }
]
```

- `bucket` est le bucket par défaut (ajouté à `buckets` s'il n'y figure pas). Sans `buckets`, l'endpoint n'a que ce bucket.
- `"writeOnly": true` pour un bucket où l'utilisateur n'a ni `GetObject`, ni `ListBucket`, ni `HeadObject`. Le backend refuse alors la liste, les métadonnées et le téléchargement (403 `WRITE_ONLY_BUCKET`), et l'interface n'affiche pas la liste des fichiers. Seul l'upload (PUT présigné) est possible. La suppression n'est pas bloquée par l'application.
- Un bucket absent de la liste est refusé (403 `UNKNOWN_BUCKET`). Le front ne peut pas viser un bucket arbitraire.
- Ce blocage est une protection de l'application, pas un droit : les droits réels restent ceux de l'utilisateur côté stockage.
- Le CORS de chaque bucket utilisé par le navigateur doit autoriser l'origine du front. `storage-init` l'applique à `demo-bucket` et `drop-bucket` sur RustFS.

## Notifications d'événements vers Kafka (optionnel)

RustFS peut publier un événement S3 dans un topic Kafka (SASL/PLAIN, TLS avec certificat auto-signé) à chaque action sur un objet (`s3:ObjectCreated:*`, `s3:ObjectRemoved:*`, `s3:ObjectAccessed:*`). C'est désactivé par défaut.

1. Renseigner dans `.env` : `KAFKA_BROKERS`, `KAFKA_TOPIC`, `KAFKA_SASL_USERNAME`, `KAFKA_SASL_PASSWORD`, `KAFKA_CA_FILE` (voir [.env.example](.env.example)).
2. Récupérer le certificat du broker dans `storage/kafka-ca.pem` : `./storage/fetch-kafka-ca.sh [host:port]`. Vérifier l'empreinte auprès de l'administrateur du broker.
3. Démarrer avec l'override Kafka :

```bash
docker compose -f docker-compose.yml -f docker-compose.kafka.yml up --build
```

[docker-compose.kafka.yml](docker-compose.kafka.yml) configure le target `primary` de RustFS et `storage-init` associe `demo-bucket` à l'ARN `arn:rustfs:sqs:<région>:primary:kafka`. La file d'attente disque (événements non livrés si Kafka est injoignable) est dans le volume `rustfs-queue`, hors de `/data` (un dossier de `/data` apparaîtrait comme un bucket).

Les noms de variables `RUSTFS_NOTIFY_KAFKA_*` et l'ARN n'ont pas été validés sur une instance réelle : en cas d'échec de `put-bucket-notification-configuration`, consulter `docker compose logs rustfs storage-init`.

## Migration depuis MinIO

[storage/migrate-minio-to-rustfs.sh](storage/migrate-minio-to-rustfs.sh) (prérequis : `mc`, `jq`) copie vers RustFS les buckets, policies, utilisateurs, groupes, clés d'API (service accounts), notifications d'événements et règles de lifecycle.

```bash
SRC_URL=https://minio.example.lan:9000 SRC_ACCESS_KEY=... SRC_SECRET_KEY=... \
DST_URL=http://localhost:9000 DST_ACCESS_KEY=rustfsadmin DST_SECRET_KEY=rustfsadmin \
DST_EVENT_ARN=arn:rustfs:sqs:us-east-1:primary:kafka MC_FLAGS=--insecure \
./storage/migrate-minio-to-rustfs.sh --dry-run   # retirer --dry-run pour exécuter
```

- `--dry-run` (ou `DRY_RUN=1`) lit MinIO mais affiche seulement les écritures sur RustFS.
- Les secrets MinIO ne sont pas exportables : un secret est généré pour chaque utilisateur et chaque clé d'API, écrit dans `users-secrets.out.csv` et `apikeys-secrets.out.csv` (ignorés par git). `USERS_SECRETS_FILE` permet d'imposer les secrets des utilisateurs.
- Les objets ne sont pas copiés (`mc mirror`). Les transitions de lifecycle vers un tier distant, le versioning, les tags et les policies de bucket ne sont pas migrés.
- Script non testé sur une instance réelle : tester d'abord sur un RustFS vide.

## Développer une couche à la fois

```bash
# Storage seul (rustfs + gateway + init du bucket)
docker compose -f docker-compose.yml -f docker-compose.storage.yml up

# Backend + storage, front en local
docker compose -f docker-compose.yml -f docker-compose.backend.yml up
cd frontend && npm install && npm run dev

# Front + storage, backend en local
docker compose -f docker-compose.yml -f docker-compose.frontend.yml up
cd backend && cp .env.example .env && npm install && npm start
```

## Tests et qualité

```bash
# Backend : routes /api (S3 mocké), chargement de endpoints.json
cd backend && npm install && npm test && npm run lint

# Frontend : composants critiques + src/lib/xhr.js (XMLHttpRequest mocké)
cd frontend && npm install && npm test && npm run lint

# E2E (stack démarrée avec docker compose up --build)
cd e2e && npm install && npx playwright install chromium && npm test
```

L'ESLint du frontend interdit `fetch` et `axios` dans `src/` : toutes les requêtes passent par [frontend/src/lib/xhr.js](frontend/src/lib/xhr.js). Le test E2E vérifie aussi que chaque requête vers `/api` et vers le stockage est de type `xhr`.

## Configuration

Variables du fichier `.env` (voir [.env.example](.env.example)) :

| Variable | Défaut | Rôle |
|---|---|---|
| `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` | `rustfsadmin` | identifiants du stockage, utilisés uniquement par le backend et l'init |
| `S3_BUCKET` / `S3_REGION` | `demo-bucket` / `us-east-1` | bucket créé par `storage-init` |
| `PORT` | `3001` | port du backend |
| `PRESIGN_EXPIRES_DEFAULT` | `300` | durée de validité des URL présignées (secondes) |
| `MAX_UPLOAD_SIZE` | `104857600` | taille maximale acceptée avant signature (octets) |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:8080` | origines autorisées sur l'API |
| `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` | vide | proxy transmis aux builds Docker (`npm ci` / `npm install`) |
| `MINIO_TLS_*` | voir ci-dessus | endpoint HTTPS auto-signé (`ENDPOINT`, `REGION`, `BUCKET`, `ACCESS_KEY`, `SECRET_KEY`) |
| `KAFKA_*` | vide | notifications Kafka, seulement avec `docker-compose.kafka.yml` (`BROKERS`, `TOPIC`, `SASL_USERNAME`, `SASL_PASSWORD`, `CA_FILE`) |

Endpoints S3 : [backend/config/endpoints.json](backend/config/endpoints.json). Les valeurs `${VAR}` sont remplacées par les variables d'environnement. Le fichier est lu au démarrage : redémarrer le backend après modification (`docker compose restart backend`).

Les builds Docker transmettent `HTTP_PROXY`, `HTTPS_PROXY` et `NO_PROXY` à `npm ci` / `npm install` (arguments de build du backend et du frontend). Un proxy qui réécrit le certificat TLS nécessite d'ajouter son autorité de certification à l'image.

CORS du bucket : [storage/cors.json](storage/cors.json), appliqué par `storage-init` à chaque `docker compose up`.

## Dépannage

**`SignatureDoesNotMatch` (403) lors du PUT ou du GET**
- Vérifier que `endpoint` vaut `http://localhost:9000` dans `endpoints.json`, et que l'URL affichée par le front commence bien par cette valeur.
- Vérifier que la gateway conserve le header `Host` (`proxy_set_header Host $http_host` dans [gateway/nginx.conf](gateway/nginx.conf)).
- Vérifier que le `Content-Type` envoyé est celui signé : le front renvoie la valeur de `presigned.headers`.
- Pour lire la cause exacte : `docker compose logs backend` (les détails ne sont jamais renvoyés au navigateur).

**Erreur CORS dans la console du navigateur**
- L'origine du front (`http://localhost:8080` ou `http://localhost:5173`) doit figurer dans [storage/cors.json](storage/cors.json).
- Après modification : `docker compose up storage-init` pour réappliquer la configuration.
- Vérifier : `docker compose run --rm --entrypoint sh storage-init -c 'aws --endpoint-url http://rustfs:9000 s3api get-bucket-cors --bucket "$S3_BUCKET"'`.

**`502 S3_UNREACHABLE` ou liste de fichiers en erreur**
- Le backend trace chaque échec de connexion au stockage : `docker compose logs backend`, lignes `[s3] ...` avec la commande, l'endpoint, le bucket, la durée, le code d'erreur (`ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`, `DEPTH_ZERO_SELF_SIGNED_CERT`...) et la cause.
- Erreur de certificat (`SELF_SIGNED`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`) : mettre `"allowSelfSigned": true` sur l'endpoint concerné.
- `ENOTFOUND` / `ECONNREFUSED` : vérifier l'URL `endpoint` et que le port est joignable depuis le conteneur backend.
- La ligne se termine par `allowSelfSigned=false` quand l'option n'est pas activée pour l'endpoint.

**Port 9000 (ou 8080, 3001, 9001) déjà utilisé**
- Identifier le processus : `netstat -ano | findstr :9000` (Windows) ou `lsof -i :9000` (Linux/macOS).
- Pour changer le port S3, modifier **à la fois** la publication de la gateway (`docker-compose.yml`), le `listen` de [gateway/nginx.conf](gateway/nginx.conf) et `endpoint` dans `endpoints.json` : les trois doivent rester identiques.

**"URL expirée, veuillez en générer une nouvelle"**
- Les URL sont valables `PRESIGN_EXPIRES_DEFAULT` secondes (300 par défaut). Relancer l'upload ou le téléchargement pour en générer une nouvelle.
- Si l'erreur apparaît immédiatement : vérifier l'horloge de la machine (la signature est datée).

**Signature visible dans les logs**
- Le backend ne logge que la clé de l'objet, jamais l'URL signée. Si une URL complète apparaît dans des logs, c'est une fuite : elle donne accès à l'objet jusqu'à son expiration.
- La gateway logge les requêtes sans leur query string (format `no_query` dans [gateway/nginx.conf](gateway/nginx.conf)) : ne pas revenir au format par défaut, qui inclut la signature.
- Côté navigateur, l'URL complète reste visible dans l'onglet Network et dans `<PresignedUrlBox>` : c'est voulu pour la démo.

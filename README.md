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

1. Choisir l'endpoint `RustFS local`.
2. Sélectionner un fichier et cliquer **Uploader** : l'URL présignée PUT s'affiche avec son compte à rebours, la barre de progression avance.
3. Le fichier apparaît dans la liste : **Télécharger** génère une URL présignée GET et lance le téléchargement.

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

Endpoints S3 : [backend/config/endpoints.json](backend/config/endpoints.json). Les valeurs `${VAR}` sont remplacées par les variables d'environnement. Le fichier est lu au démarrage : redémarrer le backend après modification (`docker compose restart backend`).

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

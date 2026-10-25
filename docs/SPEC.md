# CLAUDE.md — Démonstrateur d'URL présignées S3

> Document de cadrage destiné à **Claude Code** pour développer, étape par étape, un démonstrateur complet d'URL présignées S3 (client React + serveur Node + stockage RustFS/S3).
> Aucune exécution de code n'est requise pour ce livrable : le fichier ci-dessous décrit l'architecture, les fonctionnalités, l'arborescence, l'API, les critères d'acceptation et le plan de développement.

---

## 1. Objectif

Construire une application pédagogique et fonctionnelle illustrant le mécanisme des **URL présignées S3** (presigned URLs) avec trois couches strictement séparées :

1. **Frontend** : SPA React (Vite) qui initie les uploads/downloads *directement* vers S3 via une URL présignée retournée par le backend.
2. **Backend** : API Node.js (Express) qui signe les URLs à l'aide du SDK AWS v3, valide les requêtes, expose la liste d'endpoints (sans secrets) et la liste d'objets.
3. **Storage** : un bucket S3-compatible, **RustFS en local** par défaut, accessible via un réseau Docker dédié.

L'objectif pédagogique : montrer comment le navigateur peut parler directement à S3 sans proxy de données, tout en gardant les **secrets strictement côté serveur**.

---

## 2. Stack technique

### 2.1 Backend (Node.js)
- **Runtime** : Node.js 22 LTS (Node 20 est en fin de vie depuis avril 2026).
- **Framework HTTP** : Express 4.
- **SDK AWS v3 (modulaire)** :
  - `@aws-sdk/client-s3` — opérations S3 (`PutObjectCommand`, `GetObjectCommand`, `ListObjectsV2Command`, `HeadObjectCommand`).
  - `@aws-sdk/s3-request-presigner` — `getSignedUrl(client, command, { expiresIn })`.
  - `@aws-sdk/lib-storage` — **non requis** (pas d'upload multipart côté serveur ; l'upload passe directement par le navigateur).
- **Middleware** : `cors` (origines du front), `dotenv` (variables d'environnement), `express.json()`, `morgan` (logs HTTP).
- **Validation** : `zod` pour la validation des corps de requête (`POST /api/presign/upload`, `POST /api/presign/download`, query `GET /api/files`).
- **Tests** : `vitest` ou `jest` + `supertest` pour les routes `/api/presign/*` et `/api/endpoints`.

### 2.2 Frontend (React)
- **Build** : Vite (+ **TypeScript optionnel** ; rester en JavaScript pour la simplicité).
- **HTTP client** : **`XMLHttpRequest` exclusivement**, regroupé dans un petit utilitaire `src/lib/xhr.js`.
  - **Pourquoi XHR** : seul XHR expose `xhr.upload.onprogress` (progression d'upload) et `xhr.onprogress` (progression de download) avec une API simple, stable et testable. `fetch()` **ne fournit pas** la progression d'upload ; par conséquent `fetch` **n'est pas utilisé** dans cette application (ni pour les appels API, ni pour les transferts vers les URLs présignées). `axios` n'est pas retenu : il encapsule XHR mais ajoute une dépendance et masque la gestion fine des événements `progress`.
  - **Cas couverts par `src/lib/xhr.js`** :
    1. **Requêtes JSON vers le backend** (`GET`, `POST`) — `request({ url, method, headers, body })` retourne `{ status, headers, data }` (parsing JSON automatique selon le `content-type`) et rejette en cas de status ≥ 400 ou d'erreur réseau.
    2. **Upload `PUT` vers URL présignée** — `uploadWithProgress(presigned, file, { onProgress, onSpeed })` basé sur `xhr.upload.onprogress` (avec `e.lengthComputable` / `e.loaded` / `e.total`) pour la progression et la vitesse instantanée (Ko/s), avec annulation via `xhr.abort()` (la référence `xhr` est exposée pour permettre le branchement à un bouton **Annuler**).
    3. **Download `GET` depuis URL présignée** — `downloadAsBlob(presigned, { onProgress, filename })` avec `xhr.responseType = 'blob'` et `xhr.onprogress` (`event.lengthComputable` / `Content-Length`), puis déclenchement du téléchargement navigateur via `URL.createObjectURL(blob)` + `<a download={filename}>` + `URL.revokeObjectURL`.
- **UI** : composants fonctionnels + hooks ; CSS modules ou Tailwind (au choix, privilégier un CSS simple).
- **State** : `useState`/`useReducer` ; pas de Redux.
- **Annulation** : `xhr.abort()` côté upload (référence stockée dans un `useRef`).

### 2.3 Storage (RustFS)
- Image `rustfs/rustfs` en Docker. MinIO ne publie plus d'images communautaires (octobre 2025) et son dépôt est archivé (avril 2026) : RustFS le remplace (API S3 compatible, mêmes ports).
- Console d'administration sur le port 9001 (`/rustfs/console/`).
- API S3 sur le port 9000.
- Script d'initialisation avec `aws` CLI (image `amazon/aws-cli`) : création du bucket, configuration CORS (`put-bucket-cors`). Les buckets sont privés par défaut.

---

## 3. Arborescence proposée

```
s3-presigned-demo/
├── docker-compose.yml              # Service unique : orchestre les 3 couches
├── docker-compose.storage.yml     # Override : storage seul (désactive backend et frontend)
├── docker-compose.backend.yml     # Override : backend + storage (front lancé en local)
├── docker-compose.frontend.yml    # Override : frontend + storage (backend lancé en local)
├── README.md                      # Guide utilisateur
├── CLAUDE.md                      # Ce fichier (cadrage pour Claude Code)
├── .env.example                   # Variables d'environnement documentées
├── .gitignore
│
├── gateway/
│   └── nginx.conf                 # Reverse-proxy localhost:9000 -> rustfs:9000 (Host conservé), cf. §5.1
│
├── storage/
│   ├── README.md                  # Notes RustFS / aws-cli
│   ├── init-bucket.sh             # Crée le bucket + applique CORS + désactive anon
│   └── cors.json                  # Configuration CORS appliquée via aws s3api put-bucket-cors
│
├── backend/
│   ├── Dockerfile                 # Multi-stage (deps -> runtime)
│   ├── package.json
│   ├── .env.example
│   ├── vitest.config.js           # (ou jest.config.js)
│   ├── config/
│   │   └── endpoints.json         # Liste des endpoints S3 (avec support ${VAR}) — un seul champ `endpoint` par entrée
│   └── src/
│       ├── index.js               # Entrypoint Express, middlewares, routes
│       ├── config/
│       │   └── loadEndpoints.js   # Charge endpoints.json, expand ${ENV}, valide (rejette publicEndpoint s'il est présent)
│       ├── routes/
│       │   ├── endpoints.js       # GET /api/endpoints (sans secrets)
│       │   ├── presign.js         # POST /api/presign/upload, /download
│       │   └── files.js           # GET /api/files?endpointId=
│       ├── services/
│       │   └── s3.js              # Un seul client S3 par endpoint (sign + appels serveur)
│       └── middleware/
│           └── errorHandler.js    # Gestionnaire d'erreurs global
│
└── frontend/
│   ├── Dockerfile                 # Multi-stage (build Vite -> nginx)
│   ├── nginx.conf                 # Sert le build + reverse-proxy /api -> backend
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── lib/
│       │   └── xhr.js             # Utilitaire XHR unique : request, uploadWithProgress, downloadAsBlob
│       ├── api/
│       │   ├── client.js          # Appels /api/* via xhr.request()
│       │   └── presigned.js       # Upload + download via URL présignée via xhr.uploadWithProgress / xhr.downloadAsBlob
│       └── components/
│           ├── EndpointSelector.jsx
│           ├── UploadPanel.jsx
│           ├── FileList.jsx
│           ├── PresignedUrlBox.jsx
│           └── ProgressBar.jsx
```

### 3.1 Notes sur la séparation
- Les fichiers `docker-compose.{storage,backend,frontend}.yml` permettent de développer **une seule couche à la fois**. Ils désactivent les services inutiles en leur affectant un profil `disabled` jamais activé :
  - `docker compose -f docker-compose.yml -f docker-compose.frontend.yml up` → front (nginx) + storage ; backend lancé sur l'hôte (`npm start`), joint via `host.docker.internal:3001`.
  - `docker compose -f docker-compose.yml -f docker-compose.backend.yml up` → back + storage.
- Le `docker-compose.yml` complet démarre toutes les couches ensemble (rustfs, gateway, storage-init, backend, frontend).

---

## 4. Fonctionnalités détaillées

### 4.1 Upload via URL présignée PUT avec barre de progression
**Flux complet :**

1. L'utilisateur choisit un fichier dans `<UploadPanel>`.
2. Le front appelle `POST /api/presign/upload` (via le helper `xhr.request()` de `src/lib/xhr.js`) avec :
   ```json
   { "endpointId": "rustfs-local", "filename": "photo.jpg", "contentType": "image/jpeg", "size": 1234567 }
   ```
3. Le backend valide (zod), construit la `key` (sanitisée, ex. `uploads/{timestamp}-{filename}`), crée un `PutObjectCommand`, appelle `getSignedUrl(client, command, { expiresIn: 300 })` avec **l'unique** `endpoint` configuré, puis renvoie :
   ```json
   {
     "url": "http://localhost:9000/demo-bucket/uploads/1700000000-photo.jpg?X-Amz-Algorithm=...",
     "method": "PUT",
     "key": "uploads/1700000000-photo.jpg",
     "expiresIn": 300,
     "headers": { "Content-Type": "image/jpeg" }
   }
   ```
4. Le front affiche l'URL dans `<PresignedUrlBox>` (avec bouton **Copier**), puis lance l'upload via `xhr.uploadWithProgress(presigned, file, { onProgress, onSpeed })` :
   - `xhr.open(presigned.method, presigned.url)`.
   - `xhr.setRequestHeader('Content-Type', file.type)` (+ tous les `presigned.headers`).
   - `xhr.upload.onprogress = (e) => { /* si e.lengthComputable : progression (e.loaded / e.total) + vitesse instantanée Ko/s + ETA */ }`.
   - Vitesse instantanée (Ko/s) + ETA + bouton **Annuler** → `xhr.abort()` (la référence `xhr` retournée par le helper est stockée dans un `useRef`) → message d'erreur visible côté UI.
5. À la fin, le front peut appeler `GET /api/files?endpointId=...` (toujours via `xhr.request()`) pour rafraîchir la liste.

### 4.2 Liste des fichiers
- **Route** : `GET /api/files?endpointId=...`
- **Backend** : utilise `ListObjectsV2Command` avec le bucket de l'endpoint, `Prefix` optionnel, `MaxKeys` (défaut 1000).
- **Réponse** :
  ```json
  {
    "endpointId": "rustfs-local",
    "bucket": "demo-bucket",
    "files": [
      { "key": "uploads/foo.jpg", "size": 12345, "lastModified": "2025-01-15T10:00:00.000Z", "etag": "..." }
    ]
  }
  ```

### 4.3 Téléchargement via URL présignée GET
**Flux complet :**

1. L'utilisateur clique **Télécharger** sur un fichier de `<FileList>`.
2. Le front appelle `POST /api/presign/download` (via `xhr.request()`) :
   ```json
   { "endpointId": "rustfs-local", "key": "uploads/foo.jpg" }
   ```
3. Le backend signe un `GetObjectCommand` et renvoie `{ url, method: "GET", key, expiresIn }`.
4. Le front affiche l'URL dans `<PresignedUrlBox>`, puis télécharge via `xhr.downloadAsBlob(presigned, { onProgress, filename })` :
   - `xhr.open('GET', presigned.url)`.
   - `xhr.responseType = 'blob'`.
   - `xhr.onprogress = (e) => { /* event.lengthComputable ? progression (%) : indéterminée ; utilise e.loaded et (event.total || Content-Length) */ }`. La progression de download est fournie **uniquement** par XHR ; `fetch` n'est donc pas utilisé ici.
   - Au `onload` (status 2xx) : `const blob = xhr.response; const objectUrl = URL.createObjectURL(blob);` puis création d'un `<a download={filename} href={objectUrl}>` + clic programmatique + `URL.revokeObjectURL(objectUrl)` après.
5. Le fichier est sauvegardé via le téléchargement natif du navigateur (le nom de fichier est passé en argument `download`).

### 4.4 Affichage de l'URL présignée
- Composant `<PresignedUrlBox>` :
  - Affiche l'URL complète (tronquée visuellement, complète au clic/hover).
  - **Méthode** (PUT/GET) bien visible (badge coloré).
  - **Expiration** : compte à rebours en temps réel (`expiresAt = Date.now() + expiresIn * 1000`).
  - **Bouton Copier** :
    ```js
    await navigator.clipboard.writeText(url);
    // Fallback : textarea + document.execCommand('copy')
    ```
  - **Avertissement** : rouge clignotant si l'URL est expirée.

### 4.5 Choix de l'endpoint S3
- **Fichier** : `backend/config/endpoints.json` (un seul champ `endpoint` par entrée — voir §5.1) :
  ```json
  [
    {
      "id": "rustfs-local",
      "name": "RustFS local",
      "endpoint": "http://localhost:9000",
      "region": "us-east-1",
      "bucket": "demo-bucket",
      "accessKeyId": "${RUSTFS_ACCESS_KEY}",
      "secretAccessKey": "${RUSTFS_SECRET_KEY}",
      "forcePathStyle": true
    }
    // {
    //   "id": "aws-prod",
    //   "name": "AWS S3 (exemple commenté)",
    //   "endpoint": "https://s3.eu-west-1.amazonaws.com",
    //   "region": "eu-west-1",
    //   "bucket": "my-bucket",
    //   "accessKeyId": "${AWS_ACCESS_KEY_ID}",
    //   "secretAccessKey": "${AWS_SECRET_ACCESS_KEY}",
    //   "forcePathStyle": false
    // }
  ]
  ```
- **Support des variables d'environnement** : le loader remplace `${VAR}` par `process.env.VAR` (regex `/\${([A-Z0-9_]+)}/g`). Erreur claire si une variable attendue n'est pas définie.
- **Route** : `GET /api/endpoints` renvoie la liste **SANS** `accessKeyId`/`secretAccessKey` (sécurité) et **SANS** `publicEndpoint` (qui n'existe plus).
- **Rechargement à chaud** : le backend recharge `endpoints.json` à chaque requête (fs.watch) **ou** au démarrage (documenter le choix).
- **UI** : `<EndpointSelector>` (select ou cartes) affiche `name` + `region` + `bucket`.

---

## 5. Points d'attention cruciaux — URL présignées

### 5.1 Piège de l'endpoint unique (TRÈS IMPORTANT)

**Une URL présignée n'est valide que pour le host avec lequel elle a été signée** : la signature SigV4 inclut le header `Host` dans `X-Amz-SignedHeaders=host`, et toute requête vers un autre host se solde par une erreur `SignatureDoesNotMatch` (HTTP 403). Il faut donc qu'**une seule et même URL** d'endpoint soit joignable à la fois :

1. depuis le **conteneur backend** (qui signe l'URL et appelle `ListObjects` / `HeadObject`), et
2. depuis le **navigateur** (qui consomme l'URL présignée pour PUT/GET).

➡️ **Règle d'or** : on configure **un seul champ `endpoint`** par entrée dans `endpoints.json`. Pas de `publicEndpoint`, pas de mapping interne/public. Pas de double configuration.

#### Solution retenue - gateway nginx sur `localhost:9000` (aucune modification du poste)

Le navigateur ne connaît que `localhost` (pas de modification de `/etc/hosts`). On fait donc en sorte que `http://localhost:9000` désigne le même service pour le navigateur **et** pour le backend :

1. **Gateway nginx** (`gateway/nginx.conf`) : écoute sur `9000`, publiée sur l'hôte (`ports: ["9000:9000"]`), et relaie tout vers `http://rustfs:9000` en **conservant le header `Host`** (`proxy_set_header Host $http_host`). RustFS reçoit `Host: localhost:9000`, identique à celui signé.
2. **Backend** : `network_mode: service:gateway`. Le conteneur backend partage la pile réseau de la gateway ; pour lui, `localhost:9000` est la gateway, exactement comme pour le navigateur.
3. **Endpoint unique** : `"endpoint": "http://localhost:9000"` (même valeur côté serveur et côté front).
4. **RustFS** ne publie plus le port `9000` (seule la console `9001` reste publiée).

**Même host, même URL, signature valide des deux côtés.** En dev hors Docker (`npm start` depuis `backend/`), `localhost:9000` reste joignable via le port publié : aucune configuration à changer.

Réglages nginx indispensables :
- `proxy_request_buffering off` et `proxy_buffering off` : sinon nginx bufferise le corps et la progression d'upload/download côté navigateur est faussée.
- `client_max_body_size 0` : la limite de taille est appliquée par le backend avant signature (§5.3).

> Sur AWS S3 réel, c'est exactement le même principe : l'endpoint (ex. `https://s3.eu-west-1.amazonaws.com`) est utilisé tel quel côté serveur (signing IAM via SDK) et côté navigateur (URL présignée). Aucune magie, aucun `publicEndpoint` séparé.

#### Alternatives écartées

- **Hostname `minio` + `127.0.0.1 minio` dans `/etc/hosts`** : impose de modifier le poste de chaque développeur.
- **`extra_hosts` côté backend** : l'IP de la gateway Docker varie selon l'OS et ça ne résout rien côté navigateur.
- **`network_mode: host` pour le backend** : perd l'isolation Docker et ne fonctionne pas de la même façon sous Docker Desktop (Windows/macOS).

### 5.2 CORS RustFS / S3
Le navigateur bloquera les requêtes cross-origin vers S3 sans CORS. Les origines à autoriser sont celles du front (`storage/cors.json`, format `aws s3api put-bucket-cors`) :

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["http://localhost:5173", "http://localhost:8080"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

> Appliqué par `init-bucket.sh` via `aws s3api put-bucket-cors` (même commande pour RustFS et AWS S3). La gateway ne touche pas aux headers CORS : ils sont produits par RustFS.

### 5.3 Sécurité
- **Expiration** : défaut `300` secondes, configurable via variable d'environnement (`PRESIGN_EXPIRES_DEFAULT`).
- **Limite de taille** : refuser `size > MAX_UPLOAD_SIZE` (ex. 100 Mo) côté backend avant de signer.
- **Sanitisation** : `key = uploads/${Date.now()}-${path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_')}` (max 1024 chars).
- **Content-Type** : le header `Content-Type` signé doit correspondre **exactement** à celui envoyé par le navigateur lors du PUT.
- **Secrets** : ne JAMAIS renvoyer `accessKeyId`/`secretAccessKey` au front. Ne JAMAIS logger l'URL signée complète (peut fuiter la signature).

### 5.4 Erreurs S3 courantes à gérer
- `NoSuchKey`, `NoSuchBucket` → 404.
- `AccessDenied`, `SignatureDoesNotMatch` → 403 + log détaillé côté serveur (PAS côté client). **Note** : `SignatureDoesNotMatch` en navigateur provient presque toujours d'un mismatch de host (cf. §5.1) ; le diagnostic doit explicitement rappeler de vérifier que la gateway conserve le header `Host` et l'unicité de `endpoint`.
- URL expirée → message clair côté front (« URL expirée, veuillez en générer une nouvelle »).

---

## 6. Docker & orchestration

### 6.1 Services
1. **rustfs** :
   - Image : `rustfs/rustfs:latest`
   - `container_name: rustfs` : nom DNS interne utilisé par la gateway et `storage-init`.
   - Ports : `9001:9001` (console) uniquement. Le port `9000` n'est **pas** publié par RustFS : il l'est par la gateway (cf. §5.1).
   - Variables : `RUSTFS_ACCESS_KEY`, `RUSTFS_SECRET_KEY`, `RUSTFS_ADDRESS=:9000`, `RUSTFS_CONSOLE_ADDRESS=:9001`, `RUSTFS_CONSOLE_ENABLE=true`.
   - Volume : `rustfs-data:/data`
   - Santé : `GET /health` (liveness) et `GET /health/ready` sur le port 9000, sans authentification.
   - Réseaux : `s3-net`.

2. **gateway** :
   - Image : `nginx:alpine`, configuration `./gateway/nginx.conf`.
   - Écoute `9000` et relaie vers `http://rustfs:9000` avec `proxy_set_header Host $http_host`, `proxy_request_buffering off`, `proxy_buffering off`, `client_max_body_size 0`.
   - Ports : `9000:9000` (API S3), `3001:3001` (API backend, cf. ci-dessous).
   - Dépend de `rustfs`.
   - Réseaux : `s3-net`.

3. **storage-init** :
   - Image : `amazon/aws-cli:latest`, entrypoint `/bin/sh /init.sh`.
   - Dépend de `rustfs`.
   - Volumes : `./storage/init-bucket.sh:/init.sh`, `./storage/cors.json:/cors.json`
   - Commande : `/init.sh` (attend RustFS via `aws s3api list-buckets`, puis crée le bucket et applique le CORS). Opérations d'administration sans URL présignée : l'accès direct à `rustfs:9000` est correct.
   - Pas de profil : one-shot idempotent (crée le bucket s'il manque, réapplique le CORS) exécuté à chaque `up`.

4. **backend** :
   - Dockerfile multi-stage.
   - Build : `npm ci --omit=dev` puis copie `src/`.
   - Runtime : `node src/index.js`.
   - Port : `3001`, publié via la gateway (`network_mode` interdit `ports` sur le service lui-même).
   - **`network_mode: service:gateway`** : le backend partage la pile réseau de la gateway ; `http://localhost:9000` y désigne la gateway, comme pour le navigateur.
   - Dépend de `gateway`.
   - Variables : `PORT`, `PRESIGN_EXPIRES_DEFAULT`, `MAX_UPLOAD_SIZE`, `CORS_ORIGINS`.
   - Volume : `./backend/config/endpoints.json:/app/config/endpoints.json:ro` (optionnel, pour édition à chaud).

5. **frontend** :
   - Dockerfile multi-stage : `node:22-alpine` pour le build Vite, `nginx:alpine` pour le runtime.
   - `nginx.conf` (template, variable `BACKEND_URL`, défaut `http://gateway:3001`) sert `/usr/share/nginx/html` et reverse-proxie `/api/*` vers le backend, joignable sous le nom de la gateway.
   - Port : `5173` (dev, `npm run dev`) ou `8080` (Docker, `8080:80`).

### 6.2 Réseau
- Réseau Docker dédié : `s3-net` (driver `bridge`).
- `rustfs`, `gateway`, `frontend` et `storage-init` y sont attachés ; `backend` y accède via la pile réseau de `gateway`.
- Les services communiquent entre eux par nom DNS (`rustfs`, `gateway`, `frontend`).
- **Aucune modification du poste (`/etc/hosts`) ni aucun `extra_hosts` n'est requis** : navigateur et backend utilisent tous deux `http://localhost:9000`.

### 6.3 Commandes
```bash
# 1. Démarrage complet
docker compose up --build

# 2. URLs d'accès
# Frontend      : http://localhost:5173 (dev) ou http://localhost:8080 (prod)
# Backend API   : http://localhost:3001
# RustFS API     : http://localhost:9000  (via la gateway, pour le navigateur comme pour le backend)
# RustFS Console : http://localhost:9001  (login: rustfsadmin / rustfsadmin)
```

### 6.4 Overrides
```bash
# Démarrer uniquement le storage
docker compose -f docker-compose.yml -f docker-compose.storage.yml up

# Démarrer uniquement le backend + storage (front en local : cd frontend && npm run dev)
docker compose -f docker-compose.yml -f docker-compose.backend.yml up

# Démarrer uniquement le frontend (backend lancé sur l'hôte : cd backend && npm start)
docker compose -f docker-compose.yml -f docker-compose.frontend.yml up
```

---

## 7. API — Récapitulatif

| Méthode | Route                       | Corps / Query                                                          | Réponse                                                                                                            | Description                                  |
|---------|-----------------------------|------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|----------------------------------------------|
| GET     | `/api/health`               | —                                                                      | `{ status: "ok", uptime, version }`                                                                                | Healthcheck                                  |
| GET     | `/api/endpoints`            | —                                                                      | `[{ id, name, endpoint, region, bucket, forcePathStyle }]` *(sans secrets, sans publicEndpoint)*                   | Liste des endpoints S3 configurés            |
| POST    | `/api/presign/upload`       | `{ endpointId, filename, contentType, size }`                          | `{ url, method: "PUT", key, expiresIn, headers: { "Content-Type": "..." } }`                                       | Signe un PUT                                 |
| POST    | `/api/presign/download`     | `{ endpointId, key }`                                                  | `{ url, method: "GET", key, expiresIn }`                                                                           | Signe un GET                                 |
| GET     | `/api/files`                | `?endpointId=...&prefix=uploads/&maxKeys=100`                          | `{ endpointId, bucket, files: [{ key, size, lastModified, etag }] }`                                               | Liste les objets du bucket                   |
| GET     | `/api/files/:endpointId/:key/meta` | —                                                              | `{ key, size, contentType, lastModified, etag }` *(via HeadObject)*                                                | Métadonnées d'un objet (optionnel)           |

### 7.1 Codes d'erreur
- `400` : corps invalide (zod).
- `403` : endpoint introuvable ou signature échouée.
- `404` : objet introuvable.
- `413` : taille dépassée.
- `500` : erreur S3 interne (loggée).

Format d'erreur :
```json
{ "error": { "code": "PRESIGN_FAILED", "message": "..." } }
```

---

## 8. Critères d'acceptation

### 8.1 Tests manuels (étapes à exécuter)
1. **Démarrage** : `docker compose up --build` démarre les 5 conteneurs (rustfs, gateway, storage-init, backend, frontend) sans erreur ; RustFS `/health/ready` OK.
2. **Gateway** : `curl -f http://localhost:9000/health` (hôte) répond OK ; `docker compose exec backend wget -qO- http://localhost:9000/health` répond OK depuis le backend (même URL).
3. **Console RustFS** : `http://localhost:9001/rustfs/console/` accessible, login `rustfsadmin/rustfsadmin`, bucket `demo-bucket` présent.
4. **Backend health** : `curl http://localhost:3001/api/health` → `{"status":"ok"}`.
5. **Liste d'endpoints** : `curl http://localhost:3001/api/endpoints` → tableau avec **au moins** `rustfs-local`, **sans** `accessKeyId`/`secretAccessKey`, **sans** `publicEndpoint`.
6. **Upload** :
   - Ouvrir `http://localhost:5173`, sélectionner `rustfs-local`, choisir un fichier JPG.
   - L'URL présignée PUT s'affiche (commençant par `http://localhost:9000/...`), le compteur d'expiration défile.
   - La barre de progression atteint 100 %, vitesse affichée.
   - Le fichier apparaît dans `<FileList>` après refresh.
   - Vérifier dans la console RustFS que le fichier est bien dans le bucket.
7. **Copie d'URL** : cliquer sur **Copier** → l'URL est dans le presse-papier ; expiration devient rouge à 0.
8. **Annulation** : lancer un upload de gros fichier (50 Mo), cliquer **Annuler** → `xhr.abort()` déclenché via `useRef`, message d'erreur visible.
9. **Download** :
   - Cliquer **Télécharger** sur un fichier → URL présignée GET affichée.
   - La progression s'affiche, le fichier se télécharge avec le bon nom (via `<a download>`).
10. **Limite de taille** : tenter d'uploader un fichier > limite → erreur 413 claire.
11. **Expiration** : attendre 5 min après génération → PUT/GET direct S3 → erreur « Request has expired ».
12. **CORS** : tester depuis un autre origin (désactiver le front, ouvrir un HTML local) → erreur CORS visible dans DevTools.
13. **Endpoints multiples** : éditer `endpoints.json`, ajouter un second endpoint factice (toujours avec **un seul** champ `endpoint`) → redémarrer → il apparaît dans le `<EndpointSelector>`.
14. **Sécurité** : inspecter le payload de `GET /api/endpoints` → aucun champ `secretAccessKey`/`accessKeyId`, aucun `publicEndpoint`.
15. **Sanity XHR-only** : ouvrir l'onglet Network de DevTools → toutes les requêtes sortantes sont des `(XHR)` ; aucune `fetch` n'apparaît dans la timeline.

### 8.2 Tests automatisés minimaux (backend)
- `vitest` + `supertest`.
- **Cas à couvrir** :
  1. `GET /api/endpoints` masque bien les secrets (pas de `accessKeyId`/`secretAccessKey`) et n'expose pas de `publicEndpoint`.
  2. `POST /api/presign/upload` valide le body (zod) et renvoie une URL bien formée (contient `X-Amz-Signature`) dont le host correspond exactement à `endpoint`.
  3. `POST /api/presign/upload` rejette `size > MAX_UPLOAD_SIZE`.
  4. `POST /api/presign/upload` rejette un `endpointId` inconnu.
  5. `POST /api/presign/download` signe correctement un GET.
  6. `GET /api/files` retourne un tableau (peut être vide en CI).
- **Mock S3** : utiliser `aws-sdk-client-mock` pour mocker `@aws-sdk/client-s3`.
- **Test spécifique `endpoints.json`** : charger un fixture qui contient un `publicEndpoint` → la validation **doit** lever une erreur explicite (« `publicEndpoint` n'est plus supporté, utilisez un seul champ `endpoint` »).
- **Exemple** :
  ```js
  test('POST /api/presign/upload renvoie une URL signée', async () => {
    const res = await request(app)
      .post('/api/presign/upload')
      .send({ endpointId: 'rustfs-local', filename: 'a.txt', contentType: 'text/plain', size: 10 });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/X-Amz-Signature=/);
    expect(res.body.url.startsWith('http://localhost:9000/')).toBe(true);
    expect(res.body.method).toBe('PUT');
  });
  ```

---

## 9. Plan de développement pour Claude Code (numéroté)

> Chaque étape possède une **Definition of Done (DoD)**. Claude Code doit s'arrêter à la DoD et demander validation avant de passer à l'étape suivante.

### Étape 1 — Storage (RustFS)
- Créer `storage/init-bucket.sh` (image `amazon/aws-cli` : attente de `rustfs:9000`, `create-bucket`, `put-bucket-cors`).
- Créer `storage/cors.json` (origines du front : `http://localhost:5173`, `http://localhost:8080`).
- Créer `gateway/nginx.conf` (écoute `9000`, relaie vers `rustfs:9000` en conservant `Host`, sans buffering).
- Créer `docker-compose.yml` avec `rustfs` (port `9001` seul publié), `gateway` (port `9000` publié) + `storage-init`.
- `docker-compose.storage.yml` pour isoler.
- `.env.example` : `RUSTFS_ACCESS_KEY`, `RUSTFS_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`.
- **DoD** : `docker compose -f docker-compose.yml -f docker-compose.storage.yml up` crée le bucket, applique CORS, `aws s3api get-bucket-cors --bucket demo-bucket` renvoie la configuration ; `curl http://localhost:9000/health` répond OK depuis l'hôte.

### Étape 2 — Backend
- Initialiser `backend/` (`npm init`, dépendances listées en §2.1).
- `backend/src/config/loadEndpoints.js` : charge `endpoints.json`, expand `${VAR}`, valide la structure (zod) — **rejette explicitement tout champ `publicEndpoint`** (lève une erreur explicite pour aider les migrations).
- `backend/src/services/s3.js` : **un seul** `getS3Client(endpointConfig)` qui sert à la fois aux appels serveur (ListObjects, HeadObject) et à la signature des URLs (le client utilise `endpointCfg.endpoint`, pas de variante « publique »).
- `backend/src/routes/*` : implémenter les routes du §7.
- `backend/src/middleware/errorHandler.js` : format d'erreur uniforme.
- `backend/src/index.js` : Express + middlewares + routes + healthcheck.
- `backend/Dockerfile` multi-stage.
- Tests `vitest` + `supertest` (§8.2), y compris le test qui vérifie que `endpoints.json` ne doit pas contenir `publicEndpoint`.
- **DoD** : `npm test` passe ; `docker compose up backend` démarre ; `curl /api/endpoints` renvoie la liste sans secrets ni `publicEndpoint` ; `curl /api/health` répond OK ; `curl -X POST /api/presign/upload ...` renvoie une URL signée dont le host est exactement `endpoint`.

### Étape 3 — Frontend
- Initialiser `frontend/` avec Vite (template `react`).
- `frontend/src/lib/xhr.js` : implémenter **trois** fonctions (`request`, `uploadWithProgress`, `downloadAsBlob`) basées exclusivement sur `XMLHttpRequest`.
- `frontend/src/api/client.js` : appels `/api/*` via `xhr.request()` (pas de `fetch`, pas d'`axios`).
- `frontend/src/api/presigned.js` : upload via `xhr.uploadWithProgress(...)` (expose la `xhr` pour permettre `abort()`), download via `xhr.downloadAsBlob(...)`.
- Composants (§3) avec CSS sobre.
- **DoD** : `npm run dev` démarre sur 5173 ; la page liste les endpoints, affiche l'URL signée, permet l'upload avec progression, liste les fichiers, permet le download avec progression ; copier dans presse-papier fonctionne ; l'onglet Network du navigateur ne montre que des requêtes `(XHR)` (aucune `fetch`).

### Étape 4 — Docker complet
- Compléter `docker-compose.yml` avec `backend` et `frontend` (réseau `s3-net`, backend en `network_mode: service:gateway`, port `3001` publié par la gateway).
- Créer les overrides `docker-compose.{backend,frontend}.yml` (et adapter `docker-compose.storage.yml`).
- `backend/Dockerfile` et `frontend/Dockerfile` (multi-stage, build Vite → nginx).
- `frontend/nginx.conf` : sert le build + reverse-proxy `/api` vers `http://gateway:3001` (template `BACKEND_URL`).
- **DoD** : `docker compose up --build` démarre les 5 services (rustfs, gateway, storage-init, backend, frontend) ; le front sur 8080 communique avec le back sur 3001 qui parle à RustFS via `http://localhost:9000` (gateway) ; le navigateur joint RustFS via la même URL, sans modification du poste ; upload + download fonctionnent end-to-end.

### Étape 5 — README
- `README.md` racine : présentation, prérequis (Docker 24+ avec Compose 2.24+, Node 22 si dev local), démarrage rapide, URLs, **section « Piège de l'endpoint unique »** expliquant pourquoi `localhost:9000` doit désigner la gateway à la fois pour le navigateur et pour le backend (`network_mode: service:gateway`, header `Host` conservé).
- Section troubleshooting dédiée : (a) erreur `SignatureDoesNotMatch` → vérifier `endpoint` = `http://localhost:9000` et `proxy_set_header Host $http_host` dans la gateway ; (b) CORS → vérifier les origines du front dans `storage/cors.json` puis relancer `storage-init` ; (c) port 9000 occupé ; (d) URL expirée ; (e) signature dans les logs.
- Captures d'écran (optionnel) des écrans clés.
- **DoD** : un développeur peut suivre le README sans autre doc, sans modifier son poste, et faire fonctionner la démo en moins de 5 minutes.

### Étape 6 — Tests & qualité
- Compléter les tests backend (§8.2).
- Ajouter quelques tests frontend (vitest + @testing-library/react) pour les composants critiques (`EndpointSelector`, `UploadPanel`, `ProgressBar`). Ajouter un test unitaire de `src/lib/xhr.js` qui mocke `XMLHttpRequest` et vérifie que `uploadWithProgress` appelle bien `xhr.upload.onprogress` et `xhr.abort()`.
- Ajouter un test E2E minimal (Playwright) : upload d'un fichier, vérification de son apparition dans la liste. Vérifier dans le test que toutes les requêtes réseau sont des `(XHR)`.
- ESLint (backend + frontend) avec config standard ; ajouter une règle eslint interdisant `fetch(` et `axios` dans `frontend/src/` (hors commentaires).
- **DoD** : `npm test` (racine ou chaque sous-projet) passe ; `npx eslint .` ne remonte aucune erreur (notamment pas d'usage de `fetch`/`axios` côté front) ; le test E2E passe.

---

## 10. Conventions

### 10.1 Code
- **Commentaires en français** (demande explicite).
- Nommage : `camelCase` (variables/fonctions JS), `PascalCase` (composants React), `UPPER_SNAKE_CASE` (constantes).
- Pas de magic numbers : utiliser des constantes nommées (`MAX_UPLOAD_SIZE`, `DEFAULT_EXPIRES_IN`).
- JSDoc léger sur les fonctions publiques du backend.
- **Front** : `import { request, uploadWithProgress, downloadAsBlob } from '../lib/xhr.js'` — jamais `fetch`, jamais `axios`.

### 10.2 Gestion d'erreurs
- Backend : `try/catch` autour de chaque handler, renvoi d'erreurs typées (`AppError`) traitées par `errorHandler`.
- Frontend : `try/catch` autour des appels XHR, affichage d'un message utilisateur (toast ou bannière). Les rejets de `xhr.request()` / `uploadWithProgress` / `downloadAsBlob` portent un `{ status, message }` quand pertinent.
- Pas de stack trace exposée au front (uniquement `code` + `message` générique).

### 10.3 Logs
- Backend : `morgan` pour HTTP + `console.info`/`console.error` pour les événements métier.
- Ne **jamais** logger l'URL présignée complète (contient la signature).
- Frontend : `console.error` pour les erreurs UX, pas de `console.log` en production (Vite le supprime au build).

### 10.4 Sécurité (rappel)
- ✅ Secrets uniquement côté serveur, jamais dans le bundle front.
- ✅ Un seul `endpoint` par entrée, identique côté serveur et côté navigateur.
- ✅ CORS restrictif (origines explicites, pas de `*`).
- ✅ Expiration courte (≤ 15 min).
- ✅ Validation `zod` sur tous les inputs.
- ✅ Sanitisation des clés.

---

## 11. Variables d'environnement (`.env.example`)

```env
# === RustFS / Storage ===
RUSTFS_ACCESS_KEY=rustfsadmin
RUSTFS_SECRET_KEY=rustfsadmin
S3_BUCKET=demo-bucket
S3_REGION=us-east-1

# === Backend ===
PORT=3001
PRESIGN_EXPIRES_DEFAULT=300
MAX_UPLOAD_SIZE=104857600   # 100 Mo
CORS_ORIGINS=http://localhost:5173,http://localhost:8080

# === Frontend ===
VITE_API_BASE_URL=/api      # Utilise le reverse-proxy nginx en prod
```

> Le fichier `backend/config/endpoints.json` référence ces variables via `${RUSTFS_ACCESS_KEY}`, etc.
> Le champ `endpoint` (unique) utilise typiquement `http://localhost:9000` (cf. §5.1).

---

## 12. Annexes

### 12.1 Exemple de payload d'URL signée
```
http://localhost:9000/demo-bucket/uploads/1700000000-photo.jpg
  ?X-Amz-Algorithm=AWS4-HMAC-SHA256
  &X-Amz-Credential=rustfsadmin%2F20250115%2Fus-east-1%2Fs3%2Faws4_request
  &X-Amz-Date=20250115T100000Z
  &X-Amz-Expires=300
  &X-Amz-Signature=abcdef1234567890...
  &X-Amz-SignedHeaders=host
```

### 12.2 Snippet backend — signature d'upload
```js
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Un seul client S3 par endpoint : sert à la fois aux appels serveur
 * (ListObjects, HeadObject) et à la signature des URLs présignées.
 * Le host de l'URL signée est celui de `endpointCfg.endpoint`.
 */
export async function presignUpload(endpointCfg, { key, contentType, expiresIn }) {
  const client = new S3Client({
    endpoint: endpointCfg.endpoint,
    region: endpointCfg.region,
    credentials: {
      accessKeyId: endpointCfg.accessKeyId,
      secretAccessKey: endpointCfg.secretAccessKey,
    },
    forcePathStyle: endpointCfg.forcePathStyle,
  });
  const command = new PutObjectCommand({
    Bucket: endpointCfg.bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn });
}
```

### 12.3 Snippet frontend — utilitaire XHR unique (`src/lib/xhr.js`)
```js
// 1) Requête JSON vers le backend (GET/POST/PUT/DELETE, body sérialisé en JSON)
export function request({ url, method = 'GET', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    if (body && typeof body !== 'string' && !(body instanceof FormData)) {
      xhr.setRequestHeader('Content-Type', 'application/json');
    }
    xhr.onload = () => {
      const ct = xhr.getResponseHeader('Content-Type') || '';
      const data = ct.includes('application/json') && xhr.responseText ? JSON.parse(xhr.responseText) : xhr.responseText;
      xhr.status >= 200 && xhr.status < 300
        ? resolve({ status: xhr.status, headers: xhr.getAllResponseHeaders(), data })
        : reject(Object.assign(new Error(`HTTP ${xhr.status}`), { status: xhr.status, data }));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null);
  });
}

// 2) Upload PUT avec progression, vitesse et annulation
export function uploadWithProgress(presigned, file, { onProgress, onSpeed } = {}) {
  const xhr = new XMLHttpRequest();
  xhr.open(presigned.method, presigned.url);
  Object.entries(presigned.headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return;
    onProgress?.({ loaded: e.loaded, total: e.total });
    onSpeed?.({ loaded: e.loaded, total: e.total, timestamp: Date.now() });
  };
  return new Promise((resolve, reject) => {
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve({ status: xhr.status, xhr })
        : reject(Object.assign(new Error(`HTTP ${xhr.status}`), { status: xhr.status, xhr }));
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(file);
  });
  // La référence xhr est également attachée à la Promise pour permettre abort()
  // depuis l'extérieur (ex. bouton Annuler) : caller.xhr?.abort();
}

// 3) Download GET en blob avec progression + téléchargement navigateur
export function downloadAsBlob(presigned, { onProgress, filename = 'download' } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(presigned.method, presigned.url);
    xhr.responseType = 'blob';
    xhr.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.({ loaded: e.loaded, total: e.total });
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        return reject(Object.assign(new Error(`HTTP ${xhr.status}`), { status: xhr.status }));
      }
      const blob = xhr.response;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Libère la mémoire après le déclenchement du téléchargement navigateur
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      resolve({ blob, objectUrl });
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send();
  });
}
```

### 12.4 Snippet frontend — utilisation dans `UploadPanel.jsx`
```js
import { useRef, useState } from 'react';
import { uploadWithProgress } from '../lib/xhr.js';

export function UploadPanel({ presigned, file, onDone }) {
  const [pct, setPct] = useState(0);
  const [speed, setSpeed] = useState(0); // Ko/s
  const xhrRef = useRef(null);

  const start = () => {
    const p = uploadWithProgress(presigned, file, {
      onProgress: ({ loaded, total }) => setPct(Math.round((loaded / total) * 100)),
      onSpeed: ({ loaded }) => setSpeed(Math.round(loaded / 1024)),
    });
    p.xhr = p.then ? null : null; // voir astuce: la xhr est aussi retournée par la lib
    // Variante simplifiée : la lib retourne la xhr comme propriété de la Promise
    xhrRef.current = p.xhr;
    p.then(() => onDone?.()).catch((e) => console.error('upload aborted/failed', e));
  };

  const cancel = () => xhrRef.current?.abort();

  return (
    <div>
      <button onClick={start}>Uploader</button>
      <button onClick={cancel}>Annuler</button>
      <progress value={pct} max={100} />
      <span>{pct}% — {speed} Ko/s</span>
    </div>
  );
}
```

---

**Fin du document.** Ce `CLAUDE.md` est prêt à être fourni à Claude Code pour piloter le développement étape par étape.

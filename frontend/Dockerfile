FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
# npm ci dès que package-lock.json est versionné
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build

FROM nginx:alpine
# Le backend partage la pile réseau de la gateway : il est joignable sous ce nom
ENV BACKEND_URL=http://gateway:3001
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

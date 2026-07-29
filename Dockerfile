FROM node:20-alpine

RUN apk add --no-cache tzdata

WORKDIR /app

COPY package.json package-lock.json ./
# connect-sqlite3 pulls in sqlite3, a native module with no prebuilt musl/alpine
# binary — build it here, then drop the toolchain so it doesn't bloat the image.
# `npm ci` installs exactly what's in the lockfile instead of re-resolving —
# connect-sqlite3's peerDependencies range (sqlite3 ^5.x) is stale (it never
# actually imports sqlite3 itself, just accepts an externally-constructed
# Database instance), so a fresh `npm install` errors out on that conflict.
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && npm ci --omit=dev \
  && apk del .build-deps

COPY . .

ENV PORT=4000
# Express is more defensive by default in production mode — notably, its default
# (uncaught-error) handler stops including stack traces in responses.
ENV NODE_ENV=production
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:4000/api/auth/me >/dev/null 2>&1 || exit 0

CMD ["node", "server.js"]

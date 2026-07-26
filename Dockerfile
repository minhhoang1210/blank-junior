# --- build stage: needs devDependencies (typescript) to compile ---
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime stage: production dependencies + compiled output only ---
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Drop root; the bot needs no privileges and writes nothing to disk.
USER node

# No EXPOSE and no port: a Discord gateway bot dials out over a WebSocket and
# never accepts inbound connections. Hosts that require a listening port (or
# that sleep an idle service) are the wrong shape for this.
CMD ["node", "dist/index.js"]

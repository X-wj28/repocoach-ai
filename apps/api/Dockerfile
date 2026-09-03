FROM node:22-alpine AS dependencies
WORKDIR /app
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
RUN npm run db:generate
RUN npm run build --workspace apps/api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma

EXPOSE 4000
CMD ["sh", "-c", "npm run prisma:deploy --workspace apps/api && node apps/api/dist/main.js"]

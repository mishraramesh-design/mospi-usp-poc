FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

FROM base AS builder
COPY . .
ARG NEXT_PUBLIC_API_URL=http://93.127.194.188/api
ARG NEXT_PUBLIC_ODK_URL=http://93.127.194.188:8383
ARG NEXT_PUBLIC_SUPERSET_URL=http://93.127.194.188:8088
ARG NEXT_PUBLIC_AIRFLOW_URL=http://93.127.194.188:8080
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ODK_URL=$NEXT_PUBLIC_ODK_URL
ENV NEXT_PUBLIC_SUPERSET_URL=$NEXT_PUBLIC_SUPERSET_URL
ENV NEXT_PUBLIC_AIRFLOW_URL=$NEXT_PUBLIC_AIRFLOW_URL
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"
CMD ["node", "server.js"]

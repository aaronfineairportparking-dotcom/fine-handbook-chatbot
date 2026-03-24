# Checkpoint: Cloud Run Deployment Guide for Next.js Standalone

To deploy this app to Cloud Run successfully, you should use a multi-stage Dockerfile that leverages the `standalone` output mode configured in your `next.config.ts`.

### 1. Create a Dockerfile
Create a file named `Dockerfile` in your root directory with the following content:

```dockerfile
# Stage 1: Install dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build the application
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# Stage 3: Production runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Cloud Run uses the PORT environment variable
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 8080

CMD ["node", "server.js"]
```

### 2. Common Issues & Fixes

*   **API Key**: The `GEMINI_API_KEY` is a server-side environment variable (not `NEXT_PUBLIC_`). It does NOT need to be available at build time. Set it as a runtime environment variable in Cloud Run.
*   **Port Configuration**: Cloud Run expects the container to listen on port 8080 (or whatever is in the `$PORT` env var). The `Dockerfile` above handles this.
*   **Standalone Mode**: Your `next.config.ts` is already set to `output: 'standalone'`. This is great! It creates a minimal production build. However, you must manually copy the `public` and `.next/static` folders into the standalone directory (as shown in the Dockerfile).
*   **CORS with Apps Script**: If you are using the Live Sync feature, ensure your Google Apps Script Web App is deployed with "Access: Anyone" and that it returns the correct CORS headers if necessary (though `fetch` to a Web App URL usually handles this if it's a simple GET).

### 3. How to Deploy via CLI
If you have the Google Cloud SDK installed, run:

```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/handbook-app

gcloud run deploy handbook-app \
  --image gcr.io/YOUR_PROJECT_ID/handbook-app \
  --platform managed \
  --region your-region \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=your_actual_key_here
```

**Suggestion**: Check your Cloud Run logs in the Google Cloud Console. They will tell you exactly why the container is failing to start or why the app is crashing.

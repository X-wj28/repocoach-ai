# Online Deployment Guide

This guide deploys the frontend, API, and PostgreSQL to Render. It is designed for the public GitHub repository version of RepoCoach.

## Why use Render for all services?

Render can run both Next.js and NestJS services and provides a managed PostgreSQL database. The browser calls the Render API over HTTPS, and the API stores application data in Render Postgres.

```text
Render Web
  https://your-web-service.onrender.com
          |
          | HTTPS REST + Cookie
          v
Render API
  https://repocoach-api.onrender.com
          |
          v
Render PostgreSQL
```

## Before starting

- Push the latest code to GitHub and confirm the CI run is green.
- Create an account on [Render](https://render.com/).
- Keep your `DEEPSEEK_API_KEY` and `GITHUB_TOKEN` private. They belong only in the Render environment-variable UI, never in Git.
- Deploy the API first. The web service needs its public API URL.

## 1. Create PostgreSQL on Render

1. In Render, choose **New** → **Postgres**.
2. Choose a database name such as `repocoach-db` and a region close to you.
3. After creation, open the database page and copy its **Internal Database URL**.
4. Keep that URL for the API service's `DATABASE_URL`.

Use the internal URL for the API service. It keeps API-to-database traffic inside Render's private network.

## 2. Deploy the NestJS API on Render

1. Choose **New** → **Web Service**, then connect `X-wj28/repocoach-ai`.
2. Select branch `main`.
3. Use Docker as the runtime.
4. Set **Dockerfile Path** to `apps/api/Dockerfile`.
5. Set **Docker Build Context Directory** to the repository root (`.`).
6. Set health-check path to `/api/v1/health`.
7. Add these environment variables:

| Key                 | Value                                                   |
| ------------------- | ------------------------------------------------------- |
| `DATABASE_URL`      | Render Postgres **Internal Database URL**               |
| `WEB_ORIGIN`        | Temporary placeholder; replace after the web service is deployed |
| `COOKIE_SECURE`     | `true`                                                  |
| `COOKIE_SAME_SITE`  | `none`                                                  |
| `DEEPSEEK_API_KEY`  | Your DeepSeek key, optional                             |
| `DEEPSEEK_MODEL`    | `deepseek-chat`                                         |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com`                              |
| `GITHUB_TOKEN`      | Optional read-only GitHub token                         |

Render provides a `PORT` value at runtime. The API Dockerfile uses it automatically. On the first boot, the container runs `prisma migrate deploy` before starting NestJS.

When the service is live, open:

```text
https://YOUR-RENDER-SERVICE.onrender.com/api/v1/health
```

It should return a JSON object with `status: "ok"`.

## 3. Deploy the Next.js frontend on Render

1. In Render, choose **New** → **Web Service** and connect `X-wj28/repocoach-ai`.
2. Select branch `main`, runtime **Node**.
3. Set **Root Directory** to `.`.
4. Set the build command to `npm ci --no-audit --no-fund && npm run build --workspace apps/web`.
5. Set the start command to `npm exec --workspace apps/web -- next start -p $PORT`.
6. Add one production environment variable:

| Key                   | Value                                             |
| --------------------- | ------------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | `https://YOUR-RENDER-API.onrender.com/api/v1` |

7. Deploy. Render will provide a URL similar to `https://repocoach-web.onrender.com`.

## 4. Finish cross-origin authentication

Return to Render, change the API's `WEB_ORIGIN` to the exact web service origin:

```text
https://YOUR-WEB-SERVICE.onrender.com
```

Do not add a trailing slash. Redeploy the API after saving the variable.

The production setup deliberately uses:

```text
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
```

These settings are required when the web and API use different HTTPS origins. Locally, keep `COOKIE_SECURE=false` and `COOKIE_SAME_SITE=lax`.

## 5. Production acceptance test

1. Open the Render web service URL.
2. Register a new throwaway account.
3. Refresh the page and verify login state remains.
4. Import a public GitHub repository.
5. Complete one interview answer.
6. Open the capability report.
7. Verify the Render health endpoint returns `200`.

## Troubleshooting

### Browser shows a login loop or 401 after deployment

- Verify `WEB_ORIGIN` exactly matches the Render web service URL.
- Verify `COOKIE_SECURE=true` and `COOKIE_SAME_SITE=none` on Render.
- Verify the frontend uses the same public API URL configured in `NEXT_PUBLIC_API_URL`.
- Redeploy the web service after changing a `NEXT_PUBLIC_*` variable because it is embedded during the build.

### API starts but cannot connect to Postgres

- Use Render's **Internal Database URL** for `DATABASE_URL`.
- Confirm API and database are in the same Render region.
- Inspect Render logs for the Prisma migration command.

### Repository analysis is rate limited

Add a read-only `GITHUB_TOKEN` in Render's environment-variable UI. Do not expose it in web-service variables or in browser code.

## References

- [Render Web Services](https://render.com/docs/web-services)
- [Docker on Render](https://render.com/docs/docker)
- [Render Postgres: create and connect](https://render.com/docs/postgresql-creating-connecting)

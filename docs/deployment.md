# Online Deployment Guide

For recovery from an expired Render database without a paid upgrade, see [the Neon recovery steps](neon-recovery.md).

The current deployment uses Render for the frontend and API, and Neon for PostgreSQL after the database recovery. Keep the existing Neon `DATABASE_URL` when updating the API; a code upgrade does not require creating a new database. The four-stage Agent upgrade was deployed on 2026-10-14 at commit `d82d511f06147de90547b6a3632eedf971028686`; both existing free services are Live and the eight migrations are applied. See [the release results](release-summary.md). The creation instructions below also document setup for a fresh deployment; an update uses the existing services.

## Deployment layout

The browser calls the Render API over HTTPS using REST and SSE. The API stores application data in PostgreSQL through Prisma; the existing project uses Neon.

```text
Render Web
  https://your-web-service.onrender.com
          |
          | HTTPS REST + SSE + Cookie
          v
Render API
  https://repocoach-api.onrender.com
          |
          v
Neon PostgreSQL
```

## Before starting

- Push the latest code to GitHub and confirm the CI run is green.
- Create an account on [Render](https://render.com/).
- Keep your `DEEPSEEK_API_KEY` and `GITHUB_TOKEN` private. They belong only in the Render environment-variable UI, never in Git.
- Deploy the API first. The web service needs its public API URL.

## 1. Keep the existing PostgreSQL connection

1. Use the direct PostgreSQL connection URL from the existing Neon project, including its SSL parameters.
2. Keep that connection string in the API service's `DATABASE_URL`, never in a committed file or screenshot.
3. The API startup command applies migrations to this database before starting the service.

If choosing a different PostgreSQL provider later, use that provider's supported connection URL. Migrating existing data is separate from deploying application code.

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
| `DATABASE_URL`      | Existing Neon direct PostgreSQL URL with SSL parameters |
| `WEB_ORIGIN`        | Temporary placeholder; replace after the web service is deployed |
| `COOKIE_SECURE`     | `true`                                                  |
| `COOKIE_SAME_SITE`  | `none`                                                  |
| `DEEPSEEK_API_KEY`  | Your DeepSeek key, optional                             |
| `DEEPSEEK_MODEL`    | `deepseek-chat`                                         |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com`                              |
| `GITHUB_TOKEN`      | Dedicated public-repository read-only GitHub token; configured in the current deployment to avoid exhausted anonymous limits |
| `EMAIL_VERIFICATION_REQUIRED` | `true` to require Gmail code verification        |
| `RESEND_API_KEY`     | Resend HTTPS API key                                  |
| `EMAIL_FROM`         | Resend-verified sender, or `RepoCoach <onboarding@resend.dev>` for testing |

Render provides a `PORT` value at runtime. The API Dockerfile uses it automatically. On the first boot, the container runs `prisma migrate deploy` before starting NestJS.

When the service is live, open:

```text
https://YOUR-RENDER-SERVICE.onrender.com/api/v1/health
```

It should return a JSON object with `status: "ok"`, `agentContract: "durable-rubric-sse-v1"` and the deployed `revision`. The frontend HTML contains matching `repocoach-contract` and `repocoach-revision` metadata. Render supplies `RENDER_GIT_COMMIT` at build/runtime, so these markers identify the actual running revision. Documentation-only commits can use `[skip render]` and do not change the running revision.

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

### Deploying the durable Rubric upgrade

Apply migration `20261013090000_durable_rubric_scoring` along with all earlier migrations before starting the new API. It adds `evaluation_runs` and makes answer scores nullable. The existing API Docker entry point applies committed migrations automatically.

Also apply `20261013120000_events_and_training_memory` for SSE events, practice observations and memory epochs. Existing runs receive a state snapshot, without invented historical steps. Keep frontend and API on the same revision. The reverse proxy must pass `text/event-stream` without buffering; verify Last-Event-ID reconnect and Cookie authentication in the target environment. This release sends 15-second heartbeats and bounds each connection to 150 seconds. The current Render deployment passed a real HTTP disconnect/replay check, browser cookie login and refresh, four model-scored turns, Markdown export and memory clear without deleting history. Production email verification is currently disabled and email delivery was not exercised.

Deploy the web and API from the same revision: answer submission now returns a 202 task response, and the new web polls its status and offers stage retries. The worker starts inside NestJS and uses PostgreSQL leases; no separate Redis or worker service is required. Pending stages recover when the API starts or a progress request wakes it. Idle queues do not query continuously.

Tasks record the Rubric, prompt version and configured model alias. This release processes only its supported version; changing them while tasks are incomplete can leave those tasks in a version/configuration failure state. A crash may repeat an external model request before its checkpoint, although the final committed turn remains unique. See [the recovery contract](rubric-and-recovery.md).

### Render shows `Suspended by Render`

Check the affected service's suspension notice and Events first, then check workspace **Billing → Monthly Included Usage**. A suspended service is different from an idle service: refreshing the page or redeploying code does not necessarily restore it.

| Confirmed reason | Recovery action |
| --- | --- |
| Free instance hours exhausted | Wait for the next calendar month's reset, or explicitly choose a paid compute plan. The workspace shares 750 free instance hours across its free web services. |
| Outbound bandwidth exhausted without a payment method | Check the workspace's usage and billing notice; resolve the stated billing limit or wait for the next billing period. |
| High service-initiated traffic | Follow Render's suspension notice. Render documents moving the affected service to a paid compute plan as the recovery path. |
| Maintenance redeploy failed | Read the failed deploy logs and fix the build/start error identified there before redeploying. |
| Reason not displayed | Check Render's notification email or ask Render support to identify the suspension reason. |

After the API resumes, verify `/api/v1/health`, login, and a database-backed operation. A `200` response from the frontend alone does not verify the backend or database.

See [Render's free-instance limits](https://render.com/docs/free) and [maintenance behavior](https://render.com/docs/platform-maintenance).

### Render Postgres shows `Expired`

Free Render Postgres expires 30 days after creation. Render allows a further 14 days to upgrade the existing database, then deletes it and its data. Check the database's expiration date before choosing a recovery method. Redeploying the API cannot restore an expired database.

If the original database is still recoverable, use Render's documented recovery option to retain its data. If it has already been deleted, restore a backup to a replacement database; creating an empty database and running migrations restores the schema only. Update the API's `DATABASE_URL`, run the existing migrations, and redeploy the API after a replacement database is ready.

For a long-lived portfolio deployment, select a database whose retention and backup policy fits the expected demonstration period. See [Render's Postgres free-tier policy](https://render.com/docs/free#free-postgres).

### Browser shows a login loop or 401 after deployment

- Verify `WEB_ORIGIN` exactly matches the Render web service URL.
- Verify `COOKIE_SECURE=true` and `COOKIE_SAME_SITE=none` on Render.
- Verify the frontend uses the same public API URL configured in `NEXT_PUBLIC_API_URL`.
- Redeploy the web service after changing a `NEXT_PUBLIC_*` variable because it is embedded during the build.

### API starts but cannot connect to Postgres

- For the existing Neon database, keep the direct connection URL and its SSL parameters in `DATABASE_URL`.
- If using Render Postgres instead, use its Internal Database URL and match the API/database region.
- Inspect Render logs for the Prisma migration command.

### Repository analysis is rate limited

Add a read-only `GITHUB_TOKEN` in Render's environment-variable UI. Do not expose it in web-service variables or in browser code.

## References

- [Render Web Services](https://render.com/docs/web-services)
- [Docker on Render](https://render.com/docs/docker)
- [Render Postgres: create and connect](https://render.com/docs/postgresql-creating-connecting)

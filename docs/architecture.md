# Architecture

## Runtime boundaries

- `apps/web` owns authentication screens, repository setup, interview interaction, report visualization, replay, and export.
- `apps/api` owns authentication, repository analysis, Agent orchestration, model access, persistence, and report aggregation.
- `packages/shared` contains contracts shared by the web and API packages.
- PostgreSQL stores users, hashed sessions, interviews, answers, and evaluation signals.

## Request flow

```text
Browser
  |
  | REST + HttpOnly Cookie
  v
NestJS API
  |-- SessionGuard --> Prisma --> PostgreSQL
  |-- GitHubService --> GitHub Public API
  '-- AgentService
        |-- DeepSeekService --> DeepSeek API
        '-- deterministic fallback
```

The browser never receives GitHub or model tokens. All third-party requests are made by the API.

## Agent flow

1. The API reads a bounded repository context: metadata, README, tree, and selected source files.
2. Agent prompts treat repository text as untrusted data and reject instructions embedded in source content.
3. DeepSeek generates a project-grounded question or evaluates an answer.
4. Invalid model output and provider failures fall back to deterministic local behavior.
5. Structured evaluation data is persisted before the API returns the next interview state.
6. The report service aggregates stored signals by capability dimension.

## Persistence

Prisma owns the PostgreSQL schema and migration history. Relations use cascading deletes from users to sessions and interviews, and from interviews to answers. Every report and interview lookup includes the authenticated user ID.

The legacy SQLite importer is idempotent and imports only records with an authenticated owner.

## Deployment topology

```text
localhost:3002 -> web container (:3000)
localhost:4000 -> api container (:4000)
                     |
                     v
                postgres (:5432)
```

Docker Compose waits for PostgreSQL health before starting the API. The API applies committed Prisma migrations before booting, and the web container waits for the API health check.

For HTTPS deployments, set `WEB_ORIGIN` to the public frontend origin and `COOKIE_SECURE=true`. The public `NEXT_PUBLIC_API_URL` value is embedded during the web image build.

## Public repository policy

The application accepts public GitHub repository URLs only. Repository access is read-only. Private repository access, write actions, automatic code changes, and PR creation remain outside the current release.

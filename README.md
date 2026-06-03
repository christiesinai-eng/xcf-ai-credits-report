# XCF · AI Credits & Tools Report

Next.js dashboard showing AI tool usage and credit tracking across all XCF Asana projects.

## Setup

Create `.env.local`:
```
ASANA_ACCESS_TOKEN=<same value as ASANA_TOKEN in xcf-capacity-bot>
ASANA_WORKSPACE_GID=41261904390129
```

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How it works

Uses Asana's `/workspaces/{gid}/tasks/search?custom_fields.{gid}.is_set=true` to efficiently find
tasks with AI data without scanning every project. Searches all 3 custom fields in parallel and
deduplicates results. ~1–2s response time regardless of workspace size.

## Custom field GIDs

| Field | GID |
|-------|-----|
| AI Tools (XCF) | 1215403593648539 |
| # AI Credits used (XCF) | 1213617495561849 |
| Credit type (XCF) | 1215403583807476 |

## Deploy

```bash
npx vercel --prod
```

Set `ASANA_ACCESS_TOKEN` and `ASANA_WORKSPACE_GID` in Vercel project settings.

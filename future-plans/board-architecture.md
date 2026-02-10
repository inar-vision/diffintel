# Intent Board Architecture Options

## Current State

The board reads local files served by a static file server:

```
intent.json (local) → check-intent.js (local) → intent-report.json (local) → board reads files
```

Requires `git pull` and running `npm run board` to see updated state.

---

## Option 1: Zero Backend (GitHub API only)

**Complexity**: Low
**What changes**: Board fetches everything from GitHub's REST API using a personal access token.

### How it works

- `intent.json` — fetched via `GET /repos/{owner}/{repo}/contents/intent.json`
- `intent-report.json` — fetched from the latest workflow run artifact, OR the action commits the report to a known branch (e.g. `gh-pages`) or a gist
- Open PRs — fetched via `GET /repos/{owner}/{repo}/pulls?labels=intent-generated`
- Trigger workflow — already implemented via `POST /repos/{owner}/{repo}/actions/workflows/{id}/dispatches`

### Pros

- No infrastructure to maintain
- Board is a single HTML file, hostable anywhere (even `file://` with CORS workaround)
- Token already configured in the board's Settings panel

### Cons

- GitHub API rate limits (60/hr unauthenticated, 5000/hr with token)
- Artifact download requires unzipping (awkward in browser) — workaround: commit report to a branch
- Token stored in localStorage (acceptable for personal/team use, not for public deployment)
- No real-time updates (polling only)

### Artifact workaround

Have the GitHub Action commit `intent-report.json` to a dedicated `reports` branch or update a gist, making it directly fetchable without artifact unzipping.

---

## Option 2: Thin Backend

**Complexity**: Medium
**What changes**: A small server (Express, serverless function, or edge function) acts as a proxy and report store.

### How it works

```
GitHub webhook (push event)
  → Backend runs check-intent.js against repo contents
  → Stores intent-report.json
  → Board fetches from backend API
```

### Endpoints

- `GET /api/intent` — returns current intent.json from repo
- `GET /api/report` — returns latest intent-report.json
- `GET /api/prs` — returns open intent-generated PRs
- `POST /api/trigger` — triggers the GitHub Action
- `POST /api/webhook` — receives GitHub push webhooks

### Pros

- Real-time updates via webhooks (no polling)
- No token in the browser (backend holds the GitHub token)
- Can add caching, history, and richer queries
- Can host as a Vercel/Netlify/Cloudflare function

### Cons

- Infrastructure to deploy and maintain
- Need to secure the webhook endpoint
- More moving parts

---

## Option 3: Full Hosted Dashboard

**Complexity**: High
**What changes**: The board becomes a hosted web app with full GitHub integration.

### How it works

- Hosted on GitHub Pages, Vercel, or similar
- OAuth-based GitHub login (no manual token entry)
- Real-time sync via webhooks or GitHub App events
- Full approval workflow in the UI

### Features

- **Live sync**: Board always shows current repo state
- **Intent editing**: Add/edit/remove features directly in the UI, commits to repo
- **Approval flow**: When an intent-generated PR exists, show it as a pending action card with "Review", "Approve & Merge", "Close" buttons
- **History**: Track when features were added, when they became implemented, who merged the fix
- **Multi-repo**: Support multiple repos/projects from one dashboard
- **Notifications**: Alert when intent goes out of sync

### Architecture

```
GitHub App (webhooks + API)
  → Backend (Node.js / serverless)
    → Database (report history, audit log)
      → Frontend (React/Vue/vanilla, hosted)
```

### Pros

- Best user experience
- No local setup required
- Scales to teams and multiple projects
- Full audit trail

### Cons

- Significant development effort
- Needs hosting, database, OAuth setup
- Overkill for single-developer or small-team use

---

## Recommended Path

1. **Now**: Option 1 (GitHub API) — already partially implemented, gets us off local files
2. **Next**: Option 2 (thin backend) — when we need webhooks or want to remove token from browser
3. **Later**: Option 3 (full dashboard) — when the concept is validated and we want to scale

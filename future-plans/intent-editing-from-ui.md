# Intent Editing from the Board UI

## Problem

`intent.json` lives in git, which makes it inaccessible to non-technical stakeholders (product managers, business decision holders). They should be able to declare intent without touching git.

## Options

### Option A: Edit intent.json via the Board UI (recommended first step)

The board already has a GitHub token. Add a form that commits changes to `intent.json` via the GitHub Contents API.

**User flow:**
1. Open the board
2. Click "Add Feature" button
3. Fill in: ID, method (dropdown), path, type
4. Click "Save" → board commits updated `intent.json` to main via API
5. Board shows the new feature as "missing"
6. Click "Fix with AI" to trigger implementation

**Edit/delete flow:**
- Each card gets an edit icon (pencil) and delete icon
- Edit opens the form pre-filled
- Delete removes the feature and commits

**Technical implementation:**
1. Fetch current `intent.json` from GitHub API (already done)
2. Modify the features array in memory
3. Commit via `PUT /repos/{owner}/{repo}/contents/intent.json` with updated content + SHA

**Pros:**
- Minimal new code (form + one API call)
- `intent.json` stays in git (versioned, auditable)
- Works today with existing infrastructure

**Cons:**
- Still git-backed (merge conflicts possible if edited simultaneously)
- GitHub token needed (not ideal for non-technical users)
- No approval workflow for intent changes

### Option B: External Intent Store

Intent lives in a database (Supabase, Firebase, Planetscale, or even a simple JSON file on S3).

**Flow:**
1. Board reads/writes intent directly to the database
2. A sync process (webhook or scheduled job) pushes changes to `intent.json` in the repo
3. CI runs as usual

**Pros:**
- No git knowledge needed
- Can add authentication (login with email, no token)
- Real-time collaboration
- Can add approval workflows, comments, history

**Cons:**
- More infrastructure (database + sync process)
- Two sources of truth need to be kept in sync
- More development effort

### Option C: Familiar Tools Integration

Intent is managed in Google Sheets, Notion, Airtable, or similar tools business people already use.

**Flow:**
1. Business person adds a row to a spreadsheet
2. A webhook or scheduled GitHub Action reads the sheet
3. Updates `intent.json` in the repo
4. CI runs as usual

**Pros:**
- Zero learning curve for business users
- Collaborative editing built in
- Comments, history, permissions for free

**Cons:**
- Fragile integration (API changes, auth tokens expire)
- Hard to enforce schema/validation
- Two-way sync is complex
- Vendor dependency

## Recommended Path

1. **Now**: Option A — add a simple form to the board. Gets us 80% of the value with minimal effort. Good enough for demos and small teams.

2. **Later**: Option B — when we need multi-user access, approval workflows, or want to remove the GitHub token requirement.

3. **Maybe**: Option C — only if the team is already deeply embedded in Sheets/Notion and doesn't want another UI.

## Design Considerations

### Intent Schema Evolution
Currently intent features are simple (id, type, method, path). As the system grows, features might need:
- Description (human-readable purpose)
- Priority / status
- Owner / assignee
- Acceptance criteria
- Dependencies between features

The UI should be designed to accommodate additional fields without major rework.

### Approval Workflow for Intent Changes
Not every intent change should auto-trigger implementation. Consider:
- "Draft" vs "Approved" status for features
- Only approved features trigger the reconciliation
- Business person proposes, tech lead approves

### Conflict Resolution
If someone edits `intent.json` in git while someone else edits via the UI:
- Option A: last-write-wins (simple, risky)
- Option B: compare SHA before committing, show conflict if stale
- Option C: lock the file via GitHub API while editing

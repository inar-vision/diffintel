# diffintel

<p align="left">
  <a href="./docs/images/Screenshot from 2026-02-14 21-41-46.png" >
    <img src="./docs/images/Screenshot from 2026-02-14 21-41-46.png" width="300" />
  </a>
&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="./docs/images/Screenshot from 2026-02-14 21-42-02.png">
    <img src="./docs/images/Screenshot from 2026-02-14 21-42-02.png" width="300" />
  </a>
</p>

A structural diff explainer for pull requests. Parses changed files with Tree-sitter, detects structural changes (functions, classes, imports, variables), and optionally uses an LLM to generate a plain-language explanation with impact assessment and risk analysis. Outputs a self-contained HTML report and a markdown summary suitable for PR comments.

### Best with an API key! 

Diffintel combines Tree-sitter AST analysis and commit history with AI to generate grounded explanations, impact analysis, and risk assessment. The structural analysis keeps the AI focused on what actually changed in the code. Without an API key, you still get the AST-based structural analysis and diffs, but you'll miss the plain-language insights that make the tool useful.

## Install

```bash
npm install -g diffintel
```

## Usage

```bash
diffintel explain --base main --out report.html
```

With AI explanations:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
diffintel explain --base main
```

## Why?

AI agents write code fast. Sometimes faster than you can understand it. You commit the changes because they work, but what actually changed and why?
Git diffs show lines that changed. Diffintel tries to explain what those changes mean. It catches the subtle stuff: side effects, architectural shifts, and edge cases that aren't obvious from scanning the diff.

Unlike typical LLM outputs that dump everything into massive markdown files, diffintel creates focused, visual reports you can actually scan.

While it works for any codebase, it was inspired by the rise of agentic coding where change velocity increases and understanding becomes the bottleneck.

## Supported languages

JavaScript, TypeScript, Python, Go, Rust, Java, C, C++, Ruby, PHP, C#. Files in other languages still appear in the report with raw diffs.

| Flag | Default | Description |
|---|---|---|
| `--base <ref>` | `origin/main` | Base git ref |
| `--head <ref>` | `HEAD` | Head git ref |
| `--out <file>` | `explain-report.html` | Output HTML report path |
| `--summary <file>` | `<out>.md` | Output markdown summary path |

## Configuration

diffintel is configured via environment variables. You can set them directly or use a `.env` file in your working directory (loaded automatically via dotenv).

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | For AI mode | Anthropic API key. Without it you get structural-only reports. |
| `DIFFINTEL_MODEL` | No | Override the LLM model. Default: `claude-sonnet-4-5-20250929`. |

## What the report includes

- **Impact** — stakeholder-level statements about what the change means (security, reliability, etc.)
- **Fixes** — things this change repairs or restores
- **Risks** — genuine new concerns, graded low/medium/high
- **Structural changes** — functions, classes, imports added/removed/modified per file
- **Per-file explanations** — plain-language summary of each changed file
- **Collapsible diffs** — syntax-highlighted, truncated for large changes

## Example output

<details>
<summary><strong>Example Report Screenshots</strong></summary>
<br/>
<img src="./docs/images/Screenshot from 2026-02-14 21-41-46.png" width="800" />
<img src="./docs/images/Screenshot from 2026-02-14 21-42-02.png" width="800" />
</details>

The markdown summary (posted as a PR comment) looks like this:

```
### Harden git operations and improve error handling

**3 files** | **+25** added | **-12** removed

> Security protections improved for shell command execution

Shell commands in git-diff.ts now use execFileSync with array arguments
instead of string interpolation, preventing potential command injection
through crafted ref names or file paths.

**What was fixed**
- Git operations no longer pass unsanitized input through a shell

**Things to watch**
- **low** Verify CI pipelines still work with the new exec method

**Changed files**
- `src/explain/git-diff.ts` — Replaced execSync with execFileSync across all git operations
- `src/explain/llm-explain.ts` — Added error handling around the LLM API call
- `src/commands/explain.ts` — Improved error type safety in catch handler
```

The HTML report includes the same information plus collapsible syntax-highlighted diffs per file.

## GitHub Action setup

Scaffold the workflow file automatically:

```bash
diffintel init
```

This creates `.github/workflows/diffintel.yml` with the configuration below. You just need to add `ANTHROPIC_API_KEY` to your repo secrets.

## GitHub Action

Posts a summary comment on the PR and uploads the full report as an artifact:

```yaml
name: PR Explain
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  explain:
    runs-on: ubuntu-latest
    permissions:
      contents: read       # needed to checkout the repo
      pull-requests: write  # needed to post/update the PR comment
    steps:
      # fetch-depth: 0 is required — diffintel needs full git history to diff
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g diffintel

      - name: Generate report
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          # Uncomment to override the default model:
          # DIFFINTEL_MODEL: claude-haiku-4-5-20251001
        run: diffintel explain --base origin/${{ github.base_ref }}

      # Upload the full HTML report as a downloadable build artifact
      - uses: actions/upload-artifact@v4
        with:
          name: explain-report
          path: explain-report.html

      # Post or update a single PR comment with the markdown summary.
      # Uses an HTML comment tag to find and replace previous comments,
      # so each push updates the existing comment instead of creating duplicates.
      - name: Post PR comment
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          COMMENT_TAG="<!-- diffintel-report -->"
          BODY="$(cat explain-report.md)"
          BODY="${BODY//_Generated by diffintel_/_Generated by diffintel · [Full report](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }})_}"
          FULL_BODY="${COMMENT_TAG}
          ${BODY}"
          EXISTING=$(gh api "repos/${{ github.repository }}/issues/${{ github.event.pull_request.number }}/comments" \
            --jq ".[] | select(.body | startswith(\"${COMMENT_TAG}\")) | .id" | head -1)
          if [ -n "$EXISTING" ]; then
            gh api "repos/${{ github.repository }}/issues/comments/${EXISTING}" -X PATCH -f body="${FULL_BODY}"
          else
            gh pr comment "${{ github.event.pull_request.number }}" --body "${FULL_BODY}"
          fi
```

### Customizing the workflow

- **Without an API key** — remove the `ANTHROPIC_API_KEY` env line. You still get structural analysis, diffs, and stats.
- **Different model** — set `DIFFINTEL_MODEL` to any Anthropic model ID.
- **Trigger on specific paths** — add a `paths` filter under `on.pull_request` to skip non-code changes.
- **Skip the PR comment** — remove the "Post PR comment" step if you only want the artifact.

## Development

```bash
npm install
npm test
npx tsx src/cli.ts explain --base HEAD~3
```

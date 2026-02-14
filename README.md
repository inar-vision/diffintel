# diffintel

Structural diff explainer for pull requests. Parses changed JS/TS files with Tree-sitter, detects structural changes (functions, classes, imports, exports), and uses an LLM to generate a concise explanation with risk assessment. Outputs a self-contained HTML report.

## Install

```bash
npm install -g diffintel
```

## Usage

```bash
export ANTHROPIC_API_KEY=sk-ant-...
diffintel explain --base main --out report.html
```

| Flag | Default | Description |
|---|---|---|
| `--base <ref>` | `origin/main` | Base git ref |
| `--head <ref>` | `HEAD` | Head git ref |
| `--out <file>` | `explain-report.html` | Output path |

## GitHub Action

```yaml
name: PR Explain
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  explain:
    runs-on: ubuntu-latest
    steps:
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
        run: diffintel explain --base origin/${{ github.base_ref }}
      - uses: actions/upload-artifact@v4
        with:
          name: explain-report
          path: explain-report.html
```

## Development

```bash
npm install
npm test
npx tsx src/cli.ts explain --base HEAD~3
```

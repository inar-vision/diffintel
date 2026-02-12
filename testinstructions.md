Here's what you can test right now:                                                                                                                                                         
                                                                                                                                                                                            
  Core commands (no API key needed)                                                                                                                                                           
                                                                                                                                                                                            
  # Check intent coverage — should show 100% compliance                                                                                                                                       
  node src/cli.js check                                                                                                                                                                       

  # Same but JSON output
  node src/cli.js check --format json

  # One-liner for CI badges
  node src/cli.js check --format summary

  # Write report and diff against it
  node src/cli.js check --format json --out report-a.json
  # (make a change to intent.json or app.js, then)
  node src/cli.js check --diff report-a.json

  # Validate current intent.json
  node src/cli.js validate

  # Scaffold a new intent.json (try in a temp dir)
  mkdir /tmp/test-init && cd /tmp/test-init && node ~/Documents/repos/intent-spec/src/cli.js init

  # Migrate v0.1 → v0.2
  node src/cli.js migrate

  # Run the test suite
  npm test

  Things to try for drift scenarios

  - Remove a route from app.js → check should show it as missing, score drops
  - Add an undeclared route to app.js → shows as extra
  - Add a feature with "status": "draft" to intent.json → should be skipped
  - Add a "type": "middleware" feature → should show "no analyzer" warning
  - Break intent.json syntax → validate should catch it, check should exit code 2

  AI commands (need ANTHROPIC_API_KEY)

  # Generate a report with drift first, then:
  node src/cli.js propose intent-report.json
  node src/cli.js apply intent-report.json
  node src/cli.js apply --dry-run intent-report.json

  Backward compat wrappers

  node check-intent.js
  node check-intent.js --out test-report.json

  The most interesting manual test is probably creating some drift (remove a route from app.js) and then walking through the check → propose → apply flow.
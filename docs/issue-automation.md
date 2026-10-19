# Direct GitHub issue workflow

The current user instruction supersedes the earlier manual-script workflow. Manage
issues directly using `gh` through approved outside-sandbox execution. Do not run
authentication commands or generate additional manual management scripts.

The reviewed backlog is `_docs/tasks.md`; `_docs/mvp-backlog.json` contains the same
48 task descriptions and 144 acceptance criteria. `docs/issue-map.json` records
actual GitHub issue numbers returned by GitHub, never assumed from task IDs.

Before creating work, inspect all open and closed issues to avoid duplicate stable
task IDs. Every MVP issue carries `mvp`, priority, area, dependencies, expected files
and acceptance criteria. Preserve existing issue history and the repository layout.

Implement in dependency order. Run relevant tests and exercise all acceptance
criteria, including negative cases. Record the exact commands and actual outcomes
in `docs/process.md` and the corresponding issue. Commit only scoped changes,
reference the issue number and push without rewriting published history.

Close an issue directly only after its corresponding implementation and acceptance
criteria have been verified. Use its mapped actual number, post concrete evidence,
and close with reason `completed`. Keep incomplete and untested issues open.
Record completed/open/blocked counts in progress reports; dependency waiting does
not imply an external blocker.

`docs/verification.json` records task status, tested revision, criterion IDs and
checks. Verification applies to the implemented task and tested files; unrelated
pre-existing local changes are excluded from commits and never treated as verified.
Later changes affecting the task require relevant checks to run again. Closure must
not be inferred from a mock test when a real backend or browser test is required.

Request approval whenever execution requires it. If approved direct operations stop
working, report the exact failure before proposing the manual fallback.

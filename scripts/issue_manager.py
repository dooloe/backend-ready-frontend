"""Issue synchronization using the caller's existing gh login; no auth commands.

Default mode is an offline preview. Network writes require --apply.
Only the Python standard library and GitHub CLI are needed.
"""

import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
REPO_PATTERN = r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+"


def run(args, root):
    result = subprocess.run(args, cwd=root, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(f"Command failed: {args[0]} {args[1]}\n{result.stderr.strip()}")
    return result.stdout.strip()


def gh(root, *args):
    return run(["gh", *args], root)


def read_json(path):
    return json.loads(path.read_text())


def save_json(path, data):
    # Atomic replacement leaves a usable map after interrupted imports.
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as stream:
        json.dump(data, stream, indent=2)
        stream.write("\n")
        temporary = Path(stream.name)
    temporary.replace(path)


@contextmanager
def import_lock(root):
    # The directory descriptor needs no extra repository file. Serializes this
    # checkout only: do not run imports concurrently from separate checkouts.
    descriptor = os.open(root, os.O_RDONLY)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(descriptor)


def load_backlog(root):
    data = read_json(root / "_docs/mvp-backlog.json")
    if not re.fullmatch(REPO_PATTERN, data["repository"]):
        raise ValueError("Invalid repository name in backlog")
    seen = set()
    for task in data["tasks"]:
        if not re.fullmatch(r"KEZEK-\d{3}", task["id"]) or task["id"] in seen:
            raise ValueError("Task IDs must be unique KEZEK-NNN values")
        if not set(task["dependencies"]) <= seen:
            raise ValueError(f"{task['id']}: dependencies must precede this task")
        criteria = task["acceptance"]
        if not criteria or len({c['id'] for c in criteria}) != len(criteria):
            raise ValueError("Acceptance criteria must be present with unique IDs")
        seen.add(task["id"])
    return data


def marker(task):
    return f"<!-- kezek-task:{task['id']} -->"


def matches(issue, task):
    return marker(task) in (issue.get("body") or "") or issue["title"] == task["title"]


def find_issue(issues, task):
    found = [issue for issue in issues if matches(issue, task)]
    if len(found) > 1:
        raise ValueError(f"Multiple issues match {task['id']}; resolve duplicates manually")
    return found[0] if found else None


def body_for(task, repo, mapping):
    deps = []
    for dep in task["dependencies"]:
        issue = mapping["issues"].get(dep)
        deps.append(f"- {dep}: https://github.com/{repo}/issues/{issue['number']}" if issue else f"- {dep} (see `_docs/tasks.md`)")
    criteria = "\n".join(f"- [ ] **{c['id']}:** {c['text']}." for c in task["acceptance"])
    return (
        f"{marker(task)}\n\nGoal: {task['goal']}\n\nDescription: {task['description']}\n\n"
        f"Priority: {task['priority']}\nArea: {task['area']}\n\n"
        "## Context\n\nKezek virtual queue MVP: existing React/TypeScript/TanStack frontend; "
        "FastAPI, SQLAlchemy, Alembic and SQLite backend. Preserve repository structure "
        "and working frontend code. Read `AGENTS.md`, `docs/plan.md`, `docs/architecture.md` "
        "and the agreed API contract.\n\n"
        "## Dependencies\n\n" + ("\n".join(deps) or "None") + "\n\n"
        "## Expected files\n\n" + ", ".join(f"`{p}`" for p in task['expected_files']) + "\n\n"
        "## Acceptance criteria\n\n" + criteria + "\n\n"
        "Given the stated prerequisites and isolated test data, when this task's behavior "
        "is exercised, then every criterion above must pass, including rejection cases. "
        "Record exact commands, outcomes and any manual evidence in `docs/process.md`; "
        "record closure eligibility in `docs/verification.json`. Never close from a mock-only "
        "test when the task requires the real backend.\n\nSource: `_docs/tasks.md`, " + task['id'] + ".\n"
    )


def fetch_issues(root, repo):
    pages = json.loads(gh(root, "api", "--paginate", "--slurp",
        f"repos/{repo}/issues?state=all&per_page=100"))
    return [issue for page in pages for issue in page if "pull_request" not in issue]


def load_mapping(root, repo):
    path = root / "docs/issue-map.json"
    mapping = read_json(path) if path.exists() else {"repository": repo, "issues": {}}
    if mapping["repository"] != repo:
        raise ValueError("Issue map repository does not match backlog")
    return mapping


def create(root, backlog, apply):
    repo = backlog["repository"]
    mapping = load_mapping(root, repo)
    if not apply:
        for task in backlog["tasks"]:
            print(f"PREVIEW {task['id']}: {task['title']}")
        print(f"{len(backlog['tasks'])} tasks; no GitHub calls or file writes. Use --apply to synchronize.")
        return

    issues = fetch_issues(root, repo)  # Fail before writes if inaccessible.
    for task in backlog["tasks"]:
        find_issue(issues, task)  # Detect ambiguity before creating anything.
    gh(root, "label", "create", "mvp", "--repo", repo, "--color", "0E8A16",
       "--description", "Required MVP work", "--force")
    for task in backlog["tasks"]:
        issue = find_issue(issues, task)
        if issue is None:
            with tempfile.TemporaryDirectory(prefix="kezek-issue-") as directory:
                path = Path(directory) / "body.md"
                path.write_text(body_for(task, repo, mapping))
                url = gh(root, "issue", "create", "--repo", repo, "--title", task["title"],
                         "--body-file", str(path), "--label", "mvp")
            found = re.fullmatch(rf"https://github\.com/{re.escape(repo)}/issues/(\d+)", url)
            if not found:
                raise ValueError("Unexpected create response; rerun to rediscover the issue safely")
            issue = {"number": int(found[1]), "title": task["title"],
                     "body": marker(task), "html_url": url, "state": "open"}
            issues.append(issue)
            print(f"CREATED {task['id']}: {url}")
        else:
            # Existing closed issues count as duplicates too. Never reopen or
            # overwrite an existing body's edits during a repeat import.
            gh(root, "issue", "edit", str(issue["number"]), "--repo", repo, "--add-label", "mvp")
            print(f"EXISTS {task['id']}: #{issue['number']} ({issue['state']})")
        mapping["issues"][task["id"]] = {
            "number": issue["number"],
            "url": f"https://github.com/{repo}/issues/{issue['number']}",
        }
        save_json(root / "docs/issue-map.json", mapping)


def verified_tasks(root, backlog):
    ledger = read_json(root / "docs/verification.json")
    if ledger["repository"] != backlog["repository"]:
        raise ValueError("Verification repository mismatch")
    candidates = [t for t in backlog["tasks"] if ledger["tasks"].get(t["id"], {}).get("status") == "verified"]
    if not candidates:
        return []
    head = run(["git", "rev-parse", "HEAD"], root)
    if run(["git", "status", "--porcelain", "--untracked-files=all"], root):
        raise ValueError("Closure requires a clean checkout; commit verified work and its evidence first")
    for task in candidates:
        record = ledger["tasks"][task["id"]]
        revision = record.get("revision")
        # Evidence may be committed after the tested code. Restrict later commits
        # to closure evidence only, so any application/test/backlog change expires it.
        if not revision or run(["git", "merge-base", revision, head], root) != revision:
            raise ValueError(f"{task['id']}: verification revision is not an ancestor of HEAD")
        changed = run(["git", "diff", "--name-only", revision, head], root).splitlines()
        if any(p not in {"docs/verification.json", "docs/issue-map.json", "docs/process.md"}
               and not p.startswith("docs/verification-evidence/") for p in changed):
            raise ValueError(f"{task['id']}: code or acceptance criteria changed after verification")
        if sorted(record.get("criteria", [])) != sorted(c["id"] for c in task["acceptance"]):
            raise ValueError(f"{task['id']}: not every acceptance criterion is verified")
        checks = record.get("checks", [])
        if not checks:
            raise ValueError(f"{task['id']}: verification checks are missing")
        for check in checks:
            if check.get("exit_code") != 0 or not check.get("command") or not check.get("summary"):
                raise ValueError(f"{task['id']}: missing or unsuccessful verification")
            relative = Path(check.get("evidence", ""))
            path = (root / relative).resolve()
            if relative.is_absolute() or not path.is_relative_to((root / "docs/verification-evidence").resolve()) or not path.is_file():
                raise ValueError(f"{task['id']}: evidence must be a file in docs/verification-evidence/")
            if hashlib.sha256(path.read_bytes()).hexdigest() != check.get("sha256"):
                raise ValueError(f"{task['id']}: evidence hash mismatch")
    return [(t, ledger["tasks"][t["id"]]) for t in candidates]


def close(root, backlog, apply):
    eligible = verified_tasks(root, backlog)
    if not eligible:
        print("No verified tasks eligible for closure. No GitHub calls or changes.")
        return
    repo = backlog["repository"]
    mapping = load_mapping(root, repo)
    for task, record in eligible:
        mapped = mapping["issues"].get(task["id"], {})
        if type(mapped.get("number")) is not int or mapped["number"] < 1:
            raise ValueError(f"{task['id']}: actual GitHub number missing; run create_issues.sh --apply first")
        print(f"{'CHECK' if apply else 'PREVIEW'} {task['id']}: #{mapped['number']} at {record['revision']}")
    if not apply:
        print("No GitHub calls or changes. Use --apply after reviewing evidence.")
        return
    issues = fetch_issues(root, repo)
    planned = []
    for task, record in eligible:
        number = mapping["issues"][task["id"]]["number"]
        issue = find_issue(issues, task)
        if issue is None or issue["number"] != number:
            raise ValueError(f"{task['id']}: live issue identity does not match saved number")
        if "mvp" not in [label["name"] for label in issue.get("labels", [])]:
            raise ValueError(f"{task['id']}: live issue does not carry mvp label")
        planned.append((issue, task, record))
    # Preflight ALL identities/evidence before any closures.
    for issue, task, record in planned:
        if issue["state"] == "closed":
            print(f"ALREADY CLOSED {task['id']}: #{issue['number']}")
            continue
        note = (f"Verified completion of {task['id']} at revision {record['revision']}.\n\n"
                + "\n".join(f"- `{c['command']}`: {c['summary']} (exit 0); evidence: `{c['evidence']}`"
                            for c in record["checks"]))
        with tempfile.TemporaryDirectory(prefix="kezek-close-") as directory:
            path = Path(directory) / "comment.md"
            path.write_text(note)
            gh(root, "issue", "comment", str(issue["number"]), "--repo", repo, "--body-file", str(path))
        gh(root, "issue", "close", str(issue["number"]), "--repo", repo, "--reason", "completed")
        print(f"CLOSED {task['id']}: #{issue['number']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["create", "close"])
    parser.add_argument("--apply", action="store_true", help="Perform GitHub writes; default is offline preview")
    args = parser.parse_args()
    try:
        with import_lock(ROOT):
            backlog = load_backlog(ROOT)
            (create if args.operation == "create" else close)(ROOT, backlog, args.apply)
    except (OSError, ValueError, KeyError, RuntimeError) as exc:
        print(f"Stopped: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

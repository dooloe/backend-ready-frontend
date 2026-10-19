"""Offline tests: no real gh, credentials, network, or issue writes."""

import copy
from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "issue_manager.py"
spec = importlib.util.spec_from_file_location("issue_manager", MODULE_PATH)
manager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manager)


class IssueManagerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / "docs/verification-evidence").mkdir(parents=True)
        self.backlog = copy.deepcopy(manager.load_backlog(MODULE_PATH.parents[1]))
        self.backlog["tasks"] = self.backlog["tasks"][:2]
        self.map_path = self.root / "docs/issue-map.json"
        manager.save_json(self.map_path, {"repository": self.backlog["repository"], "issues": {}})
        self.ledger = {"repository": self.backlog["repository"], "tasks": {
            task["id"]: {"status": "pending"} for task in self.backlog["tasks"]}}
        self.save_ledger()
        self.calls = []
        self.issues = []
        self.output = redirect_stdout(io.StringIO())
        self.output.__enter__()
        self.addCleanup(self.output.__exit__, None, None, None)

    def save_ledger(self):
        manager.save_json(self.root / "docs/verification.json", self.ledger)

    def fake_gh(self, root, *args):
        self.calls.append(args)
        if args[0] == "api":
            return json.dumps([self.issues])
        if args[:2] == ("issue", "create"):
            number = 81 + len(self.issues)
            body = Path(args[args.index("--body-file") + 1]).read_text()
            self.issues.append({"number": number, "title": args[args.index("--title") + 1],
                                "body": body, "state": "open", "labels": [{"name": "mvp"}]})
            return f"https://github.com/{self.backlog['repository']}/issues/{number}"
        if args[:2] == ("issue", "close"):
            next(i for i in self.issues if i["number"] == int(args[2]))["state"] = "closed"
        return ""

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.root, check=True,
                              capture_output=True, text=True).stdout.strip()

    def verified(self):
        self.git("init", "-q")
        self.git("config", "user.email", "test@example.com")
        self.git("config", "user.name", "Test")
        (self.root / "application.txt").write_text("tested code")
        self.git("add", ".")
        self.git("commit", "-qm", "Application under test")
        revision = self.git("rev-parse", "HEAD")
        evidence = self.root / "docs/verification-evidence/task-001.txt"
        evidence.write_text("A real test transcript would be saved here; test fixture only.\n")
        self.ledger["tasks"]["KEZEK-001"] = {
            "status": "verified", "revision": revision,
            "criteria": [c["id"] for c in self.backlog["tasks"][0]["acceptance"]],
            "checks": [{"command": "python3 -m unittest", "exit_code": 0,
                        "summary": "Fixture verification", "evidence": str(evidence.relative_to(self.root)),
                        "sha256": hashlib.sha256(evidence.read_bytes()).hexdigest()}]}
        self.save_ledger()
        self.git("add", ".")
        self.git("commit", "-qm", "Record evidence")

    def test_previews_and_pending_closure_do_not_call_github(self):
        with patch.object(manager, "gh", side_effect=AssertionError("Must stay offline")):
            manager.create(self.root, self.backlog, False)
            manager.close(self.root, self.backlog, False)
            manager.close(self.root, self.backlog, True)
        self.assertEqual(manager.read_json(self.map_path)["issues"], {})

    def test_creation_is_resumable_and_closed_issues_are_not_duplicated(self):
        with patch.object(manager, "gh", side_effect=self.fake_gh):
            manager.create(self.root, self.backlog, True)
            self.issues[0]["state"] = "closed"
            manager.create(self.root, self.backlog, True)
        self.assertEqual(len(self.issues), 2)
        self.assertEqual(manager.read_json(self.map_path)["issues"]["KEZEK-001"]["number"], 81)
        self.assertTrue(all("--body-file" in c for c in self.calls if c[:2] == ("issue", "create")))
        self.assertFalse(any(c[:2] == ("auth", "login") for c in self.calls))

    def test_manual_exact_title_is_adopted_and_renamed_marker_is_matched(self):
        first, second = self.backlog["tasks"]
        self.issues = [{"number": 125, "title": first["title"], "body": "manual", "state": "closed"},
                       {"number": 150, "title": "Renamed", "body": manager.marker(second), "state": "open"}]
        with patch.object(manager, "gh", side_effect=self.fake_gh):
            manager.create(self.root, self.backlog, True)
        self.assertFalse(any(c[:2] == ("issue", "create") for c in self.calls))
        self.assertEqual(manager.read_json(self.map_path)["issues"][second["id"]]["number"], 150)

    def test_duplicate_matches_abort_before_mutations(self):
        title = self.backlog["tasks"][0]["title"]
        self.issues = [{"number": n, "title": title, "body": ""} for n in (4, 9)]
        with patch.object(manager, "gh", side_effect=self.fake_gh):
            with self.assertRaisesRegex(ValueError, "Multiple issues"):
                manager.create(self.root, self.backlog, True)
        self.assertEqual(len(self.calls), 1)

    def test_paginated_fetch_filters_pull_requests(self):
        with patch.object(manager, "gh", return_value=json.dumps([
            [{"number": 2}, {"number": 3, "pull_request": {}}], [{"number": 4}]])):
            self.assertEqual([i["number"] for i in manager.fetch_issues(self.root, "owner/repo")], [2, 4])

    def test_interrupted_creation_rediscovers_remote_issue(self):
        def fail_after_remote_write(root, *args):
            result = self.fake_gh(root, *args)
            if args[:2] == ("issue", "create"):
                raise RuntimeError("Lost response after server accepted issue")
            return result
        with patch.object(manager, "gh", side_effect=fail_after_remote_write):
            with self.assertRaises(RuntimeError):
                manager.create(self.root, self.backlog, True)
        with patch.object(manager, "gh", side_effect=self.fake_gh):
            manager.create(self.root, self.backlog, True)
        self.assertEqual(len(self.issues), 2)

    def test_incomplete_criteria_and_failed_checks_cannot_close(self):
        self.verified()
        record = self.ledger["tasks"]["KEZEK-001"]
        record["criteria"].pop()
        self.save_ledger()
        self.git("add", ".")
        self.git("commit", "-qm", "Incomplete evidence")
        with self.assertRaisesRegex(ValueError, "not every acceptance"):
            manager.verified_tasks(self.root, self.backlog)
        record["criteria"] = [c["id"] for c in self.backlog["tasks"][0]["acceptance"]]
        record["checks"][0]["exit_code"] = 1
        self.save_ledger()
        self.git("add", ".")
        self.git("commit", "-qm", "Failed check")
        with self.assertRaisesRegex(ValueError, "unsuccessful verification"):
            manager.verified_tasks(self.root, self.backlog)

    def test_changed_code_or_dirty_tree_invalidates_evidence(self):
        self.verified()
        self.assertEqual(len(manager.verified_tasks(self.root, self.backlog)), 1)
        (self.root / "application.txt").write_text("untested new code")
        with self.assertRaisesRegex(ValueError, "clean checkout"):
            manager.verified_tasks(self.root, self.backlog)
        self.git("add", ".")
        self.git("commit", "-qm", "Change after testing")
        with self.assertRaisesRegex(ValueError, "changed after verification"):
            manager.verified_tasks(self.root, self.backlog)

    def test_missing_or_tampered_evidence_cannot_close(self):
        self.verified()
        path = self.root / self.ledger["tasks"]["KEZEK-001"]["checks"][0]["evidence"]
        path.write_text("changed transcript")
        self.git("add", ".")
        self.git("commit", "-qm", "Tampered evidence")
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            manager.verified_tasks(self.root, self.backlog)
        path.unlink()
        self.git("add", ".")
        self.git("commit", "-qm", "Missing evidence")
        with self.assertRaisesRegex(ValueError, "evidence must be a file"):
            manager.verified_tasks(self.root, self.backlog)

    def test_closure_uses_actual_number_and_skips_pending_and_closed(self):
        with patch.object(manager, "gh", side_effect=self.fake_gh):
            manager.create(self.root, self.backlog, True)
            self.verified()
            manager.close(self.root, self.backlog, True)
            manager.close(self.root, self.backlog, True)
        closes = [c for c in self.calls if c[:2] == ("issue", "close")]
        self.assertEqual(len(closes), 1)
        self.assertEqual(closes[0][2], "81")
        self.assertEqual(self.issues[1]["state"], "open")

    def test_wrong_issue_number_aborts_without_closing(self):
        with patch.object(manager, "gh", side_effect=self.fake_gh):
            manager.create(self.root, self.backlog, True)
            mapping = manager.read_json(self.map_path)
            mapping["issues"]["KEZEK-001"]["number"] = 82
            manager.save_json(self.map_path, mapping)
            self.verified()
            with self.assertRaisesRegex(ValueError, "identity does not match"):
                manager.close(self.root, self.backlog, True)
        self.assertFalse(any(c[:2] == ("issue", "close") for c in self.calls))

    def test_backlog_matches_markdown_and_is_in_dependency_order(self):
        backlog = manager.load_backlog(MODULE_PATH.parents[1])
        markdown = (MODULE_PATH.parents[1] / "_docs/tasks.md").read_text()
        self.assertEqual(len(backlog["tasks"]), 48)
        for task in backlog["tasks"]:
            self.assertIn("## " + task["title"], markdown)
            self.assertIn(task["description"], markdown)
            for criterion in task["acceptance"]:
                self.assertIn(criterion["text"], markdown)


if __name__ == "__main__":
    unittest.main()

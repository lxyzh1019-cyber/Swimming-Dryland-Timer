#!/usr/bin/env python3
"""Stop hook: if files were changed (or a worker was dispatched) this turn, the working record must be
updated and a regression table produced. Governance-only edits are exempt from the regression table."""
import re, sys
from _common import (read_hook_input, load_config, read_transcript, last_turn, last_assistant_text,
                     tool_uses, is_governance_path, block)

data = read_hook_input()
if data.get("stop_hook_active"):
    sys.exit(0)
cfg = load_config()
turn = last_turn(read_transcript(data.get("transcript_path")))
edits = tool_uses(turn, {"Edit", "Write", "MultiEdit", "NotebookEdit"})
dispatched = bool(tool_uses(turn, {"Agent", "Task"}))
paths = [(e.get("input") or {}).get("file_path") or (e.get("input") or {}).get("path") or "" for e in edits]
source_paths = [p for p in paths if p and not is_governance_path(p, cfg)]
record_touched = any(p.endswith(cfg["record_file"]) for p in paths)
if not source_paths and not dispatched:
    sys.exit(0)
text = last_assistant_text(turn)
problems = []
if not record_touched:
    problems.append(f"update {cfg['record_file']} (request ledger, hotspot counter, deliverable ledger)")
if not re.search(cfg["regression_table_pattern"], text):
    problems.append("end with the regression table (kept / added / intentionally removed / missing) "
                    f"against {cfg['features_file']}, and update the manifest if features changed")
if problems:
    block("Implementation happened this turn but the record is incomplete. Before finishing: " + "; ".join(problems) + ".")
sys.exit(0)

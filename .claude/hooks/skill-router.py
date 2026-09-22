#!/usr/bin/env python3
"""UserPromptSubmit hook: deterministic skill invocation from keyword rules in skill-router.json."""
import json, os, re, sys
from _common import read_hook_input, add_context, log, PROJECT_DIR

RULES = os.path.join(PROJECT_DIR, ".claude", "hooks", "skill-router.json")
data = read_hook_input()
prompt = (data.get("prompt") or "")
low = prompt.lower()
try:
    rules = json.load(open(RULES, encoding="utf-8"))
except (OSError, ValueError):
    sys.exit(0)
hits = []
for skill, spec in rules.get("skills", {}).items():
    if any(k.lower() in low for k in spec.get("keywords", [])) or \
       any(re.search(p, prompt, re.I) for p in spec.get("patterns", [])):
        hits.append((skill, spec.get("note", "")))
if not hits:
    sys.exit(0)
log("skill-router", {"hits": [h[0] for h in hits]})
lines = [f"- Invoke skill `{s}`" + (f" — {n}" if n else "") for s, n in hits]
add_context("UserPromptSubmit", "[skill-router] Matched skills for this prompt:\n" + "\n".join(lines) +
            "\nIf a matched skill does not fit, say why in one line rather than silently skipping it.")

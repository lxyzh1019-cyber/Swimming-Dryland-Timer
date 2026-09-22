#!/usr/bin/env python3
"""UserPromptSubmit hook: decide micro-plan vs full Plan vN and tell the session."""
import sys
from _common import read_hook_input, load_config, count_bullets, add_context, log

data = read_hook_input()
prompt = data.get("prompt") or ""
cfg = load_config()
bullets = count_bullets(prompt)
low = prompt.lower()
triggers = [t for t in cfg["design_triggers"] if t in low]
if bullets >= 3 or triggers:
    why = f"{bullets} bullets" if bullets >= 3 else "design/diagnostic trigger: " + ", ".join(triggers)
    log("plan-gate", {"tier": "full", "why": why})
    add_context("UserPromptSubmit",
                f"[plan-gate] Full 'Plan vN — Title — Awaiting approval' is required for this request ({why}). "
                "Do not edit files before approval. If this is a follow-up on an already approved plan, present "
                "the revision with Rev-N coloured changes instead of a new plan.")
if bullets >= 1 or len(prompt) > 200:
    log("plan-gate", {"tier": "micro", "bullets": bullets})
    add_context("UserPromptSubmit",
                "[plan-gate] Micro-plan tier: target, files touched, one-line approach, one success check — then wait "
                "for approval. Escalate to a full Plan vN if the work touches shared state, config, or the data model.")
sys.exit(0)

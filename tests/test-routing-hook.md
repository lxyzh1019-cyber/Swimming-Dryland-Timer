# Routing guard — measured test (turns "Uncertain" into a result)

Goal: learn whether a PreToolUse hook can tell an `opus-worker` edit from a main-session edit, then switch the guard from `observe` to `enforce` only if it can.

## Step 0 — unit replay (in a cloud session)
Ask the session to run `bash tests/replay-hooks.sh` — all 14 checks must pass. This proves the scripts parse and block correctly; it does not prove field names in real hook input.

## Step 1 — observe real input (cloud session on `main` after install; approve the plan so edits can run)
1. `config.json` has `"routing_guard_mode": "observe"` (default).
2. Create a scratch file `scratch/probe.txt`.
3. Prompt: "Directly edit scratch/probe.txt: append the line MAIN." → main session edits.
4. Prompt: "Use the opus-worker subagent to append the line WORKER to scratch/probe.txt." → worker edits.
5. Prompt: "Show me .claude/state/routing-guard.jsonl." Two records. Compare `hook_keys`, `markers`, `env`.

## Step 2 — decide
- If the worker record contains a field the main record lacks (or a different `session_id` / an `agent_*` key / an `AGENT` env var): put those field names in `config.json` → `"subagent_marker_fields": ["<field>"]`, set `"routing_guard_mode": "enforce"`, ask the session to commit the config change, start a new cloud session, repeat step 1. Expected: prompt 3 is denied with the routing reason; prompt 4 succeeds.
- If the two records are indistinguishable: leave `observe`. The rule stays Prose, and the log is still useful as an audit trail (every main-session edit is recorded with its path).

## Step 3 — clean up
Ask the session to delete `scratch/` and commit.

Record the outcome in WORKING_RECORD.md → Checks and evidence.

#!/usr/bin/env bash
# usage: run-scenario.sh <scenario.cjs> <mode> [outfile]   (WAIT_MS / PROMPT_MS / AUTO_ENTER optional)
# Uses the throwaway project + node-pty install under the scratchpad (see learnings report for how they are created).
SP=/tmp/claude-1002/-home-ailton-Workspaces-Projects-agents-office/5782ce01-69e7-4fb7-b697-f34990097960/scratchpad/spike
HERE="$(cd "$(dirname "$0")" && pwd)"
export NODE_PATH=$SP/pty/node_modules SPIKE_DIR=$SP/out PROJ=$SP/proj
cd "$SP/pty"
: > "$SPIKE_DIR/events.log"; : > "$SPIKE_DIR/payloads.jsonl"; rm -f "$SPIKE_DIR"/hookvars-*.txt "$SPIKE_DIR"/sleeper.pid
node "$HERE/$1" "${@:2}"
echo "=== events.log"; cat "$SPIKE_DIR/events.log"
echo "=== hook vars"; cat "$SPIKE_DIR"/hookvars-*.txt 2>/dev/null | cut -c1-200

#!/usr/bin/env bash
# Throwaway PermissionRequest hook. Logs stdin + env, then acts per $SPIKE_DIR/mode.
# mode values: allow | deny | empty | sleep:N[:allow|empty] | pidfile (sleep 600 and write pid)
SPIKE_DIR="${SPIKE_DIR:-$(dirname "$0")/out}"
mkdir -p "$SPIKE_DIR"
IN="$(cat)"
TS="$(date +%s.%N)"
echo "$TS START pid=$$ ppid=$PPID parent=$(ps -o comm= -p $PPID) term=${AGENTS_OFFICE_TERMINAL_ID:-<unset>}" >> "$SPIKE_DIR/events.log"
printf '%s\n' "$IN" >> "$SPIKE_DIR/payloads.jsonl"
env | grep -E '^(AGENTS_OFFICE|CLAUDE|PATH=)' | sort >> "$SPIKE_DIR/hookvars-$$.txt"
MODE="$(cat "$SPIKE_DIR/mode" 2>/dev/null || echo empty)"
case "$MODE" in
  allow) echo '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}';;
  deny) echo '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"SPIKE_DENY_MARKER: use another approach, do not run this"}}}';;
  empty) ;;
  exit1) echo 'spike stderr exit1' >&2; echo "$(date +%s.%N) END exit1" >> "$SPIKE_DIR/events.log"; exit 1;;
  exit2) echo 'SPIKE_STDERR_EXIT2_MARKER' >&2; echo "$(date +%s.%N) END exit2" >> "$SPIKE_DIR/events.log"; exit 2;;
  sleep:*) IFS=: read -r _ N AFTER <<<"$MODE"; echo $$ > "$SPIKE_DIR/sleeper.pid"; sleep "$N"
     if [ "$AFTER" = allow ]; then echo '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}'; fi;;
esac
echo "$(date +%s.%N) END pid=$$ mode=$MODE" >> "$SPIKE_DIR/events.log"
exit 0

#!/usr/bin/env bash
# Logs every hook event payload (one JSON per line, with epoch) to $SPIKE_DIR/allevents.jsonl
SPIKE_DIR="${SPIKE_DIR:-$(dirname "$0")/out}"; mkdir -p "$SPIKE_DIR"
IN="$(cat)"; printf '{"_epoch":%s,"_payload":%s}\n' "$(date +%s.%N)" "$IN" >> "$SPIKE_DIR/allevents.jsonl"
exit 0

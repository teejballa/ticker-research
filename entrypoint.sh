#!/bin/bash
set -e

# Pre-warm display subsystem on :99
# pyvirtualdisplay in /vnc-start allocates its own display number dynamically (not :99)
Xvfb :99 -screen 0 1280x960x24 &
XVFB_PID=$!

# Poll for :99 lock file — up to 10 seconds
for i in $(seq 1 20); do
  if [ -f /tmp/.X99-lock ]; then
    break
  fi
  sleep 0.5
done

export DISPLAY=:99
export PORT="${PORT:-8080}"

# exec replaces this bash process — python3 becomes PID 1 heir and receives SIGTERM directly
exec python3 scripts/container_server.py

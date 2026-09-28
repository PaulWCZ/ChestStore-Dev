#!/bin/sh
# Stops a harness and its tool: node lab/chest-dev/stop.sh-style, by port.
#   sh lab/chest-dev/stop.sh 4000
port=${1:-4000}
fuser -k "$port/tcp" "$((port + 1))/tcp" 2>/dev/null
exit 0

#!/bin/sh
# Stops a harness and its tool, by port: the team host, the tool, the
# public host.
#   sh lab/chest-dev/stop.sh 4000
port=${1:-4000}
fuser -k "$port/tcp" "$((port + 1))/tcp" "$((port + 2))/tcp" 2>/dev/null
exit 0

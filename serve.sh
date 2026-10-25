#!/bin/sh
# Serve Branches Mind Mapper at http://localhost:8080.
# Google sign-in needs a web address registered on the OAuth client, so opening index.html as a file won't work.
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8080}"
echo "Branches Mind Mapper is running at http://localhost:$PORT  (Ctrl+C to stop)"
exec python3 -m http.server "$PORT" --bind 127.0.0.1

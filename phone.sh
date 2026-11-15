#!/bin/sh
# Opens the local build to your phone over HTTPS (WebGPU needs a secure context).
# 1. Serves this folder on http://localhost:8080 (if nothing is serving it yet)
# 2. Starts a Cloudflare quick tunnel and prints an https://<random>.trycloudflare.com URL
# Open that URL on the phone (add ?debug for the performance overlay). Ctrl-C stops the tunnel.
# Note: the URL is public while the tunnel runs (unguessable, but not private).
cd "$(dirname "$0")"
curl -sI http://localhost:8080 >/dev/null 2>&1 || (python3 -m http.server 8080 >/dev/null 2>&1 &)
sleep 1
exec cloudflared tunnel --url http://localhost:8080

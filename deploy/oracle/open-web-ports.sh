#!/usr/bin/env bash
set -euo pipefail
# Keep OCI's SSH/service rules; add only the two public TCP web ports.
for port in 80 443; do
  iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
done

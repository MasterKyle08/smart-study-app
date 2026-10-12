#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo 'Run this script with sudo bash deploy/oracle/bootstrap.sh' >&2
  exit 1
fi
source /etc/os-release
if [[ "$ID" != ubuntu || "$VERSION_ID" != 26.04 ]]; then
  echo 'This setup is written for Ubuntu 26.04. Check cat /etc/os-release before continuing.' >&2
  exit 1
fi
if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
  echo 'UFW is active. Review the firewall before continuing; see the Oracle guide.' >&2
  exit 1
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git openssl screen unzip

# Save the OCI host firewall before Docker installs its dynamic rules.
# Never flush OCI's existing SSH or metadata/service rules.
if ! command -v netfilter-persistent >/dev/null; then
  echo 'iptables-persistent iptables-persistent/autosave_v4 boolean false' | debconf-set-selections
  echo 'iptables-persistent iptables-persistent/autosave_v6 boolean false' | debconf-set-selections
  DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
fi
if [[ ! -s /etc/iptables/rules.v4 ]]; then
  if systemctl is-active --quiet docker; then
    echo 'Missing base firewall persistence on an existing Docker server; review it before continuing.' >&2
    exit 1
  fi
  netfilter-persistent save
fi
systemctl enable netfilter-persistent

# Apply the web rules after the base firewall at boot. This avoids saving
# Docker's dynamic chains into iptables-persistent, including on reruns.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install -m 0755 "$script_dir/open-web-ports.sh" /usr/local/sbin/smart-study-open-web-ports
cat > /etc/systemd/system/smart-study-web-ports.service <<'EOF'
[Unit]
Description=Open Smart Study HTTP and HTTPS ports in the OCI host firewall
After=netfilter-persistent.service
Before=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/smart-study-open-web-ports
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable smart-study-web-ports.service
systemctl restart smart-study-web-ports.service

# Official Docker apt repository, including native ARM64 builds.
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker compose version
echo 'Server setup complete. Next: configure .env and run bash deploy/oracle/deploy.sh'

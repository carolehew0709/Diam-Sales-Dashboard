#!/usr/bin/env bash
set -euo pipefail

if [[ $(id -un) != ubuntu ]]; then
  echo 'Run as ubuntu, not root.' >&2
  exit 1
fi
node_bin=$(command -v node)
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
deploy_root=/home/ubuntu/diam-deploy
shared=/home/ubuntu/diam-dashboard
test -f "$shared/.env.local"
test -f "$shared/certs/global-bundle.pem"
mkdir -p "$deploy_root/releases"
chmod 700 "$deploy_root"
install -m 700 "$script_dir/aws-auto-deploy.mjs" "$deploy_root/auto-deploy.mjs"
if [[ ! -L "$deploy_root/current" ]]; then
  test ! -e "$deploy_root/current"
  ln -s "$shared" "$deploy_root/current"
fi

sudo tee /etc/systemd/system/diam-dashboard.service >/dev/null <<EOF
[Unit]
Description=DIAM APAC Dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=$deploy_root/current
Environment=NODE_ENV=production
Environment=PATH=$(dirname "$node_bin"):/usr/local/bin:/usr/bin:/bin
ExecStart=$node_bin $deploy_root/current/node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
UMask=0077

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/diam-auto-deploy.service >/dev/null <<EOF
[Unit]
Description=Deploy CI-approved DIAM main updates
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=ubuntu
WorkingDirectory=$deploy_root
Environment=PATH=$(dirname "$node_bin"):/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/flock -n $deploy_root/deploy.lock $node_bin $deploy_root/auto-deploy.mjs
TimeoutStartSec=20min
UMask=0077
EOF

sudo tee /etc/systemd/system/diam-auto-deploy.timer >/dev/null <<'EOF'
[Unit]
Description=Check DIAM main for approved updates every two minutes

[Timer]
OnBootSec=2min
OnUnitInactiveSec=2min
AccuracySec=10s
Unit=diam-auto-deploy.service

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl restart diam-dashboard
sudo systemctl enable --now diam-auto-deploy.timer
echo 'Automatic deployment timer installed. CI approval is required before switching releases.'

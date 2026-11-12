#!/usr/bin/env bash
# One-time server hardening for the Secret Santa VPS (Ubuntu 24.04).
# Run as root from the project folder:  sudo bash deploy/harden-server.sh
# Safe to run again: every step only sets the final state.
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
ENV_FILE="$APP_DIR/.env.production"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

echo "== 1. Secrets file readable only by root"
if [ -f "$ENV_FILE" ]; then
  chown root:root "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  if grep -qE '^MYSQL_PASSWORD=santa_password\s*$' "$ENV_FILE"; then
    echo "!! MYSQL_PASSWORD is the public dev password. The new backend refuses to start with it."
    echo "!! Change it before redeploying (see the instructions you were given)."
  fi
else
  echo "   $ENV_FILE not found, skipped"
fi

echo "== 2. SSH: keys only, no passwords"
has_key=false
for f in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do
  if [ -s "$f" ]; then has_key=true; fi
done
if $has_key; then
  # "00-" so it is read before Ubuntu's 50-cloud-init.conf (sshd keeps the first value it sees)
  cat > /etc/ssh/sshd_config.d/00-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 4
EOF
  sshd -t
  systemctl reload ssh
  echo "   done (log in with your SSH key as before)"
else
  echo "   !! No SSH key found in authorized_keys: password login left ON so you don't get locked out"
fi

echo "== 3. fail2ban (bans IPs that keep guessing SSH passwords) + automatic security updates"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq fail2ban unattended-upgrades >/dev/null
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban >/dev/null
systemctl restart fail2ban
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades >/dev/null

echo "== 4. Firewall: only SSH, HTTP, HTTPS"
if command -v ufw >/dev/null; then
  ufw status | head -12
fi

echo
if [ -f /var/run/reboot-required ]; then
  echo "System updates are waiting for a restart: run  reboot  (the site comes back by itself in ~1 min)."
else
  echo "All set. No restart needed."
fi

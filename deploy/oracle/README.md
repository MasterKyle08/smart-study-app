# Oracle Cloud: Ubuntu 26.04, FileZilla upload, and Screen

Use the prepared ZIP for this setup. Connect with PuTTY, then run Linux commands inside a Screen session named `website`. FileZilla transfers the files; the `unzip` command in Screen extracts the uploaded archive on the server.

| Setting | Your value |
|---|---|
| Operating system | Ubuntu 26.04 LTS |
| Server public IP | `132.145.197.174` |
| SSH login | `ubuntu@132.145.197.174` |
| Screen session | `website` |
| Website | `https://study.132-145-197-174.sslip.io` |
| Owner/admin account | `kmounties@outlook.com` |
| Verification email sender | `kmounties@gmail.com` |

The app uses your existing remote Turso database. Docker runs Node.js 24 and Caddy; Node.js 24 is the container's runtime version, independent of Ubuntu 26.04 on the host. Caddy provides automatic HTTPS. Docker's official Ubuntu repository supports Ubuntu 26.04 and ARM64: [Docker installation documentation](https://docs.docker.com/engine/install/ubuntu/).

## 1. Finish your private production configuration on Windows

In `C:\Users\kmoun\VS code\Study App Project`, use these two prepared files:

- `oracle-upload.zip`: current source code and deployment scripts.
- `.env.oracle`: your private app credentials and production settings.

The IP, hostname, owner address, Gmail sender, existing Google API key, JWT secret, and Turso credentials are already configured. Keep `.env.oracle` outside the ZIP and GitHub. Your local `.env` stays in development mode.

Before uploading:

1. Sign in to **kmounties@gmail.com** in your browser.
2. Enable Google **2-Step Verification** if it is not already enabled.
3. Open [Google App Passwords](https://myaccount.google.com/apppasswords).
4. Create an app password named `Oracle Smart Study`. If app passwords are unavailable for your account, check [Google's account requirements](https://support.google.com/accounts/answer/185833).
5. Open `.env.oracle` in VS Code, find the existing `SMTP_PASS=` line, and enter the app password with the display spaces removed:

```dotenv
SMTP_PASS='your-generated-app-password'
```

6. Save the file. Keep the existing Google and Turso credentials as they are. Do not substitute your usual Google password.

The existing sender settings are:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=kmounties@gmail.com
SMTP_FROM=kmounties@gmail.com
ADMIN_EMAIL=kmounties@outlook.com
ADMIN_NOTIFY_EMAIL=kmounties@outlook.com
```

Gmail sends the code; Outlook receives it. Register/sign in on the website with **kmounties@outlook.com** to use the owner account. Port 587 upgrades to TLS via STARTTLS. The ZIP excludes `.env` and `.env.oracle`, so editing the app password does not require rebuilding the ZIP.

## 2. Open the Oracle network ports

In Oracle Console:

1. Open **Compute -> Instances -> your instance**.
2. Confirm the shape is `VM.Standard.A1.Flex`, the OS is Ubuntu 26.04, and the public IP is `132.145.197.174`.
3. Follow the **primary VNIC -> subnet -> attached security list**.
4. Add these stateful ingress rules. Leave **Stateless unchecked** and source ports as **All**:

| Source CIDR | Protocol | Destination port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

Keep the existing SSH rule for TCP 22 and outbound internet access. If you configured an NSG instead, add the rules to the NSG attached to the VNIC. Port 3000 stays private.

The instance needs a public subnet and route `0.0.0.0/0 -> Internet Gateway`. A normal default public VCN setup already provides this. You do not need a load balancer or NAT gateway.

## 3. Connect using PuTTY

If PuTTY already connects successfully, keep that saved connection.

Otherwise:

1. Locate your instance's private SSH key. The `.pub` key cannot authenticate you.
2. If needed, open the private key in PuTTYgen using **Load -> All Files**, then save a `.ppk` private key.
3. In PuTTY set Host Name to `ubuntu@132.145.197.174`, port 22, and SSH.
4. Select the `.ppk` under **Connection -> SSH -> Auth -> Credentials**. Older versions put this picker directly under Auth.
5. Save the connection as `Oracle Study App` and open it. Verify the server host-key fingerprint before accepting the first connection; enter your key passphrase if prompted.

Check the instance:

```bash
whoami
uname -m
cat /etc/os-release
```

Expected: `ubuntu`, `aarch64`, and `VERSION_ID="26.04"`.

## 4. Install Screen and create the website session

Run:

```bash
sudo apt update
sudo apt install -y screen unzip
screen -S website
```

Press Enter if Screen shows an introductory page. You are now inside `website`. Run the remaining setup commands in this session.

If you already created that session, use `screen -r website` instead. If a lost connection leaves it marked attached, use `screen -d -r website`.

Update Ubuntu, then create the upload directory:

```bash
sudo apt upgrade -y
mkdir -p /home/ubuntu/smart-study-app
```

If Ubuntu requests a reboot, finish the package operation, run `sudo reboot`, reconnect after boot, and create a fresh session using `screen -S website`. Reboots end Screen sessions; Docker restarts deployed website containers automatically.

## 5. Upload the prepared ZIP and private configuration with FileZilla

In FileZilla:

1. Open **File -> Site Manager -> New site**.
2. Protocol: **SFTP - SSH File Transfer Protocol**.
3. Host: **132.145.197.174**. Port: **22**.
4. Logon type: **Key file**. User: **ubuntu**. Select your PuTTY `.ppk`.
5. Connect and verify the server host key; enter your key passphrase if needed.
6. On the left, open `C:\Users\kmoun\VS code\Study App Project`.
7. On the right, open `/home/ubuntu/smart-study-app`.
8. Upload exactly **oracle-upload.zip** and **.env.oracle** into that directory.
9. On the server side, right-click `.env.oracle` and rename it to **.env**. If replacing an earlier server `.env`, back it up privately first and then replace it with this prepared version.

Use **Server -> Force showing hidden files** if you cannot see the environment file. FileZilla uploads the archive; extract it in Screen in the next step. Do not upload `node_modules`, `.git`, local database files, or private SSH keys.

## 6. Extract the archive and install the server software

Return to the `website` Screen session. Run:

```bash
cd /home/ubuntu/smart-study-app
unzip -o oracle-upload.zip
chmod 600 .env
sed -i 's/\r$//' deploy/oracle/*.sh
sudo bash deploy/oracle/bootstrap.sh
```

The archive extracts directly into the current directory; there is no extra project subfolder. It cannot overwrite `.env` because private environment files are excluded.

The bootstrap checks for Ubuntu 26.04, installs Docker and Compose from Docker's official apt repository for your architecture/codename, opens TCP 80/443 in the host firewall, and arranges for those ports and Docker to be available after reboot. Your app image builds natively for ARM64.

Do not enable UFW using the earlier AI commands. Oracle [advises against UFW on its Ubuntu platform images](https://docs.oracle.com/en-us/iaas/Content/Compute/References/images.htm). If UFW is already active, the bootstrap stops for a firewall review; keep your SSH connection open, inspect `sudo ufw status` and `sudo iptables -S INPUT`, and preserve SSH access before disabling UFW. Do not flush iptables.

The bootstrap assumes no conflicting Docker installation. If apt reports conflicts with `docker.io`, `containerd`, or `podman-docker`, review [Docker's installation guidance](https://docs.docker.com/engine/install/ubuntu/) before removing existing packages.

## 7. Deploy and open the website

Before migrating an important existing Turso database, take a Turso backup/export. Startup applies the app's schema migrations automatically; it does not reset existing users or saved sessions.

Inside Screen:

```bash
cd /home/ubuntu/smart-study-app
bash deploy/oracle/deploy.sh
```

The first build downloads the images/dependencies and builds CSS. The script checks required settings, validates Caddy, starts the containers, and waits for application health. Give the initial build time to finish. You can detach Screen while it runs and reattach later.

Open this address on your computer:

```text
https://study.132-145-197-174.sslip.io
```

No domain purchase or DNS record creation is needed for this hostname. Caddy obtains and renews the certificate automatically; first issuance can take a few minutes. Use HTTPS for login.

Verify:

```bash
sudo docker compose ps
curl -fsS http://127.0.0.1:3000/health
curl -I https://study.132-145-197-174.sslip.io
```

Health should return `{"ok":true}`. Test registration/login, AI generation, saved sessions, and admin verification with `kmounties@outlook.com`. Verification codes should arrive in that Outlook inbox from `kmounties@gmail.com`.

If Stripe is enabled, the private configuration already uses HTTPS billing redirect URLs for this hostname. Update its webhook destination to `https://study.132-145-197-174.sslip.io/api/billing/webhook/stripe`, put that endpoint's signing secret in the server `.env`, and redeploy. Review old endpoints before switching traffic.

## 8. Detach and manage the website later

To deploy future GitHub pushes automatically, follow [the one-time GitHub Actions setup](AUTO-DEPLOY.md). It uses the existing server directory and private `.env`; a Git checkout on Oracle is not required.

To detach: **Ctrl+A**, release both keys, then **D**. You can close PuTTY. To return after reconnecting:

```bash
screen -r website
cd /home/ubuntu/smart-study-app
```

If there is no session after a reboot, run `screen -S website` instead. Docker keeps the website running even if Screen ends.

| Task | Command |
|---|---|
| List Screen sessions | `screen -ls` |
| Recover a session still marked attached | `screen -d -r website` |
| Website status | `sudo docker compose ps` |
| App logs | `sudo docker compose logs --tail=100 app` |
| HTTPS logs | `sudo docker compose logs --tail=100 caddy` |
| Follow both logs | `sudo docker compose logs -f --tail=100` |
| Restart app with current settings | `sudo docker compose restart app` |
| Apply server `.env` edits | `bash deploy/oracle/deploy.sh` |
| Resource usage | `sudo docker stats` |
| Disk space | `df -h /` |

Ctrl+C exits a log view. Keep certificate volumes; do not use `docker compose down -v` or prune volumes. Docker health checks report failures; an unhealthy container whose process is still running is not automatically restarted.

For future ZIP updates, upload the freshly rebuilt archive, extract it with `unzip -o oracle-upload.zip`, and rerun `bash deploy/oracle/deploy.sh`. The archive is a snapshot; later local code edits need a newly built ZIP. Replacing source can briefly restart the app. If files were deleted from the new source, remove those obsolete server source files too; unzip does not remove old files. Keep the server `.env`.

Back up your private configuration and keep source code in GitHub. Oracle boot-volume backups cover server files; the remote Turso database needs its own backup/export. The existing PAYG A1 allowance is shared across your compute resources, and the 200 GB storage allowance combines boot and block volumes in your home region. Check your console's usage and billing eligibility when allocating resources.

## If something fails

- **SSH/FileZilla:** confirm public IP, `ubuntu`, private key, port 22, and SFTP rather than FTP.
- **Missing `.env`:** rename the uploaded `.env.oracle` on the server; confirm it is next to `compose.yml`.
- **Wrong Ubuntu version:** use `cat /etc/os-release`; the updated bootstrap expects 26.04.
- **App startup:** use `sudo docker compose logs --tail=150 app`; check the existing Turso URL/token and outbound internet connectivity.
- **Local health works but website times out:** check Oracle ingress rules, public subnet route, host firewall, and Caddy logs.
- **HTTPS certificate:** run `getent ahostsv4 study.132-145-197-174.sslip.io`, confirm ports 80/443 are reachable, and inspect Caddy logs. If the free DNS service hits a shared certificate limit, use `study.132-145-197-174.nip.io` in `SITE_ADDRESS` and billing URLs, then redeploy. Keep certificate volumes.
- **Admin email:** ensure `SMTP_PASS` is the Gmail app password with display spaces removed, owner login is the Outlook address, and email delivery errors are checked in app logs. Do not switch the public app to development mode to retrieve codes.
- **Port in use:** inspect `sudo ss -lntp`; review any host nginx/apache/Caddy installation before stopping it.

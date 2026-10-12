# Automatic updates from GitHub to Oracle

Once configured, every push to `main` in `MasterKyle08/smart-study-app` runs tests, uploads the committed source, builds the ARM image on Oracle, and restarts the site. The workflow also supports a manual **Run workflow** from the main branch. Deployment causes a brief restart.

Your ZIP-based server does not need a Git checkout. The upload replaces only app source directories/files. The existing server `.env`, backups, Turso database, and Docker certificate volumes are retained. Add future app secrets directly to the server `.env`, then run the normal deployment script to apply them.

## 1. One-time preparation in PuTTY / Screen

```bash
screen -r website
cd /home/ubuntu/smart-study-app
sudo apt update
sudo apt install -y rsync
sudo -n docker compose version
```

If there is no Screen session, use `screen -S website` first. The last command must work without prompting for a sudo password. This is normally already configured for OCI's ubuntu user; if you changed sudo permissions, resolve that before enabling automation.

GitHub-hosted runners connect to SSH port 22. If your OCI ingress rule allows only your home IP, it will not admit those runners. Use a stateful TCP 22 ingress rule that admits your chosen runner, or `0.0.0.0/0` with SSH key authentication for the hosted-runner setup. Keep website ports 80/443 as they are.

## 2. Create a separate SSH key for GitHub deployment

In PuTTY, as ubuntu:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C github-oracle-deploy -f ~/.ssh/github_oracle_deploy -N ''
cat ~/.ssh/github_oracle_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

If that key filename already exists, reuse it rather than overwriting it. This is separate from your personal PuTTY key. Repository maintainers who can deploy can run code on the server through this deployment key.

Display the dedicated private key in your own terminal:

```bash
cat ~/.ssh/github_oracle_deploy
```

Copy the entire block privately, including the BEGIN/END lines. Store it in GitHub Actions as **ORACLE_SSH_KEY**. Do not put it in a repository file or send it in chat.

Display the server's public SSH host key:

```bash
sudo cat /etc/ssh/ssh_host_ed25519_key.pub
```

Copy that entire single line (starting `ssh-ed25519`) into **ORACLE_SSH_HOST_KEY**. This pins the server identity; the workflow uses strict host-key verification rather than accepting whichever machine answers at the IP.

## 3. Add the two GitHub repository secrets

Open [repository Actions secrets](https://github.com/MasterKyle08/smart-study-app/settings/secrets/actions).

Choose **New repository secret** for each:

| Name | Value |
|---|---|
| `ORACLE_SSH_KEY` | The dedicated OpenSSH private key block |
| `ORACLE_SSH_HOST_KEY` | The server's public Ed25519 host-key line |

The workflow already uses IP `132.145.197.174` and user `ubuntu`. Google, Gmail, Turso, and payment secrets stay in the server `.env`; they do not need to be added to this workflow.

## 4. Commit and push the actual working code

The local project has uncommitted app changes and deployment files. Commit them so GitHub deploys the working version rather than an older source snapshot. From the Windows terminal in the project folder:

```powershell
git status
git add .github .gitattributes .dockerignore .gitignore Dockerfile compose.yml deploy README.md website-commands.txt backend public server.js package.json package-lock.json tailwind.config.js
git diff --cached --stat
git commit -m "Add Oracle deployment automation"
git push origin main
```

Review staged files before committing. `.env`, `.env.oracle`, database files, and `oracle-upload.zip` are ignored. The workflow packages only committed runtime source and refuses common private-key/environment/database filenames.

## 5. Check the first deployment

Open [repository Actions](https://github.com/MasterKyle08/smart-study-app/actions), choose **Deploy to Oracle**, and inspect the latest run. Tests must pass before SSH upload. Deployments are serialized so builds do not overlap.

After a green run, check the website. In PuTTY:

```bash
cd /home/ubuntu/smart-study-app
sudo docker compose ps
cat .deploy/current-commit
```

The commit should match the deployed GitHub commit. You can use **Run workflow -> main** to retry deployment after fixing credentials or connectivity.

For later updates, commit and push to main. GitHub handles the transfer and deployment; FileZilla is still useful for private settings and troubleshooting. Manual ZIP updates remain possible, but the next automatic deployment replaces app source with the committed GitHub version.

## Troubleshooting

- **Missing secret:** add both names exactly as listed.
- **SSH timeout:** confirm port 22 allows the runner and IP is still correct.
- **Permission denied (publickey):** confirm the matching public key was appended to ubuntu's authorized_keys and the private key is in ORACLE_SSH_KEY.
- **Host-key mismatch:** verify the server identity in PuTTY before updating ORACLE_SSH_HOST_KEY. Recreating the instance normally changes its host key.
- **sudo asks for a password:** the automation requires noninteractive Docker permission for the ubuntu user.
- **Tests fail:** fix the test failure before production code is updated.
- **App health/deployment fails:** inspect Actions logs and `sudo docker compose logs --tail=150 app caddy`. Source validation happens before syncing files; a failure during container replacement can still require redeploying the previous known-good commit. This is a single-server deployment, without automatic database rollback.

# Updating the live server

Upload `tony2028-main-updated.zip` to the server (e.g. `/root/`), then:

```sh
cd /root
unzip -o -q tony2028-main-updated.zip 'tony2028-main/deploy/*'
sudo bash /root/tony2028-main/deploy/server-deploy.sh check                                  # changes nothing
sudo bash /root/tony2028-main/deploy/server-deploy.sh deploy /root/tony2028-main-updated.zip # 5–10 min, site stays up
```

If something is wrong afterwards:

```sh
sudo bash /root/tony2028-main/deploy/server-deploy.sh rollback
```

Optional, once: `sudo bash /root/tony2028-main/deploy/server-deploy.sh auto-refresh` — admin edits then
refresh the pre-built pages search engines read.

`check` finds the backend folder, how it is started (systemd, pm2 or supervisor), the website folder
and the API address. If it can't, put the setting in front of the command, for example:

```sh
sudo APP_DIR=/var/www/tony SERVICE=pm2:tony-api WEB_ROOT=/var/www/tony/frontend/build API_URL=https://tonyoga.com \
  bash /root/tony2028-main/deploy/server-deploy.sh check
```

`deploy` backs up the code, website and MongoDB to `/var/backups/tonyoga/<date-time>` first, updates the
backend (keeps `.env`, `venv`, uploads), restarts it and checks `/api/health`, builds the website in a side
folder, swaps it in with one rename (keeping `.well-known`, verification files, `.htaccess`), and checks the
live pages. A failed backend start or a failed home page puts the old version back by itself.

**Nothing on the live server gets lost:** before updating, `deploy` records every API route the running
backend answers (for example the iPhone app's `/api/ios-commerce/*` Apple purchase routes). If the new
backend is missing any of them, it puts the previous backend back and stops. The iPhone purchase settings
in `backend/.env` and `/etc/tonyoga/` are not touched; `requirements-ios.txt` is installed if missing.

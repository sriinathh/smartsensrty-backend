# SmartSensrty Backend

Quick notes to run, deploy, and prepare this backend for use with the Expo app.

## Local run

1. Create `.env` in this folder with at least:

```
MONGODB_URI=mongodb://127.0.0.1:27017/smartsensrty
JWT_SECRET=your_jwt_secret
FRONTEND_URL=http://localhost:19006   # or your frontend URL
ALLOW_ALL_ORIGINS=false               # set true for quick device testing
```

2. Install and start:

```bash
npm install
npm run dev   # nodemon or
npm start
```

3. Server listens on `PORT` env or 5000 by default. Use `0.0.0.0` host when testing from device.

## CORS

This project supports a permissive toggle. For quick local device testing you can set `ALLOW_ALL_ORIGINS=true`. For production, set `FRONTEND_URL` to your frontend host and keep `ALLOW_ALL_ORIGINS=false`.

## Deploy

You can deploy to Render, Railway, Heroku or any Node host. Example (Render):

- Create a new web service on Render, connect the repo, set `env` variables (MONGODB_URI, JWT_SECRET, FRONTEND_URL), and set the start command to `npm start`.

## Git and pushing

If you want to push this backend to GitHub:

```bash
cd smartsensrty-backend
git init
git add .
git commit -m "backend: add CORS toggle and README"
# create repo on GitHub, then:
git remote add origin <your-github-repo-url>
git push -u origin main
```

## Expo / APK notes

- Once deployed, grab the HTTPS URL (e.g. `https://your-backend.onrender.com`) and paste it into the Expo app's config (`src/config.js` or wherever `api.js` points) as the backend base URL.
- For Expo-managed builds use EAS or `expo build:android -t apk` (depending on your Expo SDK and account). Ensure the backend URL is accessible over HTTPS for production.

If you want, I can create the local git commit now and show the exact `git` commands to push to your GitHub repo.

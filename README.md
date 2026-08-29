# BIOB90 Poster Rubric

A mobile-friendly digital version of the BIOB90 Biology Integrative Research Poster Project judging rubric. Judge drafts autosave after every change, completed submissions are stored in an atomic JSON datastore, and organizers can review results or export them as CSV from a password-protected dashboard.

## Run locally

```bash
npm install
ADMIN_PASSWORD="choose-a-password" npm start
```

Open `http://localhost:3000`. The organizer dashboard is at `http://localhost:3000/admin.html`.

## Deploy on Railway

1. Create a Railway service from this GitHub repository.
2. Add a persistent volume mounted at `/data`.
3. Add these service variables:
   - `DATA_PATH=/data/rubric.json`
   - `ADMIN_PASSWORD=` followed by a strong password known only to organizers
4. Railway detects the Node app and runs `npm start`. Generate a public domain from the service settings.

The `PORT` variable is supplied by Railway automatically. Do not store the admin password in this repository.

## Data storage

Each started rubric is saved immediately and then autosaved as the judge works. Drafts can be resumed on the same browser. Completed submissions are read-only to the judge. The organizer CSV contains one row per rubric criterion, making it straightforward to filter or analyze in Excel.

Back up the Railway volume before deleting or replacing the service. Without a mounted volume, Railway's filesystem is temporary and the rubric data will not persist across deployments.

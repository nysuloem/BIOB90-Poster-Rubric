# BIOB90 Poster Rubric

A mobile-friendly digital version of the BIOB90 Biology Integrative Research Poster Project judging rubric. The landing page provides separate student, judge, and course-instructor paths. Students can view and print the complete rubric, judge assignment lookup is ready to be connected to a future schedule, and instructors can review results or export them as CSV from a password-protected dashboard.

The student view explains that every poster is evaluated by two judges and must receive at least 16 Yes responses out of 20 from each judge as one of the requirements for passing BIOB90.

Judge drafts autosave after every change, and completed submissions are stored in an atomic JSON datastore on the persistent volume.

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
4. Railway detects the included Dockerfile and runs the app with the official Node 22 runtime. Generate a public domain from the service settings.

The `PORT` variable is supplied by Railway automatically. Do not store the admin password in this repository.

## Data storage

Each started rubric is saved immediately and then autosaved as the judge works. Drafts can be resumed on the same browser. Completed submissions are read-only to the judge. The organizer CSV contains one row per rubric criterion, making it straightforward to filter or analyze in Excel.

Back up the Railway volume before deleting or replacing the service. Without a mounted volume, Railway's filesystem is temporary and the rubric data will not persist across deployments.

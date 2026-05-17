# Troubleshooting Guide

## Deployment Issues

### Cloud Run deployment fails with "Permission denied"

```
ERROR: (gcloud.run.deploy) PERMISSION_DENIED: Permission 'run.services.create' denied
```

**Fix**: Ensure the service account or your user has `roles/run.admin`:
```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:deployer@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"
```

### Docker build fails with "npm ci" error

```
npm ERR! code EINTEGRITY
```

**Fix**: Delete `package-lock.json` and regenerate:
```bash
rm package-lock.json node_modules -rf
npm install
```

### Could not resolve host for GCR push

```
denied: Unauthenticated request
```

**Fix**: Re-authenticate Docker:
```bash
gcloud auth configure-docker us-central1-docker.pkg.dev
```

## Database Issues

### Connection refused to Cloud SQL

```
Error: connect ECONNREFUSED /cloudsql/...
```

**Root causes**:
1. Cloud SQL proxy not running → start it or verify the Unix socket path
2. Instance connection name is wrong → check `gcloud sql instances describe INSTANCE_NAME`
3. Service account missing `roles/cloudsql.client`

**Fix**: Verify the proxy is running and the socket path matches `DB_HOST`:
```bash
ls /cloudsql/PROJECT_ID:REGION:INSTANCE/
```

### Migrations fail with "role does not exist"

```
ERROR: role "admin" does not exist
```

**Fix**: Migrations reference PostgreSQL roles (`admin`, `member`, `regulator`). Create them manually:
```sql
CREATE ROLE admin;
CREATE ROLE member;
CREATE ROLE regulator;
CREATE ROLE pii_viewer;
GRANT admin TO safety_user;
GRANT member TO safety_user;
GRANT regulator TO safety_user;
GRANT pii_viewer TO safety_user;
```

### Private IP not connecting from Cloud Run

**Fix**: The VPC Access connector must be in the same VPC as Cloud SQL. Verify:
```bash
gcloud compute networks vpc-access connectors describe safety-monitor-connector \
  --region us-central1
```

## Runtime Issues

### Health check returns 503

```
{"status":"error","db":"disconnected","message":"... "}
```

**Common causes**:
1. Cloud SQL instance not running → check `gcloud sql instances describe`
2. Credentials wrong → verify secret in Secret Manager
3. Proxy not mounted → check `volume_mounts` in Cloud Run configuration

### Requests timeout after 300s

**Fix**: Increase the timeout in `main.tf` or optimize the slow query:
```hcl
timeout = "600s"
```

### "Cannot read properties of undefined (reading 'result')" in regulator endpoints

**Fix**: The SECURITY DEFINER functions may not have been created. Re-run migrations:
```bash
./scripts/migrate.sh
```

## Monitoring & Debugging

### View Cloud Run logs

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=safety-monitor" --limit=50
```

### View Cloud SQL logs

```bash
gcloud logging read "resource.type=cloudsql_database" --limit=50
```

### Test database connection locally

```bash
cloud-sql-proxy PROJECT_ID:REGION:INSTANCE --port 5432 &
psql "host=localhost port=5432 dbname=safety_monitor_prod user=safety_user"
```

### Debug Cloud Run container (ephemeral)

Deploy with an alternate startup command:
```bash
gcloud run deploy safety-monitor-debug \
  --image=us-central1-docker.pkg.dev/PROJECT_ID/cloud-run-source-deploy/safety-monitor:latest \
  --command=sh --arg=-c --arg="sleep 3600" \
  --region=us-central1 \
  --no-cpu-throttling
```
Then `gcloud run services proxy safety-monitor-debug --region=us-central1` and `curl localhost:8080`.

## Budget Alerts

If you receive a budget alert:
1. Check current spend: `gcloud billing projects get-billing-info PROJECT_ID`
2. Reduce Cloud Run max instances: `max_instance_count = 2` in `main.tf`
3. Downgrade to smaller Cloud SQL if appropriate

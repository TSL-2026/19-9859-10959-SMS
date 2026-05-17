# Deployment Guide — Safety Monitor on Google Cloud Platform

## Prerequisites

- **GCP Project** with billing enabled
- **Tools installed**: `gcloud`, `terraform` (>=1.5), `docker`, `jq`
- **gcloud authenticated** and configured:
  ```bash
  gcloud auth login
  gcloud config set project YOUR_PROJECT_ID
  ```

## Step 1: Enable Required APIs

```bash
gcloud services enable \
  cloudrun.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  vpcaccess.googleapis.com \
  cloudbuild.googleapis.com \
  iamcredentials.googleapis.com
```

## Step 2: Create Terraform State Bucket (optional but recommended)

```bash
gsutil mb gs://safety-monitor-tfstate
```

Uncomment the `backend "gcs"` block in `infra/main.tf` and update the bucket name.

## Step 3: Provision Infrastructure

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your project ID

terraform init
terraform plan
terraform apply
```

This creates:
- VPC network + subnetwork + Serverless VPC Access connector
- Cloud SQL PostgreSQL (db-f1-micro, private IP)
- Cloud Storage bucket (30-day lifecycle)
- Secret Manager secrets (DB_PASSWORD, JWT_SECRET, ENCRYPTION_KEY, REGULATOR_KEYS)
- Cloud Run service (scale-to-zero)
- Service accounts (least privilege)

## Step 4: Configure GitHub Actions (CI/CD)

### 4a. Set up Workload Identity Federation

```bash
# Create a service account for CI/CD
gcloud iam service-accounts create github-actions-deployer \
  --display-name="GitHub Actions Deployer"

# Grant it the roles needed
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.admin"

# Create Workload Identity Pool & Provider
gcloud iam workload-identity-pools create "github-pool" \
  --location="global" \
  --display-name="GitHub Actions Pool"

gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Actions Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

### 4b. Add GitHub Actions Secrets

| Secret | Value |
|--------|-------|
| `GCP_PROJECT_ID` | Your GCP project ID |
| `GCP_WIF_PROVIDER` | Full resource name of the WIF provider |
| `GCP_SERVICE_ACCOUNT` | Email of the deployer service account |
| `DB_PASSWORD` | Retrieved from Secret Manager |

To get the WIF provider:
```bash
gcloud iam workload-identity-pools providers describe "github-provider" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --format="value(name)"
```

Grant the deployer SA access to the WIF pool:
```bash
gcloud iam service-accounts add-iam-policy-binding \
  "github-actions-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/$(gcloud iam workload-identity-pools describe 'github-pool' --location='global' --format='value(name)')/attribute.repository/YOUR_ORG/YOUR_REPO"
```

## Step 5: Deploy Manually

```bash
# Option A — One-command script
export GCP_PROJECT_ID=your-project-id
./scripts/deploy.sh

# Option B — Step by step
docker build -t safety-monitor .
docker tag safety-monitor us-central1-docker.pkg.dev/PROJECT_ID/cloud-run-source-deploy/safety-monitor:latest
docker push ...
gcloud run deploy safety-monitor --image ... --region us-central1
```

## Step 6: Run Migrations

```bash
./scripts/migrate.sh
```

## Step 7: Verify

```bash
./scripts/smoke-test.sh
```

## Post-Deployment

1. **Generate regulator JWT**: Use the `JWT_SECRET` from Secret Manager to sign regulator tokens
2. **Load tenant config**: Insert `tenant_config` rows with `total_operations` for each tenant
3. **Set up monitoring**: Visit Cloud Monitoring console → Dashboards → Create dashboard

## Tearing Down

```bash
cd infra
terraform destroy
gcloud container images delete $(gcloud container images list --repository=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/cloud-run-source-deploy --format="value(name)")
```

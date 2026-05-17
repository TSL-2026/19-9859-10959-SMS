# Cost Estimation — ~$12–18/month

## Monthly Breakdown (us-central1, on-demand pricing)

| Resource | Configuration | Estimated Cost |
|----------|---------------|---------------|
| **Cloud Run** | min 0, max 10, 1 vCPU, 1 GB RAM, scale-to-zero | **$0–2** |
| **Cloud SQL** | db-f1-micro (0.5 vCPU, 0.6 GB RAM), 10 GB SSD | **$8–10** |
| **Cloud Storage** | ~100 MB uploads, 30-day lifecycle | **<$1** |
| **Secret Manager** | 4 secrets, minimal access | **<$1** |
| **VPC Access Connector** | e2-micro (2–3 instances) | **~$5** |
| **Cloud NAT** | (only if connector needs egress) | **~$1** |

## Cost Optimization Features

### 1. Cloud Run — Scale to Zero
- `min_instance_count = 0` → zero instances when no traffic
- Billed per 100ms of active request time only
- Estimated $0–2/month for low-traffic API

### 2. Cloud SQL — f1-micro + Autoresize
- Cheapest PostgreSQL tier: db-f1-micro ($8–10/month)
- `disk_autoresize = true` with 20 GB limit prevents over-provisioning
- `point_in_time_recovery_enabled = false` saves on WAL storage
- Backup retention: 3 days (vs default 7) reduces backup storage costs

### 3. Cloud Storage — Lifecycle Policy
- `age = 30` days → delete old Excel uploads automatically
- `uniform_bucket_level_access` avoids per-object ACL costs

### 4. Budget Alert — $25/month
- Budget threshold at 50%, 80%, 100% of $25
- Email notifications when approaching limit

## Worst-Case Scenario

If Cloud Run stays active (e.g., continuous health checks) and the VPC connector runs at max instances:
- Cloud Run: ~$15 (10 instances × 24h × 30d at $0.0024/hour each)
- VPC connector: ~$20 (3 e2-micro × 24h × 30d)
- **Total: ~$45/month**

Use the budget alert to catch unexpected spikes.

## Cost Comparison

| Deployment Model | Estimated Monthly Cost |
|-----------------|----------------------|
| GCP (this setup) | **$12–18** |
| Single VM (e2-micro, 24/7) | **~$15–20** |
| Heroku (Basic db + web) | **~$25–35** |
| AWS (RDS t4g.micro + Fargate) | **~$18–25** |

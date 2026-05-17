terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
  backend "gcs" {
    # bucket = "safety-monitor-tfstate"
    # prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ---------------------------------------------------------------------------
# VPC network — private networking for Cloud SQL + Cloud Run
# ---------------------------------------------------------------------------
resource "google_compute_network" "main" {
  name                    = "safety-monitor-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "main" {
  name          = "safety-monitor-subnet"
  network       = google_compute_network.main.id
  region        = var.region
  ip_cidr_range = "10.8.0.0/28"
  private_ip_google_access = true
}

# Serverless VPC Access connector — allows Cloud Run to reach private IPs
resource "google_vpc_access_connector" "main" {
  name          = "safety-monitor-connector"
  region        = var.region
  network       = google_compute_network.main.name
  ip_cidr_range = "10.8.1.0/28"

  min_instances = 2
  max_instances = 3
  machine_type  = "e2-micro"
}

# ---------------------------------------------------------------------------
# Cloud SQL — PostgreSQL db-f1-micro (cheapest tier)
# Cost: ~$8–10/month
# ---------------------------------------------------------------------------
resource "google_sql_database_instance" "main" {
  name             = var.cloud_sql_instance_name
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier              = "db-f1-micro"
    activation_policy = "ALWAYS"

    disk_type    = "PD_SSD"
    disk_size    = 10
    disk_autoresize = false  # prevent surprise cost increases

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.main.id
      require_ssl     = true
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = false
      start_time                     = "03:00"
      transaction_log_retention_days = 3
      backup_retention_settings {
        retained_backups = 7
      }
    }
  }

  deletion_protection = var.environment == "prod"
}

resource "google_sql_database" "main" {
  name     = var.db_name
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "main" {
  name     = var.db_user
  instance = google_sql_database_instance.main.name
  password = var.db_password
}

# ---------------------------------------------------------------------------
# Cloud Storage — Excel uploads with 30-day lifecycle
# Cost: free tier covers 5GB, well within for testing
# ---------------------------------------------------------------------------
resource "google_storage_bucket" "uploads" {
  name          = coalesce(var.storage_bucket_name, "${var.project_id}-safety-uploads")
  location      = var.region
  storage_class = "STANDARD"
  force_destroy = true

  lifecycle_rule {
    condition { age = 30 }
    action { type = "Delete" }
  }

  versioning {
    enabled = false
  }

  uniform_bucket_level_access = true
}

# ---------------------------------------------------------------------------
# Secret Manager — all secrets, no env-var leakage
# Cost: 4 active secrets × $0.06/secret/month = ~$0.24/month
# ---------------------------------------------------------------------------
resource "google_secret_manager_secret" "db_password" {
  secret_id = "DB_PASSWORD"
  replication { auto {} }
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = var.db_password
}

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "JWT_SECRET"
  replication { auto {} }
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = var.jwt_secret
}

resource "google_secret_manager_secret" "encryption_key" {
  secret_id = "ENCRYPTION_KEY"
  replication { auto {} }
}

resource "google_secret_manager_secret_version" "encryption_key" {
  secret      = google_secret_manager_secret.encryption_key.id
  secret_data = var.encryption_key
}

resource "google_secret_manager_secret" "regulator_api_key_1" {
  secret_id = "REGULATOR_API_KEY_1"
  replication { auto {} }
}

resource "google_secret_manager_secret_version" "regulator_api_key_1" {
  secret      = google_secret_manager_secret.regulator_api_key_1.id
  secret_data = "reg-key-placeholder"
}

# ---------------------------------------------------------------------------
# IAM — service accounts with least privilege
# ---------------------------------------------------------------------------
resource "google_service_account" "cloud_run" {
  account_id   = "safety-monitor-cr"
  display_name = "Cloud Run — Safety Monitor (${var.environment})"
}

resource "google_project_iam_member" "sa_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "sa_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "sa_storage_viewer" {
  project = var.project_id
  role    = "roles/storage.objectViewer"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# ---------------------------------------------------------------------------
# Cloud Run — scale to zero (no traffic = no cost)
# Cost: $0 when idle; ~$2/month for light testing traffic
# ---------------------------------------------------------------------------
resource "google_cloud_run_v2_service" "safety_monitor" {
  name     = var.cloud_run_service_name
  location = var.region

  template {
    service_account = google_service_account.cloud_run.email
    timeout         = "300s"
    concurrency     = 80

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/cloud-run-source-deploy/${var.cloud_run_service_name}:latest"

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "PORT"
        value = "3000"
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "DB_NAME"
        value = var.db_name
      }

      env {
        name  = "DB_USER"
        value = var.db_user
      }

      env {
        name  = "DB_HOST"
        value = "/cloudsql/${var.project_id}:${var.region}:${var.cloud_sql_instance_name}"
      }

      env {
        name  = "DB_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_password.secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_secret.secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "ENCRYPTION_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.encryption_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "REGULATOR_API_KEY_1"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.regulator_api_key_1.secret_id
            version = "latest"
          }
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }

    vpc_access {
      connector = google_vpc_access_connector.main.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
    ]
  }
}

# Public access — IAP, API keys, or unauthenticated (for testing)
data "google_iam_policy" "noauth" {
  binding {
    role = "roles/run.invoker"
    members = ["allUsers"]
  }
}

resource "google_cloud_run_v2_service_iam_policy" "public" {
  location    = google_cloud_run_v2_service.safety_monitor.location
  project     = google_cloud_run_v2_service.safety_monitor.project
  name        = google_cloud_run_v2_service.safety_monitor.name
  policy_data = data.google_iam_policy.noauth.policy_data
}

# ---------------------------------------------------------------------------
# Budget alert — $15/month cap
# Alerts at 50%, 75%, 90%, 100% of budget
# ---------------------------------------------------------------------------
resource "google_billing_budget" "monthly" {
  billing_account = var.billing_account_id
  display_name    = "safety-monitor-budget-${var.environment}"

  amount {
    specified_amount {
      currency_code = "USD"
      units         = 15
    }
  }

  threshold_rules {
    threshold_percent = 0.50
  }
  threshold_rules {
    threshold_percent = 0.75
  }
  threshold_rules {
    threshold_percent = 0.90
  }
  threshold_rules {
    threshold_percent = 1.0
  }

  all_updates_rule {
    monitoring_notification_channels = [
      google_monitoring_notification_channel.email.id,
    ]
    disable_default_iam_recipients = false
  }

  filter {
    projects = ["projects/${var.project_id}"]
  }
}

resource "google_monitoring_notification_channel" "email" {
  display_name = "Budget Alert Email"
  type         = "email"
  labels = {
    email_address = var.budget_alert_email
  }
}

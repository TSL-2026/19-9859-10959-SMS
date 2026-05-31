terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }
  # backend "gcs" {
  #   bucket = "safety-monitor-tfstate"
  # }
  # Using local state for demo deployment
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# ============================================
# VPC NETWORK (for private Cloud SQL)
# ============================================
resource "google_compute_network" "main" {
  name                    = "${var.project_id}-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "main" {
  name          = "${var.project_id}-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.main.id

  private_ip_google_access = true
}

resource "google_compute_global_address" "private_ip_alloc" {
  name          = "${var.project_id}-private-ip-alloc"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_alloc.name]
}

# ============================================
# CLOUD SQL (PostgreSQL)
# ============================================
resource "google_sql_database_instance" "main" {
  name             = "${var.project_id}-db"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier              = "db-f1-micro"
    disk_size         = 10
    disk_autoresize   = false
    disk_type         = "PD_SSD"
    availability_type = "ZONAL"

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.main.id
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "02:00"
      point_in_time_recovery_enabled = false
      transaction_log_retention_days = 3
      backup_retention_settings {
        retained_backups = 7
      }
    }

    database_flags {
      name  = "max_connections"
      value = "50"
    }
  }

  deletion_protection = false

  depends_on = [google_service_networking_connection.private_vpc_connection]
}

resource "google_sql_database" "database" {
  name     = var.db_name
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "app_user" {
  name     = var.db_user
  instance = google_sql_database_instance.main.name
  password = random_password.db_password.result
}

resource "random_password" "db_password" {
  length  = 20
  special = false
}

# ============================================
# SECRET MANAGER
# ============================================
resource "google_secret_manager_secret" "db_password" {
  secret_id = "DB_PASSWORD"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db_password.result
}

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "JWT_SECRET"
  replication {
    auto {}
  }
}

resource "random_password" "jwt_secret" {
  length  = 32
  special = false
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = random_password.jwt_secret.result
}

resource "google_secret_manager_secret" "encryption_key" {
  secret_id = "ENCRYPTION_KEY"
  replication {
    auto {}
  }
}

resource "random_password" "encryption_key" {
  length  = 32
  special = false
}

resource "google_secret_manager_secret_version" "encryption_key" {
  secret      = google_secret_manager_secret.encryption_key.id
  secret_data = random_password.encryption_key.result
}

resource "google_secret_manager_secret" "regulator_api_key" {
  secret_id = "REGULATOR_API_KEY_1"
  replication {
    auto {}
  }
}

resource "random_password" "regulator_api_key" {
  length  = 32
  special = false
}

resource "google_secret_manager_secret_version" "regulator_api_key" {
  secret      = google_secret_manager_secret.regulator_api_key.id
  secret_data = random_password.regulator_api_key.result
}

# ============================================
# CLOUD STORAGE (Excel uploads)
# ============================================
resource "google_storage_bucket" "uploads" {
  name          = "${var.project_id}-uploads"
  location      = var.region
  force_destroy = true

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }

  uniform_bucket_level_access = true
}

# ============================================
# VPC ACCESS CONNECTOR (for Cloud SQL private IP)
# ============================================
resource "google_vpc_access_connector" "main" {
  name          = "sm-connector"
  region        = var.region
  network       = google_compute_network.main.name
  ip_cidr_range = "10.8.0.0/28"
  machine_type  = "e2-micro"
  min_instances = 2
  max_instances = 3
}

# ============================================
# SERVICE ACCOUNT FOR CLOUD RUN
# ============================================
resource "google_service_account" "cloud_run" {
  account_id   = "${var.project_id}-cloudrun"
  display_name = "Cloud Run Service Account"
}

resource "google_project_iam_member" "cloud_run_secret_access" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "cloud_run_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "cloud_run_storage_viewer" {
  project = var.project_id
  role    = "roles/storage.objectViewer"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# ============================================
# CLOUD RUN SERVICE
# ============================================
resource "google_cloud_run_v2_service" "safety_monitor" {
  name     = var.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    max_instance_request_concurrency = 80
    timeout                          = "300s"

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    vpc_access {
      connector = google_vpc_access_connector.main.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }

    containers {
      image = "gcr.io/${var.project_id}/safety-monitor:latest"

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "DB_HOST"
        value = "/cloudsql/${google_sql_database_instance.main.connection_name}"
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
        name = "DB_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_password.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_secret.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "ENCRYPTION_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.encryption_key.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "REGULATOR_API_KEY_1"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.regulator_api_key.secret_id
            version = "latest"
          }
        }
      }
    }

    service_account = google_service_account.cloud_run.email
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [google_project_iam_member.cloud_run_secret_access]
}

# ============================================
# ALLOW UNAUTHENTICATED ACCESS (public endpoint)
# ============================================
data "google_iam_policy" "noauth" {
  binding {
    role = "roles/run.invoker"
    members = [
      "allUsers",
    ]
  }
}

resource "google_cloud_run_v2_service_iam_policy" "public" {
  project     = google_cloud_run_v2_service.safety_monitor.project
  location    = google_cloud_run_v2_service.safety_monitor.location
  name        = google_cloud_run_v2_service.safety_monitor.name
  policy_data = data.google_iam_policy.noauth.policy_data
}

# BILLING BUDGET ALERT — skipped for initial deploy, uncomment after setting up ADC quota project
# resource "google_billing_budget" "monthly" {
#   billing_account = var.billing_account_id
#   display_name    = "Safety Monitor Budget - $25 limit"
#   ...
# }



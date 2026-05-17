variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region (us-central1 is lowest cost)"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Deployment environment: dev, test, or prod"
  type        = string
  default     = "dev"
  validation {
    condition     = contains(["dev", "test", "prod"], var.environment)
    error_message = "Environment must be dev, test, or prod."
  }
}

variable "db_name" {
  description = "Cloud SQL database name"
  type        = string
  default     = "safety_monitor_prod"
}

variable "db_user" {
  description = "Cloud SQL database user"
  type        = string
  default     = "safety_user"
}

variable "db_password" {
  description = "Cloud SQL database password (sensitive)"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT signing secret (sensitive)"
  type        = string
  sensitive   = true
}

variable "encryption_key" {
  description = "AES-256 encryption key for PII (sensitive)"
  type        = string
  sensitive   = true
}

variable "cloud_run_service_name" {
  description = "Cloud Run service name"
  type        = string
  default     = "safety-monitor"
}

variable "cloud_sql_instance_name" {
  description = "Cloud SQL instance name"
  type        = string
  default     = "safety-monitor-db"
}

variable "storage_bucket_name" {
  description = "Cloud Storage bucket for Excel uploads (auto-generated if null)"
  type        = string
  default     = null
}

variable "budget_alert_email" {
  description = "Email address for budget alert notifications"
  type        = string
  default     = "admin@example.com"
}

variable "billing_account_id" {
  description = "GCP billing account ID (required for budget alerts)"
  type        = string
  default     = null
}

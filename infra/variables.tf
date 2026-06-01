variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "safety_monitor_prod"
}

variable "db_user" {
  description = "Database user"
  type        = string
  default     = "safety_user"
}

variable "service_name" {
  description = "Cloud Run service name"
  type        = string
  default     = "safety-monitor"
}

# variable "billing_account_id" {
#   description = "GCP Billing Account ID (required for budget alerts)"
#   type        = string
#   sensitive   = true
# }

variable "budget_alert_email" {
  description = "Email for budget alerts"
  type        = string
  default     = "admin@example.com"
}

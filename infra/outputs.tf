output "cloud_run_url" {
  description = "URL of the deployed Cloud Run service"
  value       = google_cloud_run_v2_service.safety_monitor.uri
}

output "cloud_sql_connection_name" {
  description = "Cloud SQL instance connection name (for Cloud SQL proxy)"
  value       = google_sql_database_instance.main.connection_name
}

output "bucket_name" {
  description = "Cloud Storage bucket name for uploads"
  value       = google_storage_bucket.uploads.name
}

output "service_account_email" {
  description = "Email of the Cloud Run service account"
  value       = google_service_account.cloud_run.email
}

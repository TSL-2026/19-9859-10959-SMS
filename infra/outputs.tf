output "cloud_run_url" {
  description = "URL of the deployed Cloud Run service"
  value       = google_cloud_run_v2_service.safety_monitor.uri
}

output "cloud_sql_public_ip" {
  description = "Public IP of the Cloud SQL instance (null if private IP only)"
  value       = google_sql_database_instance.main.public_ip_address
}

output "cloud_sql_private_ip" {
  description = "Private IP of the Cloud SQL instance"
  value       = google_sql_database_instance.main.private_ip_address
}

output "bucket_name" {
  description = "Cloud Storage bucket name for uploads"
  value       = google_storage_bucket.uploads.name
}

output "service_account_email" {
  description = "Email of the Cloud Run service account"
  value       = google_service_account.cloud_run.email
}

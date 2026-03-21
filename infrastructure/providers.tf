provider "cloudflare" {
  api_token = var.cloudflare_api_token != "" ? var.cloudflare_api_token : null
}

provider "neon" {
  api_key = var.neon_api_key != "" ? var.neon_api_key : null
}

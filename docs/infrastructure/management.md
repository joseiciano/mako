# Infrastructure Management

**Last reconciled**: 2026-03-30 (Documentation Drift Resolution Plan)

To ensure our infrastructure is reproducible, version-controlled, and easily scalable, we utilize a hybrid approach for managing our Cloudflare-based stack.

## Terraform (Infrastructure as Code)

We use **Terraform** to manage all persistent infrastructure components. This allows us to define our environment in code and maintain consistency across staging and production.

### Managed Resources
- **Cloudflare Workers**: Provisioning the worker scripts and their associated bindings.
- **Cloudflare Worker Cron Triggers**: Provisioning scheduled executions for background workers (e.g., matcher runs).
- **Cloudflare Queues**: Provisioning queue producers/consumers and bindings for async post-commit worker hand-off (notification/orchestration events, not join-time session provisioning).
- **Cloudflare R2**: Bucket creation, CORS configurations, and lifecycle rules.
- **Cloudflare Hyperdrive**: Database connection pooling and configuration for Neon/Postgres.
- **Cloudflare AI Gateway**: Analytics and caching configurations for AI providers.
- **Cloudflare Workflows**: Orchestration logic for the interview lifecycle.
- **Secrets Management**: Provisioning and managing environment variables and secrets across Cloudflare.

### Why Terraform?
- **State Management**: It tracks the current state of our infrastructure, preventing manual configuration drift.
- **Reproducibility**: Easily stand up identical environments (e.g., a new "preview" or "staging" environment) with a single command.
- **CI/CD Integration**: Infrastructure changes are peer-reviewed in Pull Requests and automatically applied upon merging to the `main` branch.

---

## Wrangler (Developer Experience)

While Terraform manages the "plumbing," **Wrangler** remains our primary tool for local development and rapid iteration.

### Usage
- **Local Emulation**: Using `wrangler dev` to simulate the Cloudflare environment (Workers, R2, KV) locally.
- **Tail Logs**: Using `wrangler tail` for real-time debugging of deployed workers.
- **Rapid Prototyping**: Testing new worker logic before formalizing the infrastructure in Terraform.

---

## Deployment Strategy

1. **Infrastructure Changes**: Modified via Terraform in the `/infrastructure` directory. These changes must be merged and applied before code that depends on them is deployed.
2. **Application Code**: Deployed via GitHub Actions using the official Cloudflare Wrangler action. This ensures that our Hono-based routes and business logic are updated safely.

> **Operational Note**: Cloudflare Queues and other persistent resources must be created and owned by Terraform only. Do not use ad-hoc `wrangler` create commands in application deploy workflows. If a resource already exists outside Terraform state, operators must import it into Terraform state or delete and recreate it under Terraform control before the next apply.

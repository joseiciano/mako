# Story 1.4: CI/CD & Secrets Management

**Milestone**: Milestone 1: Foundation & Authentication
**Description**: Automate the build, test, and deployment pipelines using GitHub Actions.
**Status**: done

## What Needs to Be Done

### 1. Quality Gate Workflows

- [x] Create workflow for linting, type checking, and running tests across the monorepo on every PR.

### 2. Automated Deployment

- [x] **Infra Deployment**: Automate `terraform apply` on merges to `main` for infrastructure changes.
- [x] **App Deployment**: Automate deployments to Cloudflare Workers using the Wrangler GitHub Action.

### 3. Secrets Management

- [x] Use Terraform or GitHub Actions secrets to manage and sync sensitive environment variables (Cloudflare tokens, Neon URLs, Stripe keys) across environments.

## End Goal

A fully automated pipeline that ensures code quality on every PR and automatically deploys infrastructure and application changes to production upon merge.

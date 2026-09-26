SHELL := /bin/bash

REPO_ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
SECRETS_SCRIPT := $(REPO_ROOT)scripts/set-github-env-secrets-from-env.sh
VARIABLES_SCRIPT := $(REPO_ROOT)scripts/set-github-env-vars-from-env.sh
BOOTSTRAP_SCRIPT := $(REPO_ROOT)scripts/bootstrap.sh
WRANGLER_BIN_DIR := $(REPO_ROOT)apps/notification-orchestrator/node_modules/.bin

# Classprints-style positional env file:
#   make envs-staging .env.staging
# The ENV_FILE form remains available for quoted paths and existing callers.
FILE ?= $(word 2,$(MAKECMDGOALS))
ENV_FILE ?= $(FILE)

ENV_TARGETS := envs envs-staging envs-production \
	bootstrap-staging bootstrap-production setup-staging setup-production

# Swallow only the positional env-file goal. Do not use a global `%:` rule:
ifneq ($(filter $(ENV_TARGETS),$(MAKECMDGOALS)),)
EXTRA_ENV_GOALS := $(filter-out $(ENV_TARGETS),$(MAKECMDGOALS))
ifneq ($(strip $(EXTRA_ENV_GOALS)),)
.PHONY: $(EXTRA_ENV_GOALS)
$(EXTRA_ENV_GOALS):
	@:
endif
endif

## Upload every known secret AND non-secret variable from one env file:
##   make envs-staging .env.staging
##   make envs-production .env.production
## Existing generic form remains supported:
##   make envs ENV_FILE="./path/to/.env" SECRETS_ENV=staging
.PHONY: envs envs-staging envs-production
envs:
	@test -n "$(ENV_FILE)" || { echo 'Usage: make envs ENV_FILE="./path/to/.env" SECRETS_ENV=staging|production' >&2; exit 1; }
	@test -f "$(ENV_FILE)" || { echo "Env file not found: $(ENV_FILE)" >&2; exit 1; }
	@if [[ -n "$(SECRETS_ENV)" ]]; then \
		environment="$(SECRETS_ENV)"; \
	else \
		read -r -p "Which ENV should we set? [production | staging]: " environment; \
	fi; \
	[[ "$$environment" == "staging" || "$$environment" == "production" ]] || { echo "Invalid environment: $$environment" >&2; exit 1; }; \
	bash "$(SECRETS_SCRIPT)" "$$environment" "$(ENV_FILE)"; \
	bash "$(VARIABLES_SCRIPT)" "$$environment" "$(ENV_FILE)"

envs-staging:
	@$(MAKE) --no-print-directory envs ENV_FILE="$(ENV_FILE)" SECRETS_ENV=staging

envs-production:
	@$(MAKE) --no-print-directory envs ENV_FILE="$(ENV_FILE)" SECRETS_ENV=production

## Load the same gitignored env file and run the one-time idempotent bootstrap:
##   make bootstrap-staging .env.staging
##   make bootstrap-production .env.production
.PHONY: bootstrap-staging bootstrap-production
bootstrap-staging:
	@test -n "$(ENV_FILE)" || { echo "usage: make bootstrap-staging .env.staging" >&2; exit 1; }
	@test -f "$(ENV_FILE)" || { echo "env file not found: $(ENV_FILE)" >&2; exit 1; }
	@set -a; source "$(ENV_FILE)"; set +a; \
		PATH="$(WRANGLER_BIN_DIR):$$PATH" "$(BOOTSTRAP_SCRIPT)" staging

bootstrap-production:
	@test -n "$(ENV_FILE)" || { echo "usage: make bootstrap-production .env.production" >&2; exit 1; }
	@test -f "$(ENV_FILE)" || { echo "env file not found: $(ENV_FILE)" >&2; exit 1; }
	@set -a; source "$(ENV_FILE)"; set +a; \
		PATH="$(WRANGLER_BIN_DIR):$$PATH" "$(BOOTSTRAP_SCRIPT)" production

## For a fully populated env file, bootstrap resources then upload GitHub values.
## A fresh Neon project requires one pause: paste the connection strings printed
## by bootstrap into the env file, rerun bootstrap, then run setup-*.
.PHONY: setup-staging setup-production
setup-staging:
	@$(MAKE) --no-print-directory bootstrap-staging ENV_FILE="$(ENV_FILE)"
	@$(MAKE) --no-print-directory envs-staging ENV_FILE="$(ENV_FILE)"

setup-production:
	@$(MAKE) --no-print-directory bootstrap-production ENV_FILE="$(ENV_FILE)"
	@$(MAKE) --no-print-directory envs-production ENV_FILE="$(ENV_FILE)"

## Dispatch the staging deployment orchestrator from the staging branch.
.PHONY: deploy-staging
deploy-staging:
	gh workflow run deploy.yml --ref staging -f environment=staging

## Dispatch the production deployment orchestrator from the main branch.
.PHONY: deploy-production
deploy-production:
	gh workflow run deploy.yml --ref main -f environment=production

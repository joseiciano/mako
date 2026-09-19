SHELL := /bin/bash

# Resolve the script relative to this Makefile so `make -C terraform envs ...` also works.
SECRETS_SCRIPT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))scripts/set-github-env-secrets-from-env.sh

# First extra goal after the target name (e.g. the .env path in `make envs ./.env.production`).
ENV_FILE := $(firstword $(filter-out envs,$(MAKECMDGOALS)))

# Swallow the extra goal (the .env path) so make doesn't fail with
# "No rule to make target". Explicit targets below take precedence.
%:
	@:

## Set GitHub environment secrets from a .env file:
##   make envs ./path/to/.env                     (prompts for production|staging)
##   make envs SECRETS_ENV=staging ./path/to/.env (non-interactive)
.PHONY: envs
envs:
	@if [[ -z "$(ENV_FILE)" ]]; then \
	  echo "Usage: make envs ./path/to/.env [SECRETS_ENV=staging|production]"; \
	  exit 1; \
	elif [[ ! -f "$(ENV_FILE)" ]]; then \
	  echo "Env file not found: $(ENV_FILE)"; \
	  exit 1; \
	fi; \
	if [[ -n "$(SECRETS_ENV)" ]]; then \
	  environment="$(SECRETS_ENV)"; \
	else \
	  read -r -p "Which ENV should we set? [production | staging]: " environment; \
	fi; \
	bash $(SECRETS_SCRIPT) "$$environment" "$(ENV_FILE)"

## Dispatch the staging application deployment workflow from the staging branch.
.PHONY: deploy-staging
deploy-staging:
	gh workflow run deploy-applications.yml --ref staging -f environment=staging

## Dispatch the production application deployment workflow from the main branch.
.PHONY: deploy-production
deploy-production:
	gh workflow run deploy-applications.yml --ref main -f environment=production

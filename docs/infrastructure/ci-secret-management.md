# Secret management in CI Pipeline

Use one gitignored environment file per deployment environment:

```bash
cp .env.staging.example .env.staging
# Fill values, then:
make bootstrap-staging .env.staging
make envs-staging .env.staging
```

Use the corresponding `production` template/targets for production. The
`bootstrap-*` target exports the file into `scripts/bootstrap.sh`; `envs-*`
uploads the canonical secret inventory plus `EMAIL_SENDING_ZONE_ID`,
`EMAIL_SENDING_DOMAIN`, and `AUTH_EMAIL_VERIFICATION_ENFORCED` as GitHub
Environment variables. Filled `.env.staging` / `.env.production` files are
gitignored and must never be committed.

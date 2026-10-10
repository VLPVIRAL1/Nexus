# Hostinger deployment guide — Nexus Tax

Nexus deploys to **Hostinger Business Web Hosting as a managed Node.js Web App** connected directly to `VLPVIRAL1/Nexus`. It is not a static FTP deployment: Next.js server rendering, API routes, authentication, PostgreSQL workflows and the durable artifact worker require a persistent Node.js process.

BusAcTa.com remains a useful operational reference, but its `dist/` + FTP + `.htaccess` pattern is only suitable for its static Vite site. Do not upload Nexus `.next/` files to `public_html`, add an SPA fallback, or configure the BusAcTa.com FTP workflow for this repository.

Hostinger currently documents Business Web Hosting support for Next.js, Node.js 24, GitHub imports and automatic builds on pushes to the connected branch:

- [Add a Node.js web app](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [Migrate a Node.js application using GitHub](https://www.hostinger.com/support/how-to-migrate-a-node-js-application-to-hostinger/)
- [Connect a Supabase database](https://www.hostinger.com/support/connecting-a-supabase-database-to-a-hostinger-node-js-application/)

## Repository contract

Use these settings in Hostinger's **Web App / Node.js** deployment flow:

| Setting | Value |
|---|---|
| Repository | `VLPVIRAL1/Nexus` |
| Branch | `main` |
| Framework | Next.js |
| Node.js | 24.x |
| Application root | repository root |
| Install command | `npm ci` |
| Build command | `npm run hostinger:build` |
| Start command | `npm run hostinger:start` |
| Health endpoint | `/api/health` |

`hostinger:build` applies pending SQL migrations, runs the fail-closed production-readiness check and builds the optimized Next.js application. `hostinger:start` runs the Next.js server and durable artifact worker under one signal-aware supervisor. If either process fails unexpectedly, the supervisor exits so Hostinger can report and restart the unhealthy deployment.

Hostinger supplies the listening port to the application. Do not hard-code `PORT`. The start command binds Next.js to `0.0.0.0` and inherits Hostinger's port.

## Production environment variables

Enter values in Hostinger's environment-variable interface. Never add production values to GitHub, this guide, build logs or `.env.example`.

Use [`.env.hostinger.example`](.env.hostinger.example) as the copy-ready variable list. Replace every angle-bracket placeholder in Hostinger hPanel; do not commit a populated copy.

### Runtime and database

| Name | Requirement |
|---|---|
| `APP_ENV` | Exactly `production` |
| `DATABASE_URL` | Approved Supabase PostgreSQL connection string; use the Supabase session pooler when direct IPv6 connectivity is unavailable |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Base64 encoding of exactly 32 random bytes, identical during build and runtime |
| `AUTH_RATE_LIMIT_SECRET` | At least 32 random characters |
| `NEXUS_AUTH_FLOW_KEY` | Base64 encoding of exactly 32 random bytes |
| `NEXUS_SOURCE_ENCRYPTION_KEY` | Base64 encoding of exactly 32 random bytes |
| `NEXUS_TRUSTED_NETWORK_HEADER` | Proxy-overwritten client IP header; start with `x-real-ip` and verify it through an approved Hostinger ingress test |

Generate each encryption key independently in a trusted local terminal with `openssl rand -base64 32`. Generate the rate-limit secret independently with `openssl rand -hex 32`. Do not reuse one value for another purpose.

### Supabase authentication

| Name | Requirement |
|---|---|
| `SUPABASE_URL` | Approved project HTTPS URL |
| `SUPABASE_PUBLISHABLE_KEY` | Project publishable key; never use a service-role key |
| `NEXT_PUBLIC_SUPABASE_URL` | Same value as `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same value as `SUPABASE_PUBLISHABLE_KEY` |
| `NEXUS_AUTH_RECOVERY_REDIRECT_URL` | `https://<production-domain>/auth/recovery/confirm` |
| `NEXUS_AUTH_DEFAULT_FIRM_ID` | Optional approved pilot firm UUID |

Add the exact recovery URL and production site origin to the Supabase Auth redirect allowlist. Explicitly link each approved Supabase subject with `npm run auth:link`; the readiness gate requires at least one provisioned identity.

### Production services and approvals

The remaining variables are mandatory because Nexus handles tax data and intentionally refuses to claim readiness without them:

- `NEXUS_MALWARE_SCANNER_URL`
- `NEXUS_MALWARE_SCANNER_TOKEN`
- `NEXUS_MONITORING_PROVIDER`
- `NEXUS_INCIDENT_OWNER`
- `NEXUS_SECURITY_OWNER`
- `NEXUS_PRODUCT_OWNER`
- `NEXUS_SCOPE_APPROVAL_REF`
- `NEXUS_TAX_RULE_OWNER`
- `NEXUS_TAX_RULE_APPROVAL_REF`
- `NEXUS_RETENTION_POLICY_REF`
- `NEXUS_PRODUCTION_DATA_AUTHORIZATION_REF`
- `NEXUS_BACKUP_PROVIDER`
- `NEXUS_BACKUP_RPO_MINUTES` (maximum `60`)
- `NEXUS_BACKUP_RTO_MINUTES` (maximum `240`)
- `NEXUS_BACKUP_RESTORE_EVIDENCE_REF`

The scanner must be an approved HTTPS service. Evidence references must point to controlled records without taxpayer values or credentials. Hostinger deployment does not by itself approve production data, the tax-rule package, retention, security or recovery.

## Initial Hostinger setup

1. In Hostinger, choose **Websites → Create website → Web App / Node.js**.
2. Choose **Import Git Repository**, authorize the Hostinger GitHub App and grant it access to `VLPVIRAL1/Nexus`.
3. Select `main`, Next.js and Node.js 24.x, then enter the repository contract above.
4. Add every required environment variable. Hostinger can connect to Supabase, but verify that the resulting PostgreSQL value is available specifically as `DATABASE_URL` and that the four Nexus Supabase variables use the names above.
5. Deploy. A missing migration, identity, secret, owner or evidence reference makes `hostinger:build` fail before the new release becomes active.
6. Connect the intended domain, enable HTTPS and update the recovery URL in both Hostinger and Supabase.
7. Verify `/api/health`, login, MFA, recovery, session cookies, same-origin mutations, source scanning, artifact generation/download and the Release closure page using synthetic data.
8. Import the emitted `npm run readiness:production` JSON into **Administration → Release closure → Security & infrastructure** and retain the Hostinger deployment reference.

The GitHub connection automatically deploys new pushes to the selected branch. Protect `main` so changes reach it only after the required CI workflow succeeds. If a deployment must be backed out, revert the offending commit on `main`; Hostinger will build the resulting known repository state.

## Operational checks

Hostinger's runtime logs must show both:

```text
Hostinger runtime started: Next.js web and artifact worker are supervised together.
Artifact worker … started
```

After every deployment:

1. Confirm `/api/health` returns HTTP 200 with `status: ok`.
2. Confirm the deployment commit matches the intended `main` commit.
3. Confirm Hostinger runtime logs contain no restart loop or database/scanner error.
4. Generate one synthetic artifact and confirm the worker changes its job from queued to succeeded.
5. Run the authentication and production-data checks listed in `docs/operations-runbook.md` before real-user access.

Hostinger Business Web Hosting is the selected managed application host, while Supabase remains the PostgreSQL and authentication provider. If the application outgrows the Business plan's process/resource limits or requires separately scaled workers, move the same build/start contract to Hostinger Cloud or a managed VPS; do not silently disable the artifact worker.

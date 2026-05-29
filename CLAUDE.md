# ar-qc-html — Claude Code Brief

## Deployment — CI-on-push via GitHub Actions OIDC (read before changing anything)

**Auto-deploys on every push to `main`** via `.github/workflows/deploy.yml`, which assumes IAM role
`github-actions-ar-qc` through GitHub **OIDC** (no static keys) and deploys to **s3://justintormey.com/ar-qc/**, then invalidates CloudFront `E1R27W2LA6BBEH`.
Configured 2026-05-29 — full initiative: `~/PROJECTS/ci-oidc-deploy-rollout.md`.

### Guardrails for future sessions / AI agents — DO NOT REGRESS
- **Deploy = merge.** To ship, push to `main`. CI does the deploy. This is the canonical path.
- Local fallback: `scripts/deploy` — uses the local `default` AWS profile. **Emergency/local use only, NOT the primary path.**
- **Do NOT** add AWS access keys/secrets to this repo or GitHub. Auth is **OIDC only**.
- **Do NOT** change the role trust (pinned to `repo:justintormey/ar-qc-html:ref:refs/heads/main`), its permission
  scope, the bucket/prefix, or the distribution. **Do NOT** replace the workflow with another deploy method or
  re-introduce the retired Half Bakery deployer.

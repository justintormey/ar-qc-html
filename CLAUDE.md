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

---

## Versioning — Semantic Versioning (mandatory)

This project follows [Semantic Versioning 2.0.0](https://semver.org/): `MAJOR.MINOR.PATCH`. Any agent/LLM making changes here MUST bump the version automatically as part of the change — never wait to be asked.

- **MAJOR** — breaking change: removed/renamed capability, incompatible API/CLI/schema/data-format/UX change
- **MINOR** — new backward-compatible functionality
- **PATCH** — backward-compatible bug fix, perf tweak, copy correction
- Docs-only or internal-refactor changes with no behavior change: no bump
- Pre-1.0 (`0.y.z`): breaking → MINOR, everything else → PATCH; new projects start at `0.1.0`

In the SAME commit as the change, update the version everywhere it appears:
1. **Source of truth** — whatever this repo uses (`package.json`, `VERSION`, `Info.plist`/`project.yml` `MARKETING_VERSION`, `pyproject.toml`, site footer constant). If none exists yet, create a root `VERSION` file at `0.1.0` and wire displays to it.
2. **Documentation** — add a `CHANGELOG.md` entry (create the file if missing); update README/docs anywhere a version is stated.
3. **User interface** — every surface that displays a version (About screen, footer, settings, CLI `--version`) must read from the single source of truth, never a second hardcoded copy.
4. **GitHub** — tag the release commit `vX.Y.Z` and push the tag with the branch (GitHub Releases for MAJOR/MINOR on repos that use them).

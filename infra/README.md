# `ar-qc/` Deploy Infrastructure

Mirrors the `qr-contact-card` pattern: GitHub Actions → AWS S3 + CloudFront via OIDC role assumption. No long-lived AWS keys.

## What gets created

1. **GitHub repo** — e.g. `justintormey/argo-cio-demo` (or any name)
2. **IAM role** — `github-actions-ar-qc` — trusted to assume from `repo:<owner>/<repo>:ref:refs/heads/main`
3. **GitHub secret** — `AWS_ROLE_TO_ASSUME` = the role's ARN

The OIDC identity provider for `token.actions.githubusercontent.com` already exists in this AWS account (the `/qr/` deploy uses it). You do not need to recreate it.

## One-time setup commands

Set environment variables once for the session (replace `<...>` placeholders):

```bash
export AWS_ACCOUNT_ID=<your-12-digit-account-id>
export GH_OWNER=justintormey
export GH_REPO=argo-cio-demo
export ROLE_NAME=github-actions-ar-qc
```

### 1. Substitute placeholders in the JSON files

```bash
cd ~/PROJECTS/argo-cio-demo/infra
sed "s/__AWS_ACCOUNT_ID__/$AWS_ACCOUNT_ID/g; s/__GITHUB_OWNER__/$GH_OWNER/g; s/__GITHUB_REPO__/$GH_REPO/g" \
  iam-trust-policy.json > /tmp/ar-qc-trust.json
sed "s/__AWS_ACCOUNT_ID__/$AWS_ACCOUNT_ID/g" \
  iam-permissions-policy.json > /tmp/ar-qc-perms.json
```

### 2. Create the role + attach the inline policy

```bash
aws iam create-role \
  --role-name "$ROLE_NAME" \
  --assume-role-policy-document file:///tmp/ar-qc-trust.json \
  --description "Deploy ar-qc/ static site to S3 + invalidate CloudFront"

aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name ar-qc-deploy \
  --policy-document file:///tmp/ar-qc-perms.json

aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text
```

Record the ARN that prints (it will look like `arn:aws:iam::123456789012:role/github-actions-ar-qc`).

### 3. Create the GitHub repo + set the secret

```bash
gh repo create "$GH_OWNER/$GH_REPO" --private --source ~/PROJECTS/argo-cio-demo --remote origin

# The ARN you recorded above:
gh secret set AWS_ROLE_TO_ASSUME --body "<the-role-arn>" --repo "$GH_OWNER/$GH_REPO"
```

### 4. Push to trigger the first deploy

```bash
cd ~/PROJECTS/argo-qc-html
git add -A
git commit -m "Initial commit"
git branch -M main
git push -u origin main
```

Watch the deploy run:

```bash
gh run watch -R "$GH_OWNER/$GH_REPO"
```

Once green: open https://demo.justintormey.com/ar-qc/ in Chrome and verify the landing page renders.

## Scoping notes

- **S3 prefix scope**: the role can only `PutObject`/`DeleteObject` under `s3://justintormey.com/ar-qc/*`. It cannot touch `/qr/`, `/3d-element-model/`, etc.
- **CloudFront scope**: limited to `CreateInvalidation` on the demo distribution `E1R27W2LA6BBEH`. Cannot modify the distribution config.
- **GitHub OIDC scope**: trust condition restricts the role to pushes to `main` of the specified repo. PRs from forks cannot assume the role.

## Tearing it down

```bash
aws iam delete-role-policy --role-name "$ROLE_NAME" --policy-name ar-qc-deploy
aws iam delete-role --role-name "$ROLE_NAME"
aws s3 rm s3://justintormey.com/ar-qc/ --recursive
aws cloudfront create-invalidation --distribution-id E1R27W2LA6BBEH --paths "/ar-qc/*"
```

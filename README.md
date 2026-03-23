# FairShare Web

Standalone FairShare web client, published with GitHub Pages.

## Local preview

Serve this directory with any static file server.

## Deployment

- GitHub Actions workflow: `.github/workflows/deploy.yml`
- Pages source: workflow artifact from repository root
- Custom domain: `fairshare.rosedales.com` via `CNAME`

## DNS checklist

For `fairshare.rosedales.com`, create a `CNAME` record that points to:

- `<your-github-username>.github.io`

Then in GitHub repository settings:

1. Enable Pages with **GitHub Actions** as source.
2. Set custom domain to `fairshare.rosedales.com`.
3. Wait for TLS certificate issuance.

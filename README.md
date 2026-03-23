# FairShare Web

Standalone FairShare web client, published with GitHub Pages.

## Local preview

Serve this directory with any static file server.

## Deployment

- GitHub Actions workflow: `.github/workflows/deploy.yml`
- Pages source: workflow artifact from repository root
- Custom domain: `app.fairshare.social` via `CNAME`

## DNS checklist (Cloudflare)

In **Cloudflare** → **fairshare.social** → **DNS** → **Records**:

1. Add a **CNAME** record:
   - **Name**: `app` (this is `app.fairshare.social`)
   - **Target**: `philiprosedale.github.io`
   - **Proxy status**: **DNS only** (grey cloud) — recommended for GitHub Pages so GitHub can issue TLS cleanly.

Then in the **fairshare** GitHub repository → **Settings** → **Pages**:

1. **Build and deployment** source: **GitHub Actions** (if not already).
2. **Custom domain**: `app.fairshare.social` → Save.
3. Wait for **DNS check** to pass, then enable **Enforce HTTPS** when available.

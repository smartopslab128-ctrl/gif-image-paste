# GIF & Image Paste - Handoff Notes

Last updated: 2026-04-26 (JST)
Project owner: smartopslab128-ctrl

## 1) What has been completed

- App monetization model changed to fully free.
  - Removed paid unlock/trial-style restriction flow from app UX.
  - Item cap logic effectively opened up (no practical cap).
  - License/upgrade UI flow removed from desktop app.
- BMC support flow improved.
  - Buy Me a Coffee link kept as official support method.
  - Added milestone prompt behavior in app around every 100 saved items.
- Website/docs updated for the new model.
  - Custom domain set to `gi.tool.smartopslab128.com` (GitHub Pages + CNAME).
  - Pricing section changed to fully free messaging.
  - Support section clarified with official BMC URL.
  - Privacy policy page added at `docs/privacy.html`.
  - Footer includes privacy policy link.
  - Ad placeholder block added in lower area of landing page.
- AdSense prep completed on website.
  - AdSense site script inserted in `docs/index.html` `<head>` with:
    - `ca-pub-4466793055864480`
- Release work completed.
  - `v0.2.0` release published.
  - Portable EXE naming prepared as `GIF & Image Paste 0.2.0.exe`.

## 2) Current live endpoints

- Landing site: `https://gi.tool.smartopslab128.com/`
- Privacy page: `https://gi.tool.smartopslab128.com/privacy.html`
- GitHub latest release: `https://github.com/smartopslab128-ctrl/gif-image-paste/releases/latest`
- BMC page: `https://www.buymeacoffee.com/smartopslab128`

## 3) DNS / domain state (important)

- Domain DNS is controlled by ConoHa nameservers (not Onamae DNS records in effect).
- Subdomain CNAME path used:
  - `gi.tool.smartopslab128.com` -> `smartopslab128-ctrl.github.io`
- GitHub Pages custom domain + HTTPS is configured and working.

## 4) AdSense state

- In AdSense, parent domain `smartopslab128.com` appears as "Getting ready / 準備中".
- Because domain family is already added, subdomain may show as already added.
- Action now: mostly waiting phase.
- Keep site stable while under review:
  - avoid major layout/content churn
  - keep privacy page accessible
  - ensure links are not broken

## 5) BMC / Stripe context

- Support flow is optional donation/support style.
- Stripe review text was prepared/submitted with clear business description.
- If additional review request arrives, respond with:
  - software type (desktop utility)
  - what is sold (optional support / software-related)
  - official website
  - support contact path (GitHub Issues)

## 6) File/Folder operations already done on D drive

- Development copy exists on D drive under:
  - `D:\PCWork\GIF‐imagepasteTool` (name includes special hyphen char)
- Lightweight release folder created separately:
  - `D:\PCWork\GIF-imagepasteTool-release`
  - contains:
    - `GIF & Image Paste 0.2.0.exe`
    - `README.txt`

## 7) Recommended next steps (from now)

1. Wait for AdSense decision.
2. If approved:
   - replace ad placeholder with real ad unit code in docs landing page.
   - push to main and verify on live domain.
3. If rejected:
   - capture exact rejection reason text and revise site accordingly.
4. Verify BMC/Stripe completion status and run one small end-to-end support test.

## 8) "Continue work from here" prompt for a new chat

Use this exact prompt in a new chat to resume quickly:

```
Please continue this project from the handoff file:
D:\PCWork\GIF‐imagepasteTool\PROJECT_HANDOFF_2026-04-26.md

Context:
- App: GIF & Image Paste (Electron)
- Live site: https://gi.tool.smartopslab128.com/
- Current focus: AdSense review wait + post-approval ad unit insertion + BMC/Stripe readiness

First, read the handoff file and verify current repo status, then suggest the smallest next action.
```

## 9) Safety notes for future edits

- Keep one primary development folder (D drive copy) to avoid split-brain edits.
- After significant changes:
  - commit
  - push to `main`
  - verify live site and release assets
- For paths containing `&` or special hyphen characters, always quote the path.


# Appointment Setter Board · LifeSource

Dashboard for the appointments team to work residential leads the assigned
field sales rep didn't reach in time. Claim a record (24h lock), dial from
the comment history, and jump to the CRM to book.

Sibling of SalesRep-Dash and CDR-dash: Vite + React, deployed as an Azure
Static Web App, behind Microsoft Entra SSO.

## Run locally
    npm install
    npm run dev        # http://localhost:5173
    npm run build      # outputs to dist/

## Deploy (Azure Static Web App)
- App location:    /
- Api location:    (blank)
- Output location: dist
Azure commits the GitHub Actions workflow on first link; pushes to the
chosen branch auto-deploy.

## Current state
Runs on embedded sample records so the comment-parsing, categorization,
claim/lock, and filtering are all live and demonstrable. Phase 2 swaps the
seed for the live feed.

## Phase 2 — wire the live data (all seams marked // PROD: in src/App.jsx)
- [ ] DATA: replace SEED with fetch() of the untouched-leads endpoint
- [ ] CLAIM STORE: persist claims to Azure Table Storage via a managed
      Function (saveClaim / loadClaims) so locks are shared across setters
- [ ] IDENTITY: replace the user switcher with the Entra SSO identity
- [ ] ROSTER: real rep -> branch map (BRANCH_BY_REP)
- [ ] LOST: confirm lost status_id(s) (LOST_STATUS_IDS)
- [ ] sLEADS / COMMERCIAL: implement isSLead() / isCommercial()
- [ ] CRM_RECORD_URL: real deep-link template for the Book button

## Access control
staticwebapp.config.json currently requires any authenticated Entra user.
To restrict to the appointments team + directors, mirror the auth/role
block from SalesRep-Dash so it points at the same app registration/tenant,
then assign the role to that group.

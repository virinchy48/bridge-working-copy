# BTP Initial Setup Guide

## NHVR Bridge Asset & Restriction Management System

**MTA ID:** nhvr-bridge-app
**Version:** 4.7.4
**Platform:** SAP BTP Cloud Foundry
**Runtime:** Node.js >= 20

This guide walks through the complete setup of a fresh SAP BTP environment for deploying the NHVR Bridge Asset & Restriction Management System. It is intended for platform administrators and DevOps engineers performing a first-time deployment.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [BTP Environment Setup](#2-btp-environment-setup)
3. [Service Instance Creation](#3-service-instance-creation)
4. [Build and Deploy Steps](#4-build-and-deploy-steps)
5. [Post-Deployment Configuration](#5-post-deployment-configuration)
6. [Verifying Deployment](#6-verifying-deployment)
7. [CI/CD Setup](#7-cicd-setup)
8. [Troubleshooting](#8-troubleshooting)
9. [Environment Variables and Secrets](#9-environment-variables-and-secrets)

---

## 1. Prerequisites

### 1.1 SAP BTP Account

- An SAP BTP Global Account (trial or enterprise).
- At least one subaccount in the Cloud Foundry environment.
- A Cloud Foundry org and space provisioned within the subaccount.

### 1.2 Required Entitlements

The following service entitlements must be assigned to your subaccount:

| Service                  | Plan        | Purpose                              |
|--------------------------|-------------|--------------------------------------|
| SAP HANA Cloud           | hana        | Database (HDI container via hdi-shared) |
| SAP HANA Schemas & HDI Containers | hdi-shared | HDI container for CDS schema deployment |
| SAP Authorization and Trust Management (XSUAA) | application | Authentication and role-based authorization |
| SAP BTP Destination Service | lite     | Backend destination routing            |
| SAP Application Logging   | lite       | Centralized application log collection |
| Cloud Foundry Runtime     | MEMORY     | Minimum 1 GB (512 MB srv + 256 MB router + 256 MB deployer) |

### 1.3 Required Tools

Install the following on your local workstation before proceeding:

| Tool | Minimum Version | Install Command |
|------|----------------|-----------------|
| Node.js | >= 20.0.0 | https://nodejs.org or `nvm install 20` |
| CF CLI | v8 | See section below |
| SAP Cloud MTA Build Tool (MBT) | Latest | `npm install -g mbt` |
| SAP CDS Development Kit | >= 9.0.0 | `npm install -g @sap/cds-dk` |
| Git | Any recent | https://git-scm.com |

**Installing CF CLI v8:**

```bash
# macOS (Homebrew)
brew install cloudfoundry/tap/cf-cli@8

# Linux
curl -sL "https://packages.cloudfoundry.org/stable?release=linux64-binary&version=v8&source=github" | tar -zx
sudo mv cf8 /usr/local/bin/cf

# Verify
cf --version
```

**Installing MBT:**

```bash
npm install -g mbt
mbt --version
```

**Installing CDS Development Kit:**

```bash
npm install -g @sap/cds-dk
cds --version
```

---

## 2. BTP Environment Setup

### 2.1 Create a Subaccount

1. Log into the SAP BTP Cockpit at https://cockpit.btp.cloud.sap.
2. Navigate to your Global Account.
3. Go to **Account Explorer** and click **Create** > **Subaccount**.
4. Fill in the required fields:
   - **Display Name:** e.g., `NHVR Production` or `NHVR Development`
   - **Region:** Choose the region closest to your users (e.g., `US East (VA) - AWS` for `us10`)
   - **Subdomain:** e.g., `nhvr-prod` (must be globally unique)
   - **Environment:** Cloud Foundry
5. Click **Create**.

### 2.2 Enable Cloud Foundry

1. Open the new subaccount.
2. Go to **Cloud Foundry** > **Cloud Foundry Environment**.
3. Click **Enable Cloud Foundry**.
4. Set the **Org Name** (e.g., `nhvr-org`).
5. Once enabled, click **Create Space** and name it (e.g., `dev`, `staging`, or `prod`).

### 2.3 Assign Entitlements

1. In the Global Account, go to **Entitlements** > **Entity Assignments**.
2. Select your subaccount.
3. Click **Configure Entitlements** > **Add Service Plans**.
4. Add each of the entitlements listed in section 1.2.
5. Click **Save**.

### 2.4 Note Your CF API Endpoint

Your CF API endpoint follows the pattern:

```
https://api.cf.<region>.hana.ondemand.com
```

For example, for `us10`:

```
https://api.cf.us10-001.hana.ondemand.com
```

You can find this on the subaccount Overview page under **Cloud Foundry Environment**.

---

## 3. Service Instance Creation

### 3.1 Log Into Cloud Foundry

```bash
cf login -a https://api.cf.<region>.hana.ondemand.com
```

Enter your BTP email and password when prompted. Select the correct org and space.

### 3.2 Create HANA Cloud Instance

HANA Cloud must be created from the BTP Cockpit (it cannot be created via the CF CLI):

1. In the BTP Cockpit, open your subaccount.
2. Go to **SAP HANA Cloud** in the left navigation (or use **Service Marketplace**).
3. Click **Create Instance**.
4. Choose **SAP HANA Database**.
5. Configure:
   - **Instance Name:** `Hanaclouddb` (this is the name used in the keep-alive workflow)
   - **Memory:** 32 GB (minimum for production; 16 GB for trial/dev)
   - **Admin Password:** Set and store securely
6. Under **Allowed Connections**, add your Cloud Foundry space.
7. Click **Create**.
8. Wait for the instance to reach **Running** status (this can take 10-20 minutes).

**Important:** On the free tier, HANA Cloud automatically stops after a period of inactivity. See section 5.2 for how to manage this.

The HDI container (`nhvr-db`) is created automatically during MTA deployment. You do not need to create it manually.

### 3.3 Create XSUAA Instance (Automatic)

The XSUAA service instance is created automatically during MTA deployment using the configuration in `xs-security.json`. No manual creation is required.

If you need to create it manually for testing:

```bash
cf create-service xsuaa application nhvr-xsuaa -c xs-security.json
```

### 3.4 Create Destination Service Instance (Automatic)

Also created automatically during deployment. Manual creation:

```bash
cf create-service destination lite nhvr-destination
```

### 3.5 Create Application Logging Instance (Automatic)

Also created automatically during deployment. Manual creation:

```bash
cf create-service application-logs lite nhvr-logging
```

### 3.6 Verify Service Instances

After manual creation (or after first deployment), verify all services exist:

```bash
cf services
```

Expected output should include:

```
name               service            plan         bound apps
nhvr-db            hana               hdi-shared   nhvr-bridge-srv, nhvr-bridge-db-deployer
nhvr-xsuaa         xsuaa              application  nhvr-bridge-srv, nhvr-bridge-app-router
nhvr-destination   destination        lite         nhvr-bridge-app-router
nhvr-logging       application-logs   lite         nhvr-bridge-srv
```

---

## 4. Build and Deploy Steps

### 4.1 Clone and Install Dependencies

```bash
git clone <repository-url> nhvr-bridge-app
cd nhvr-bridge-app
npm install
```

### 4.2 Update xs-security.json

Before your first deployment, update `xs-security.json` to match your environment:

1. Replace the `xsappname` value with a name unique to your subaccount:

```json
"xsappname": "nhvr-bridge-app-<your-subdomain>"
```

2. Update the `redirect-uris` to match your BTP subdomain:

```json
"redirect-uris": [
    "https://<subdomain>-nhvr-bridge-app-router.cfapps.<region>.hana.ondemand.com/login/callback",
    "https://<subdomain>-nhvr-bridge-app-router.cfapps.<region>.hana.ondemand.com/"
]
```

### 4.3 Build the MTA Archive

```bash
# Step 1: Run CDS production build
cds build --production

# Step 2: Build the MTA archive
mbt build
```

This produces an `.mtar` file in the `mta_archives/` directory:

```
mta_archives/nhvr-bridge-app_4.7.4.mtar
```

### 4.4 Deploy to BTP

```bash
# Ensure you are logged in
cf login -a https://api.cf.<region>.hana.ondemand.com

# Deploy the archive
cf deploy mta_archives/nhvr-bridge-app_4.7.4.mtar --version-rule ALL -f
```

**Flags explained:**

- `--version-rule ALL` -- Allows deploying any version, even if a higher version was previously deployed.
- `-f` -- Force deployment without interactive confirmation.

The deployment takes approximately 5-10 minutes and will:

1. Run the CDS build (module `nhvr-bridge-app-cds-build`).
2. Deploy the HANA HDI schema (`nhvr-bridge-db-deployer`) -- this module stops after schema deployment.
3. Start the CAP backend (`nhvr-bridge-srv`) with 512 MB memory.
4. Start the App Router (`nhvr-bridge-app-router`) with 256 MB memory.
5. Create and bind all required service instances.

### 4.5 One-Command Build and Deploy

For convenience, the full build-and-deploy sequence:

```bash
cds build --production && mbt build && cf deploy mta_archives/nhvr-bridge-app_4.7.4.mtar --version-rule ALL -f
```

---

## 5. Post-Deployment Configuration

### 5.1 Role Collection Assignment

After deployment, XSUAA creates seven role collections. You must assign users to these role collections in the BTP Cockpit.

**Role Collections:**

| Role Collection | Description | Included Scopes |
|----------------|-------------|-----------------|
| NHVR_Admin | Full administrative access | Admin, BridgeManager, Viewer, Uploader, Executive, Inspector, Operator |
| NHVR_BridgeManager | Bridge and restriction management (engineers/planners) | BridgeManager, Viewer, Uploader, Executive, Inspector |
| NHVR_Inspector | Bridge inspection (AS 5100 condition assessments) | Inspector, Viewer |
| NHVR_Operator | Field operations (temporary restrictions, permits) | Operator, Viewer |
| NHVR_Viewer | Read-only access for general staff | Viewer |
| NHVR_Executive | Executive dashboard and KPI analytics | Executive, Viewer |
| NHVR_TechAdmin | Technical admin (BTP environment, integrations, GIS config) | TechAdmin, Viewer |

**To assign users:**

1. In the BTP Cockpit, navigate to your subaccount.
2. Go to **Security** > **Role Collections**.
3. Click on a role collection (e.g., `NHVR_Admin`).
4. Click **Edit**.
5. Under **Users**, add the user by email (must match the Identity Provider).
6. Click **Save**.

**For IdP group mapping (recommended for production):**

1. Go to **Security** > **Trust Configuration**.
2. Click on your Identity Provider.
3. Under **Role Collection Mappings**, map IdP groups to role collections. For example:
   - AD group `sg-nhvr-admin` maps to `NHVR_Admin`
   - AD group `sg-nhvr-techadmin` maps to `NHVR_TechAdmin`

### 5.2 HANA Cloud Start/Stop Management

**Free tier:** HANA Cloud on the free tier stops automatically after a period of inactivity. You must ensure it is running before deploying or using the application.

**Check HANA status:**

```bash
cf service Hanaclouddb
```

Look for `status: succeeded` (running) or `status: stopped`.

**Start HANA manually:**

```bash
cf update-service Hanaclouddb -c '{"data": {"serviceStopped": false}}'
```

Wait 2-5 minutes for HANA to fully start before deploying.

**Stop HANA (to save quota):**

```bash
cf update-service Hanaclouddb -c '{"data": {"serviceStopped": true}}'
```

**Automated keep-alive:** The repository includes a GitHub Actions workflow (`.github/workflows/hana-keepalive.yml`) that runs twice daily to prevent auto-stop. See section 7 for setup.

### 5.3 App Router Session Settings

The app router is configured with the following properties in `mta.yaml`:

- `INCOMING_CONNECTION_TIMEOUT`: 60000 ms (60 seconds)
- `SESSION_TIMEOUT`: 15 minutes

Adjust these in `mta.yaml` before building if your organization requires different values.

---

## 6. Verifying Deployment

### 6.1 Check Application Status

```bash
cf apps
```

Expected output:

```
name                       requested state   processes   routes
nhvr-bridge-srv            started           web:1/1     <subdomain>-nhvr-bridge-srv.cfapps.<region>.hana.ondemand.com
nhvr-bridge-app-router     started           web:1/1     <subdomain>-nhvr-bridge-app-router.cfapps.<region>.hana.ondemand.com
nhvr-bridge-db-deployer    stopped           web:0/1     <subdomain>-nhvr-bridge-db-deployer.cfapps.<region>.hana.ondemand.com
```

Notes:
- `nhvr-bridge-srv` and `nhvr-bridge-app-router` must be in `started` state.
- `nhvr-bridge-db-deployer` will be `stopped` -- this is expected. It runs only during deployment to apply schema changes and then stops.

### 6.2 Check Service Bindings

```bash
cf services
```

Verify all four services (`nhvr-db`, `nhvr-xsuaa`, `nhvr-destination`, `nhvr-logging`) show `create succeeded` or `update succeeded`.

### 6.3 Test the Application URL

Open the app router URL in a browser:

```
https://<subdomain>-nhvr-bridge-app-router.cfapps.<region>.hana.ondemand.com
```

You should be redirected to the IdP login page. After authentication, the NHVR Bridge Management dashboard should load.

### 6.4 Test the Backend API

```bash
# Get the srv URL
cf app nhvr-bridge-srv | grep routes

# Test the health endpoint (unauthenticated metadata)
curl -s https://<subdomain>-nhvr-bridge-srv.cfapps.<region>.hana.ondemand.com/bridge-management/$metadata | head -20
```

### 6.5 Check Application Logs

```bash
# Recent logs for the backend
cf logs nhvr-bridge-srv --recent

# Recent logs for the app router
cf logs nhvr-bridge-app-router --recent

# Stream live logs
cf logs nhvr-bridge-srv
```

### 6.6 Check MTA Deployment History

```bash
cf mta nhvr-bridge-app
```

This shows the deployed version, all modules, and their status.

---

## 7. CI/CD Setup

### 7.1 GitHub Actions Secrets

Configure the following secrets in your GitHub repository under **Settings** > **Secrets and variables** > **Actions**:

| Secret Name   | Value | Description |
|---------------|-------|-------------|
| `CF_API`      | `https://api.cf.<region>.hana.ondemand.com` | CF API endpoint |
| `CF_USERNAME` | BTP platform user email | CF login username |
| `CF_PASSWORD` | BTP platform user password | CF login password |
| `CF_ORG`      | Your CF org name | Cloud Foundry organization |
| `CF_SPACE`    | Your CF space name | Cloud Foundry space |

### 7.2 HANA Keep-Alive Workflow

The repository includes `.github/workflows/hana-keepalive.yml` which runs on a schedule (twice daily at 06:00 and 18:00 UTC) to prevent the free-tier HANA Cloud instance from auto-stopping.

This workflow:

1. Installs CF CLI v8.
2. Logs in using the secrets above.
3. Sends `cf update-service Hanaclouddb -c '{"data": {"serviceStopped": false}}'`.
4. Waits 90 seconds and verifies status.
5. Checks that the NHVR apps are still running.

It can also be triggered manually from the GitHub Actions UI via `workflow_dispatch`.

**To disable** (e.g., for enterprise HANA that does not auto-stop), either delete the workflow file or set the cron schedule to never fire.

### 7.3 Deployment Workflow (Example)

Create `.github/workflows/deploy.yml` for automated deployments:

```yaml
name: Deploy to BTP

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    name: Build and Deploy
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install CDS and MBT
        run: |
          npm install -g @sap/cds-dk mbt

      - name: Build
        run: |
          cds build --production
          mbt build

      - name: Install CF CLI v8
        run: |
          curl -sL "https://packages.cloudfoundry.org/stable?release=linux64-binary&version=v8&source=github" | tar -zx
          sudo mv cf8 /usr/local/bin/cf

      - name: Login to BTP
        env:
          CF_API:      ${{ secrets.CF_API }}
          CF_USERNAME: ${{ secrets.CF_USERNAME }}
          CF_PASSWORD: ${{ secrets.CF_PASSWORD }}
          CF_ORG:      ${{ secrets.CF_ORG }}
          CF_SPACE:    ${{ secrets.CF_SPACE }}
        run: |
          cf login -a "$CF_API" -u "$CF_USERNAME" -p "$CF_PASSWORD" -o "$CF_ORG" -s "$CF_SPACE"

      - name: Deploy
        run: |
          cf deploy mta_archives/nhvr-bridge-app_4.7.4.mtar --version-rule ALL -f

      - name: Verify
        run: |
          cf apps | grep nhvr
```

---

## 8. Troubleshooting

### 8.1 Stuck MTA Operations

If a deployment fails partway through, subsequent deployments may fail with an error like "MTA operation in progress."

**List active MTA operations:**

```bash
cf mta-ops
```

**Abort a stuck operation:**

```bash
cf mta-ops
# Note the operation ID from the output
cf deploy -i <operation-id> -a abort
```

Then retry the deployment.

### 8.2 HANA Cloud Stopped

**Symptom:** Deployment fails with errors related to HANA connectivity, or the application returns 500 errors.

**Fix:**

```bash
# Check HANA status
cf service Hanaclouddb

# If stopped, start it
cf update-service Hanaclouddb -c '{"data": {"serviceStopped": false}}'

# Wait 2-5 minutes, then verify
cf service Hanaclouddb
```

After HANA is running, redeploy or restart the affected apps:

```bash
cf restart nhvr-bridge-srv
```

### 8.3 Version Conflicts During Deploy

**Symptom:** Deployment fails with "version rule violation."

**Fix:** Always use the `--version-rule ALL` flag:

```bash
cf deploy mta_archives/nhvr-bridge-app_4.7.4.mtar --version-rule ALL -f
```

### 8.4 XSUAA Scope/Role Errors

**Symptom:** Users get 403 Forbidden after login.

**Checklist:**

1. Verify the user is assigned to the correct role collection in BTP Cockpit > Security > Role Collections.
2. Verify the role collection references the correct role template.
3. After changing role assignments, the user must log out and log back in (or wait for token expiry -- default 3600 seconds).
4. Check `xs-security.json` has the correct `xsappname` for your environment.

### 8.5 App Router Returns 502 Bad Gateway

**Symptom:** The frontend loads but API calls fail with 502.

**Checklist:**

1. Verify `nhvr-bridge-srv` is in `started` state: `cf apps`.
2. Check srv logs: `cf logs nhvr-bridge-srv --recent`.
3. Verify the `srv-api` destination is correctly bound: `cf env nhvr-bridge-app-router` and look for the `destinations` section.

### 8.6 HDI Deployer Fails

**Symptom:** `nhvr-bridge-db-deployer` crashes during deployment.

**Checklist:**

1. Ensure HANA Cloud is running (see 8.2).
2. Check deployer logs: `cf logs nhvr-bridge-db-deployer --recent`.
3. Common cause: CDS model compilation errors. Run `cds build --production` locally and fix any errors before deploying.

### 8.7 Out of Memory

**Symptom:** App crashes with `OOME` or `ERR_WORKER_OUT_OF_MEMORY`.

The default memory allocations are:

| Module | Memory |
|--------|--------|
| nhvr-bridge-srv | 512 MB |
| nhvr-bridge-app-router | 256 MB |
| nhvr-bridge-db-deployer | 256 MB |

To increase, edit the `memory` parameter in `mta.yaml` for the affected module and redeploy. Ensure your Cloud Foundry org has sufficient memory quota.

### 8.8 Clearing the MTA Deployment Completely

If you need to start fresh (removes all apps and service bindings, but not service instances):

```bash
cf undeploy nhvr-bridge-app --delete-services -f
```

**Warning:** The `--delete-services` flag will delete the HANA HDI container and all data. Omit this flag to keep service instances.

---

## 9. Environment Variables and Secrets

### 9.1 Application Environment Variables

These are set automatically via `mta.yaml` properties:

| Variable | Module | Value | Purpose |
|----------|--------|-------|---------|
| `NODE_ENV` | nhvr-bridge-srv | `production` | Enables production mode for CAP |
| `INCOMING_CONNECTION_TIMEOUT` | nhvr-bridge-app-router | `60000` | Request timeout in ms |
| `SESSION_TIMEOUT` | nhvr-bridge-app-router | `15` | Session timeout in minutes |

### 9.2 Service Binding Environment Variables

These are injected automatically when services are bound to applications. You do not set them manually. They are accessible via `cf env <app-name>` under `VCAP_SERVICES`:

- **nhvr-db** (HANA HDI): Database host, port, user, password, schema
- **nhvr-xsuaa**: OAuth client ID, client secret, token endpoint, verification key
- **nhvr-destination**: Destination service credentials
- **nhvr-logging**: Logging service credentials

### 9.3 CI/CD Secrets (GitHub Actions)

| Secret | Required By | Example Value |
|--------|-------------|---------------|
| `CF_API` | All workflows | `https://api.cf.us10-001.hana.ondemand.com` |
| `CF_USERNAME` | All workflows | `admin@company.com` |
| `CF_PASSWORD` | All workflows | (platform user password) |
| `CF_ORG` | All workflows | `nhvr-org` |
| `CF_SPACE` | All workflows | `prod` |

### 9.4 XSUAA Configuration Reference

Key values from `xs-security.json`:

| Parameter | Value | Notes |
|-----------|-------|-------|
| `xsappname` | `nhvr-bridge-app-<subdomain>` | Must be unique per subaccount |
| `tenant-mode` | `dedicated` | Single-tenant deployment |
| `token-validity` | `3600` | Access token lifetime in seconds (1 hour) |
| `refresh-token-validity` | `86400` | Refresh token lifetime in seconds (24 hours) |

### 9.5 Custom Attributes

The XSUAA configuration defines two custom attributes:

| Attribute | Type | Purpose |
|-----------|------|---------|
| `Groups` | string | AD/IdP group membership for group-to-role-collection mapping |
| `tenantCode` | string | Multi-tenant identifier resolved from XSUAA custom attribute or X-Tenant-Code header |

---

## Appendix: Deployed Module Summary

| Module | Type | Memory | Disk | Runs Continuously |
|--------|------|--------|------|-------------------|
| nhvr-bridge-srv | Node.js (CAP backend) | 512 MB | 1 GB | Yes |
| nhvr-bridge-app-router | Node.js (approuter) | 256 MB | 512 MB | Yes |
| nhvr-bridge-db-deployer | Node.js (HDB deployer) | 256 MB | default | No (stops after schema deploy) |

## Appendix: Service Instance Summary

| Resource Name | Service | Plan | Used By |
|---------------|---------|------|---------|
| nhvr-db | hana | hdi-shared | nhvr-bridge-srv, nhvr-bridge-db-deployer |
| nhvr-xsuaa | xsuaa | application | nhvr-bridge-srv, nhvr-bridge-app-router |
| nhvr-destination | destination | lite | nhvr-bridge-app-router |
| nhvr-logging | application-logs | lite | nhvr-bridge-srv |

# NHVR Bridge App — BTP Trial Deployment Guide

> **For non-developers.** This guide walks you through every step to deploy the NHVR Bridge Management app to SAP BTP Trial (free) so anyone with a link can use it.

---

## What you'll need (one-time setup)

| Tool | What it is | Install command |
|------|-----------|-----------------|
| Node.js 18+ | Already installed (you're running the app) | — |
| CF CLI | The tool to deploy to BTP | See Step 1 |
| MBT (SAP Build Tool) | Packages your app for deployment | `npm install -g mbt` |
| SAP BTP Trial account | Free forever | See Step 2 |

---

## Step 1 — Install the Cloud Foundry CLI

1. Go to: https://github.com/cloudfoundry/cli/releases/latest
2. Download the macOS installer (`.pkg` file)
3. Double-click to install
4. Open a new Terminal and verify: `cf version`
   You should see something like `cf version 8.x.x`

---

## Step 2 — Create your SAP BTP Trial Account (free)

1. Go to: https://www.sap.com/products/technology-platform/trial.html
2. Click **"Start your free trial"**
3. Register with your email address
4. After registration, you'll receive an email — click the activation link
5. Log in at: https://cockpit.btp.cloud.sap
6. You'll land in your **BTP Cockpit** — this is your control panel

---

## Step 3 — Set up your BTP Trial Space

In the BTP Cockpit:
1. Click **"Go to Your Trial Account"**
2. Click on your **Subaccount** (usually called "trial")
3. Click **"Cloud Foundry"** in the left menu → **"Enable Cloud Foundry"** if not already done
4. Note down:
   - **API Endpoint**: something like `https://api.cf.us10-001.hana.ondemand.com`
   - **Org name**: usually `<your-email>trial`
   - **Space name**: `dev`

---

## Step 4 — Log in to Cloud Foundry from Terminal

Open Terminal in your project folder (`/Users/siddharthaampolu/21 NHVR APP`) and run:

```bash
cf login -a https://api.cf.us10-001.hana.ondemand.com
```

> Replace the URL with your actual API endpoint from Step 3.

When prompted:
- **Email**: your BTP trial email
- **Password**: your BTP trial password
- **Org**: press Enter to select the default
- **Space**: press Enter to select `dev`

Verify login: `cf target` — you should see your org and space.

---

## Step 5 — Enable Required BTP Services

In the BTP Cockpit → your Subaccount → **"Service Marketplace"**, enable these services (click each, then "Create"):

1. **SAP HANA Cloud** (for the database)
   - Plan: `hana` (free tier)
   - Instance name: `nhvr-hana`

2. **SAP HANA Schemas & HDI Containers**
   - Plan: `hdi-shared`
   - Instance name: `nhvr-hdi`

3. **Authorization & Trust Management (XSUAA)**
   - Plan: `application`
   - Instance name: `nhvr-xsuaa`

4. **SAP HTML5 Application Repository**
   - Plan: `app-host`
   - Instance name: `nhvr-html5`

> **Tip**: If you can't find a service, use the search box in the Service Marketplace.

---

## Step 6 — Create SAP HANA Cloud Instance

1. In BTP Cockpit → **"SAP HANA Cloud"** → **"Create"**
2. Choose **"SAP HANA Cloud, SAP HANA Database"**
3. Set:
   - **Instance Name**: `nhvr-hana`
   - **Administrator Password**: choose a strong password
   - **Size**: minimum (1 vCPU, 32 GB) — sufficient for trial
4. Click **"Create"** — this takes 5–10 minutes
5. Once created, go to **"SAP HANA Cloud Central"** → Actions → **"Allow All IP Addresses"** (needed for deployment)

---

## Step 7 — Build the Application Package

In Terminal, in your project folder:

```bash
# Install dependencies if not already done
npm install

# Build the deployment package
mbt build -t ./
```

This creates a file called `nhvr-bridge-app_1.0.0.mtar` in your project folder.
This is the complete package ready to deploy.

---

## Step 8 — Deploy to BTP

```bash
cf deploy nhvr-bridge-app_1.0.0.mtar
```

This command:
- Uploads all your app files
- Creates the database schema in HANA Cloud
- Loads the sample data (all 12 bridges, restrictions, etc.)
- Starts the backend service
- Publishes the web app

The deployment takes **5–15 minutes**. You'll see progress in the terminal.

When done, you'll see:
```
Application "nhvr-bridge-management" started and available at:
https://nhvr-bridge-management-<random>.cfapps.us10-001.hana.ondemand.com
```

---

## Step 9 — Access Your Live App

Copy the URL shown at the end of deployment and open it in a browser.

You'll see the NHVR Bridge Management home screen — running live on the internet!

**Default login credentials** (configured in `xs-security.json`):
| Username | Password | Role |
|----------|----------|------|
| admin | (set during XSUAA setup) | Full admin access |

> **Note**: On BTP, authentication uses XSUAA (SAP's identity service). You'll be redirected to an SAP login page.

---

## Sharing the App

Once deployed, share the URL with your team. Anyone with the URL can access it — you control who can log in via the BTP Cockpit under:
**Subaccount → Security → Role Collections**

Assign these role collections to users:
- `NHVR_Admin` — full access
- `NHVR_BridgeManager` — manage bridges and restrictions
- `NHVR_Viewer` — read-only access

---

## Updating the App After Changes

After making changes to the code:

```bash
# Rebuild
mbt build -t ./

# Redeploy (updates the existing deployment)
cf deploy nhvr-bridge-app_1.0.0.mtar
```

---

## Quick Reference — Common Commands

```bash
# Check deployment status
cf apps

# View logs if something goes wrong
cf logs nhvr-bridge-management --recent

# Restart the app
cf restart nhvr-bridge-management

# Check service status
cf services
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `cf: command not found` | Restart Terminal after installing CF CLI |
| `mbt: command not found` | Run `npm install -g mbt` again |
| Deployment fails with "quota exceeded" | Free tier has resource limits; delete unused apps in BTP Cockpit |
| App starts but shows error page | Run `cf logs nhvr-bridge-management --recent` to see the error |
| HANA connection fails | Check "Allow All IP Addresses" is set in HANA Cloud Central |
| Login loop on the app | Check XSUAA configuration in BTP Cockpit |

---

## Local Development (quick reminder)

To run locally while developing:
```bash
npm install
npm run watch
# Opens at http://localhost:4004
# Login: admin/admin
```

---

*Last updated: March 2026*

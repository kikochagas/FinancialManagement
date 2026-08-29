# FinancialManagement Deployment Guide

This document outlines how to deploy FinancialManagement to a production environment. 

## Architecture
FinancialManagement operates seamlessly in two environments:
*   **Local:** Uses a standard local SQLite database (`dev.db`). No configuration is required.
*   **Hosted (Production):** Uses Render (for the Next.js web service) and Turso (for the libSQL remote database).

The application automatically selects the Turso `libSQL` adapter if the appropriate Turso credentials are provided. If they are absent, the application safely prevents accidental local SQLite usage in production (identifying Render via `RENDER` environment).

> [!WARNING]
> Do NOT upload your personal `dev.db` to production. Start fresh.
> NEVER commit `.env`, `.env.local` or PEM files.

## Required Environment Variables
Configure the following variables in your Render Web Service dashboard:

### Database (Turso)
Both variables must be configured together:
*   `TURSO_DATABASE_URL` (e.g., `libsql://financial-management-xxx.turso.io`)
*   `TURSO_AUTH_TOKEN` (The corresponding secure access token)

You must also set the following variable for Prisma tooling compatibility:
*   `DATABASE_URL` (Set to `file:./unused.db`)
    *   *Note:* This is ONLY a Prisma schema placeholder required in the hosted environment. It is NOT the production/runtime database. The actual hosted runtime database is Turso when `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are configured. The Render safety guard prevents the application from silently falling back to local SQLite if Turso credentials are missing, and `unused.db` does not contain any application data.

### Authentication
*   `JWT_SECRET`: A secure random string (e.g., generated via `openssl rand -base64 32`). This is strictly required in production runtime; the server will throw an error if missing.

### Enable Banking
*   `ENABLE_BANKING_APPLICATION_ID`: Your unique Application ID.
*   `ENABLE_BANKING_PRIVATE_KEY`: Your multiline PEM private key string.
    *   *Note for Render:* You can paste the PEM contents directly into the value field, or escape newlines as `\n`.
    *   *Note:* Never commit this key to Git.

### Optional: OpenAI Integration
*   `OPENAI_API_KEY`: Your OpenAI API key.
*   `OPENAI_MODEL`: (e.g., `gpt-4o-2024-08-06`).
    *   *Note:* These variables are completely optional. They enable AI-assisted column mapping during Bank Statement Imports. If absent, the importer simply falls back to manual mapping without errors.

### Hosting
*   `APP_URL`: The public URL assigned to you by Render (e.g., `https://financial-management-xxxx.onrender.com`). This is required in production so Open Banking providers know where to correctly send callbacks without generating a local localhost callback.

## Turso Database Schema Bootstrap
Because the project heavily utilizes Prisma but does not use standard migration files, initializing the Turso production database requires pushing the schema directly. 

Prisma's standard `db push` is not supported for remote Turso databases using the standard flow. You must bootstrap the empty remote database using a generated SQL file.

*Note: The project uses Prisma 5.22, where the `driverAdapters` preview feature is enabled to support libSQL via Turso.*

**From your local terminal:**
1. Generate the initialization SQL schema from your current `schema.prisma`:
   ```bash
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > bootstrap.sql
   ```
2. Apply the schema directly to your Turso database using the official Turso CLI:
   ```bash
   turso db shell your-turso-database-name < bootstrap.sql
   ```

*Your remote database is now structurally ready.*

## Deploying to Render
1. Connect your Render account to your Git repository.
2. Create a new **Web Service**.
3. Set the **Build Command** to:
   ```bash
   npm ci && npx prisma generate && npm run build
   ```
4. Set the **Start Command** to:
   ```bash
   npm start
   ```
5. Enter all the required environment variables listed above. 
6. Click **Deploy**.


## Fresh Deployments vs Legacy Migration

**Fresh Turso deployment:**
- The schema is created fresh from the current Prisma schema.
- New users receive the current Categories automatically.
- The backfill-existing-users.ts script is **NOT** run.

**Legacy Migration (scripts/backfill-existing-users.ts):**
- This script is strictly a one-off utility for migrating *old, pre-refactor local SQLite databases* to the modern transaction domain. It contains an environmental safety guard preventing execution against Turso.

## Populating Production Data
Once deployed, **do not upload your personal `dev.db`**.
Instead:
1. Create a fresh test account normally through the application's register/login screen.
2. (Optional) Go to **Settings > Reset Demo Data** to populate the canonical default categories (e.g., Salary, Transfer) safely. 
3. (Optional) Use the standard **Reports > Import** interface to restore any dummy data from a V2 exported spreadsheet.

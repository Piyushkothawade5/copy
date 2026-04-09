# Shubhada Production Phase 3

Phase 3 replaces Google Sheets and Apps Script with Supabase so the app can support:

- employee ID + PIN login backed by Supabase Auth
- live KPI dashboard with weighted monthly OEE
- separate analysis workspace with trend and Pareto views
- admin management for masters, employees, report recipients, and report runs
- daily and monthly management report delivery via Edge Functions

## Frontend Setup

1. Create a `.env` file from `.env.example`.
2. Add:
   - `REACT_APP_SUPABASE_URL`
   - `REACT_APP_SUPABASE_ANON_KEY`
3. Install dependencies:
   - `npm install`
4. Start locally:
   - `npm start`

## Supabase Setup

1. Create a Supabase project.
2. Run the SQL migration:
   - `supabase db push`
   - or paste `supabase/migrations/20260407_phase3.sql` into the SQL editor
3. Deploy Edge Functions:
   - `supabase functions deploy employee-admin`
   - `supabase functions deploy management-report`
4. Add function secrets:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `REPORT_FROM_EMAIL`
   - `APP_DASHBOARD_URL`
5. Seed active employees and master data before go-live.

## Reporting Schedule

- Daily report: `07:15 Asia/Kolkata`
- Monthly report: `08:00 Asia/Kolkata` on the 1st

Use `supabase/cron/setup_management_reports.sql` after replacing:

- `YOUR_PROJECT_REF`
- `YOUR_SERVICE_ROLE_KEY`

You can also create the same schedules from the Supabase Cron dashboard UI.

## Data Model Highlights

- `production_date` is stored separately from `created_at`
- OEE, good quantity, and downtime are recomputed in PostgreSQL triggers
- dashboard and analysis screens call SQL RPCs instead of aggregating large datasets in the browser
- report attempts are logged in `report_runs`

## Go-Live Notes

- This phase assumes a fresh production-entry start in Supabase
- only active users and current master lists should be seeded before launch
- for testing email delivery, Resend's onboarding sender can be used first and swapped later to your company domain

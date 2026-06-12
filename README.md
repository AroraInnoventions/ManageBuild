# Manage Build

Manage Build is a Vercel-ready PWA for managing build projects through a Kanban process:

1. Requirements
2. Design
3. Develop
4. Test
5. Accept

The first implementation includes a responsive Kanban board, local sample data mode, Supabase client wiring, and a Supabase migration with row-level security for project-scoped access.

Requirements can depend on other requirements. The schema stores task dependencies separately so one requirement can block one or many downstream cards without duplicating status data.

## Roles

Lane roles match the board lanes for now. A user can hold more than one lane role on a project:

- `requirements`
- `design`
- `develop`
- `test`
- `accept`

Administrative roles are modeled separately:

- `superadmin`: global access, intended for the owner.
- `customer_admin`: admin access across a customer's projects.
- `project_admin`: admin access for one project.
- `member`: project member with lane-based task access.

Users only see projects they are assigned to, unless they are a superadmin or customer admin for the owning customer.

## Local Development

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

Without Supabase environment variables, the app runs in local demo mode with sample projects and work items.

## Supabase Setup

Create a Supabase project, then run:

```bash
supabase db push
```

Or copy the SQL from:

```text
supabase/migrations/202606120001_initial_manage_build.sql
```

Add these variables in `.env.local` and in Vercel:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Vercel

The app uses Vite. Vercel should detect the settings from `vercel.json`:

- Build command: `npm run build`
- Output directory: `dist`

See `docs/deployment.md` for the Supabase and Vercel cloud setup checklist.

## Next Product Slices

- Replace sample data reads/writes with Supabase queries.
- Add Supabase Auth login and invite flows.
- Add project/customer admin screens.
- Add drag-and-drop card movement with lane-role enforcement.
- Add dependency graph and critical-path reporting.
- Add sprint/cadence reporting for throughput, cycle time, impediment aging, and acceptance rate.

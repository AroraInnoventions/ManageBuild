# Deployment

## Supabase

1. Create a Supabase project.
2. Link this repo to the project:

```bash
supabase login
supabase link --project-ref your-project-ref
```

3. Push the database schema:

```bash
supabase db push
```

The migration creates `corp_`-prefixed database objects to keep this app isolated inside a shared database.

4. In Supabase, copy:

- Project URL
- Anon public key

## Vercel

1. Import `AroraInnoventions/ManageBuild` in Vercel.
2. Use the detected Vite settings, or set:

```text
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

3. Add these environment variables:

```text
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

4. Deploy.

## Supabase Auth Redirects

After Vercel deploys, add the production URL in Supabase Auth settings:

```text
Site URL: https://your-vercel-app.vercel.app
Redirect URL: https://your-vercel-app.vercel.app
```

Keep local redirects for development:

```text
http://localhost:5173
http://127.0.0.1:5173
http://127.0.0.1:4174
```

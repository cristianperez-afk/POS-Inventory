# Bukolabs POS Setup

For the merged POS + Inventory architecture, see [../ARCHITECTURE.md](../ARCHITECTURE.md).

## 1. Install dependencies

```bash
npm install
npm --prefix frontend install
npm --prefix backend install
```

## 2. Create environment files

Copy the examples:

```bash
copy frontend\.env.example frontend\.env
copy backend\.env.example backend\.env
```

Edit `backend/.env` and put the real PostgreSQL connection string in `DATABASE_URL`.

For Supabase, use the pooler URLs:

```env
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@<pooler-host>:6543/postgres?sslmode=no-verify"
DIRECT_URL="postgresql://postgres.<project-ref>:<password>@<pooler-host>:5432/postgres?sslmode=no-verify"
```

`DATABASE_URL` is for app traffic and uses Supabase's transaction pooler. `DIRECT_URL` is for Prisma migrations and uses Supabase's session pooler. Do not use `db.<project-ref>.supabase.co:5432` on Render unless the Supabase project has IPv4/direct connectivity enabled.

## 3. Prepare the database

Run the SQL in:

```txt
backend/sql/store-information.sql
```

Merge the old Inventory database into the POS database once:

```bash
npm --prefix backend run db:merge-inventory
```

After that, sync the Inventory catalog into the POS compatibility tables whenever catalog data changes:

```bash
npm --prefix backend run db:sync-inventory-catalog
```

If imported data has duplicate id errors, run:

```bash
npm run db:fix-sequences
```

## 4. Start the system

```bash
npm run dev
```

Frontend: `http://localhost:3003`

Backend: `http://localhost:3000`

## Failed To Fetch

If login says `Failed to fetch`, the frontend cannot reach the backend. Check:

- Backend is running on `http://localhost:3000`
- `frontend/.env` has `VITE_API_BASE_URL=http://localhost:3000`
- `backend/.env` exists and has a valid `DATABASE_URL`
- Supabase allows the connection and the password is URL-encoded

## Render Deploy With Supabase

Use these Render backend environment variables:

```env
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<pooler-host>:6543/postgres?sslmode=no-verify
DIRECT_URL=postgresql://postgres.<project-ref>:<password>@<pooler-host>:5432/postgres?sslmode=no-verify
```

Keep the backend build command:

```bash
npm install && npm run db:deploy
```

If Render fails with `P1001` against `db.<project-ref>.supabase.co:5432`, `DIRECT_URL` is using Supabase's direct IPv6 host. Replace it with the session pooler URL above, or enable Supabase's IPv4 add-on.

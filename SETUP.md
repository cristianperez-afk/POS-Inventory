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

Frontend: `http://localhost:5173`

Backend: `http://localhost:3000`

## Failed To Fetch

If login says `Failed to fetch`, the frontend cannot reach the backend. Check:

- Backend is running on `http://localhost:3000`
- `frontend/.env` has `VITE_API_BASE_URL=http://localhost:3000`
- `backend/.env` exists and has a valid `DATABASE_URL`
- Supabase allows the connection and the password is URL-encoded

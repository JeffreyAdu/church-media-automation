# Database Migrations

Database schema is managed via Supabase CLI migrations, NOT runtime app code.

## Setup (One-time)

```bash
# Authenticate
npx supabase login

# Link to your project
npx supabase link --project-ref csknertwwfbayfzotsva
```

## Creating Schema Changes

```bash
# Create a new migration
npx supabase migration new <descriptive_name>

# Edit the generated file in supabase/migrations/
# Then push to production:
npx supabase db push
```

## Current Schema

Your current production schema was created manually. Going forward:
- **Never** run DDL from app code
- All schema changes = migrations
- Keep `projectschema/v1.sql` as reference, but migrations are source of truth

## Why Migrations?

1. **Version control** - Track all schema changes in git
2. **Rollback support** - Supabase tracks applied migrations
3. **No race conditions** - Multiple app instances can't conflict
4. **Least privilege** - App doesn't need DDL permissions
5. **Team collaboration** - Everyone sees schema evolution

## Production Deployment

```bash
# Review pending migrations
npx supabase db push --dry-run

# Apply to production
npx supabase db push
```

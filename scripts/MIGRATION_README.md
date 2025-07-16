# Data Migration Guide: Supabase to Render

This guide explains how to migrate your data from Supabase to Render's PostgreSQL database.

## Prerequisites

1. Your Render database must be set up and migrations must be applied
2. You need the DATABASE_URL from your Render dashboard

## Migration Steps

### Option 1: Run Locally (Recommended)

1. **Get your Render DATABASE_URL**
   - Go to your Render dashboard
   - Click on your PostgreSQL database
   - Copy the "External Database URL"

2. **Run the migration script**
   ```bash
   # Set the target database URL (your Render database)
   export TARGET_DATABASE_URL="postgresql://your-render-database-url-here"
   
   # Run the migration
   npm run migrate-data
   ```

3. **Verify the migration**
   - Check the console output for the migration summary
   - Log into your Render app and verify the data is present

### Option 2: Run on Render (One-time job)

1. **Create a one-time job on Render**
   - Go to your Render dashboard
   - Create a new "Job" service
   - Use the same repo and branch
   - Set the build command: `npm install && npx prisma generate`
   - Set the start command: `npm run migrate-data`
   - Add environment variables:
     - `SOURCE_DATABASE_URL`: Your Supabase URL (already in the script)
     - `DATABASE_URL`: Will be automatically set by Render

2. **Run the job manually**
   - Click "Manual Deploy" to run the migration

## What Gets Migrated

The script migrates the following data in order:
1. Categories
2. Referral Sources
3. Campaigns
4. Campaign-to-ReferralSource relationships
5. Interactions

## Important Notes

- The script uses `skipDuplicates` to avoid conflicts
- IDs are preserved from the source database
- Relationships are maintained
- The script is idempotent (safe to run multiple times)

## Troubleshooting

### Connection Issues
- Ensure your Supabase database allows connections from your IP
- Ensure your Render database URL is correct
- Check that both databases are accessible

### Data Conflicts
- The script skips duplicates automatically
- If you need to overwrite data, you'll need to clear the target database first

### Missing Data
- Check the console output for any errors
- Verify that the source database has the data you expect
- Ensure all Prisma migrations have been applied to the target database 
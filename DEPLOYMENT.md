# Deploying Referral Genie to Render

## Prerequisites

1. A [Render account](https://render.com)
2. Your code pushed to a GitHub repository
3. HumbleFax API credentials

## Deployment Steps

### 1. Push Your Code to GitHub

First, commit and push your code to GitHub:

```bash
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

### 2. Deploy on Render

1. Log in to your [Render Dashboard](https://dashboard.render.com)
2. Click "New +" and select "Blueprint"
3. Connect your GitHub repository
4. Render will automatically detect the `render.yaml` file and create:
   - A PostgreSQL database
   - A web service for your Next.js app

### 3. Configure Environment Variables

After deployment, go to your web service settings and add these environment variables:

1. `HUMBLE_FAX_API_KEY` - Your HumbleFax API key
2. `HUMBLE_FAX_API_SECRET` - Your HumbleFax API secret
3. `HUMBLE_FAX_WEBHOOK_URL` - Set this to `https://your-app-name.onrender.com/api/campaigns/fax-webhook` (replace `your-app-name` with your actual Render app name)
4. `AUTH_USERNAME` and `AUTH_PASSWORD` - Required. The app no longer has a built-in login. Requests fail closed until both are set.
5. `GOOGLE_PLACES_API_KEY` - Required for county Places matching and the non-NPI search page.
6. `NEXTAUTH_URL` - The public Render URL, for example `https://your-app-name.onrender.com`
7. Research (Bite 5). Prefer `XAI_API_KEY` or `GROK_API_KEY` for Grok. Optional `XAI_MODEL` or `GROK_MODEL` (default `grok-4`) and `XAI_BASE_URL` (default `https://api.x.ai/v1`). If those keys are unset, set all three of `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_BASE_URL`, and `OPENAI_COMPAT_MODEL`. Research reads public practice websites only. It does not run without one of those key setups.

Market setup is documented in `docs/market-setup.md`. The Lenoir County, NC ZIP list used by the NPI pull is in `docs/kinston-pilot.md`.

### 4. File Uploads Configuration

Since Render's filesystem is ephemeral, uploaded files will be lost on redeploy. For production, you should:

1. **Option 1: Use a cloud storage service** (Recommended)
   - Set up AWS S3, Cloudinary, or similar
   - Update the upload logic in `/api/upload/route.ts`

2. **Option 2: Use Render Disks** (Persistent storage)
   - Add a disk to your service in Render
   - Mount it at `/var/data/uploads`
   - Update your upload path in the code

### 5. Custom Domain (Optional)

1. Go to your web service settings
2. Add your custom domain
3. Configure your DNS as instructed by Render

## Post-Deployment

1. Run database migrations (should happen automatically via build command)
2. Test the application
3. Update HumbleFax webhook URL in their dashboard to point to your Render URL

## Monitoring

- Check the Logs tab in Render for any errors
- Set up health checks in Render settings
- Consider adding error tracking (Sentry, etc.)

## Troubleshooting

### Database Connection Issues
- Ensure DATABASE_URL is properly set
- Check if migrations ran successfully

### Build Failures
- Check Node version compatibility
- Ensure all dependencies are in package.json
- Check build logs for specific errors

### File Upload Issues
- Remember that Render's filesystem is ephemeral
- Implement cloud storage for production use 
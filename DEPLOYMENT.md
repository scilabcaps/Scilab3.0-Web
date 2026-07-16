# Deployment Guide - Scilab 3.0

## Prerequisites
- GitHub account
- Supabase project with credentials
- Netlify account (free tier)

## Step 1: Prepare Your Repository

1. **Initialize Git repository** (if not already done):
```bash
git init
git add .
git commit -m "Initial commit"
```

2. **Create GitHub repository**:
   - Go to GitHub and create a new repository
   - Push your code:
```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

## Step 2: Set Up Environment Variables

### Local Development
Your `.env` file should contain:
```
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM_NAME=Scilab3.0
SMTP_FROM_ADDRESS=your_email@gmail.com
```

### Netlify Deployment
1. Go to Netlify dashboard → Your site → Site settings → Environment variables
2. Add these variables:
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_ANON_KEY` - Your Supabase anon key
   - `SMTP_HOST` - SMTP server host
   - `SMTP_PORT` - SMTP port
   - `SMTP_SECURE` - true/false for SSL
   - `SMTP_USER` - SMTP username
   - `SMTP_PASS` - SMTP password
   - `SMTP_FROM_NAME` - Sender name
   - `SMTP_FROM_ADDRESS` - Sender email

## Step 3: Deploy to Netlify

### Option A: Git Integration (Recommended)
1. Log in to Netlify
2. Click "Add new site" → "Import an existing project"
3. Connect to GitHub
4. Select your repository
5. Configure build settings:
   - Build command: (leave empty)
   - Publish directory: `web` (or `.` if deploying from web folder)
6. Click "Deploy site"

### Option B: Drag and Drop
1. Log in to Netlify
2. Click "Add new site" → "Deploy manually"
3. Drag and drop your `web` folder
4. After deployment, go to Site settings → Environment variables and add your credentials

## Step 4: Configure Netlify

The `netlify.toml` file includes:
- Security headers
- SPA routing (all routes redirect to index.html)

## Step 5: Test Deployment

1. Visit your Netlify URL
2. Test login functionality
3. Check browser console for any errors
4. Verify Supabase connection

## Troubleshooting

**Supabase connection fails:**
- Check environment variables are set correctly in Netlify
- Verify Supabase URL and anon key are valid
- Check browser console for specific error messages

**Blank page or routing issues:**
- Ensure `netlify.toml` is in the web folder
- Check that all file paths are relative
- Verify the publish directory is correct

**Environment variables not loading:**
- For local: Ensure `.env` file exists and is properly formatted
- For Netlify: Check environment variables in site settings
- Clear browser cache and redeploy

## Alternative: Vercel Deployment

If you prefer Vercel:

1. Install Vercel CLI: `npm i -g vercel`
2. Run: `vercel` in the web directory
3. Follow prompts
4. Set environment variables in Vercel dashboard
5. Deploy: `vercel --prod`

## Security Notes

- Never commit `.env` file to version control
- Use Supabase Row Level Security (RLS) policies
- Rotate API keys if compromised
- Use HTTPS (automatic on Netlify/Vercel)

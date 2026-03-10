# 🔧 Vercel Deployment Troubleshooting

## Current Issue: 500 INTERNAL_SERVER_ERROR

The build is completing successfully, but the function is crashing at runtime. Let's debug step by step.

## 🧪 Step 1: Test Basic Functionality

First, let's test if Vercel can run a simple function:

```bash
# Test the basic Vercel deployment
curl https://your-vercel-url.vercel.app/test
```

**Expected Response:**
```json
{
  "message": "Vercel deployment working!",
  "timestamp": "2024-01-30T...",
  "env": {
    "NODE_ENV": "production",
    "hasApiKey": true/false,
    "hasFirebaseProject": true/false,
    "hasServiceAccount": true/false
  }
}
```

If this works, Vercel is functioning. If not, there's a basic deployment issue.

## 🔍 Step 2: Check Environment Variables

In your Vercel dashboard (vercel.com), go to your project → Settings → Environment Variables

**Required Variables:**
- `API_KEY` - Your secure API key
- `FIREBASE_PROJECT_ID` - Should be `wildlifetracker-4d28b`
- `ALLOWED_ORIGINS` - Your app URLs (comma-separated)
- `FIREBASE_SERVICE_ACCOUNT_KEY` - Your entire service account JSON

## 🔑 Step 3: Firebase Service Account Setup

### Option A: Environment Variable (Recommended)
1. Open your `firebase-service-account.json` file
2. Copy the entire JSON content
3. Paste it as the value for `FIREBASE_SERVICE_ACCOUNT_KEY` in Vercel

### Option B: Include in Deployment
If you want to include the file in your deployment:
1. Remove `firebase-service-account.json` from `.gitignore`
2. Make sure it's in your `backend/` directory
3. Redeploy

## 🧪 Step 4: Test Health Check

```bash
curl https://your-vercel-url.vercel.app/health
```

**Expected Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-30T..."
}
```

## 🧪 Step 5: Test API with Authentication

```bash
curl -H "x-api-key: YOUR_API_KEY" \
  https://your-vercel-url.vercel.app/api/observations
```

## 🔧 Common Issues & Fixes

### Issue: "Firebase service account key not found"
**Fix:** Set the `FIREBASE_SERVICE_ACCOUNT_KEY` environment variable in Vercel

### Issue: "Firebase project not configured"
**Fix:** Set `FIREBASE_PROJECT_ID=wildlifetracker-4d28b` in Vercel

### Issue: "API key required"
**Fix:** Include `x-api-key` header in your requests

### Issue: CORS errors
**Fix:** Add your app's URL to `ALLOWED_ORIGINS` in Vercel

### Issue: Build succeeds but runtime fails
**Fix:** Check Vercel function logs in the dashboard for detailed error messages

## 📊 Checking Vercel Logs

1. Go to vercel.com → Your project → Functions tab
2. Click on the function that failed
3. Check the "Logs" section for detailed error messages

## 🆘 Still Having Issues?

1. **Redeploy** after setting environment variables
2. **Check the test endpoint** first: `/test`
3. **Use the health check**: `/health`
4. **Check Vercel function logs** for stack traces

## 🚀 Quick Redeploy

```bash
cd backend
vercel --prod
```

Or push to your GitHub repo to trigger automatic deployment.

## 📞 Need Help?

If you're still getting errors, share:
1. The exact error message from Vercel logs
2. Your `/test` endpoint response
3. Your environment variable configuration (without sensitive values)
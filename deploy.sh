#!/bin/bash

# Wildlife Tracker API Deployment Script
# This script helps deploy the API to Vercel

echo "🚀 Wildlife Tracker API Deployment"
echo "=================================="

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Check if we're in the backend directory
if [ ! -f "server.js" ]; then
    echo "❌ Please run this script from the backend directory"
    echo "   cd backend && ./deploy.sh"
    exit 1
fi

# Check if Firebase service account key exists
if [ ! -f "firebase-service-account.json" ]; then
    echo "❌ firebase-service-account.json not found!"
    echo "   Please download your Firebase service account key and place it here."
    echo "   Firebase Console → Project Settings → Service Accounts → Generate new private key"
    exit 1
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Creating from template..."
    cp .env.example .env
    echo "   Please edit .env with your configuration before deploying."
    exit 1
fi

echo "✅ Prerequisites check passed"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Deploy to Vercel
echo "🚀 Deploying to Vercel..."
vercel --prod

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Go to your Vercel dashboard"
echo "2. Set these environment variables:"
echo "   - API_KEY: your-secure-api-key-here"
echo "   - FIREBASE_PROJECT_ID: wildlifetracker-4d28b"
echo "   - ALLOWED_ORIGINS: your-app-urls"
echo "3. Copy firebase-service-account.json content to FIREBASE_SERVICE_ACCOUNT_KEY"
echo ""
echo "Your API will be available at the URL shown above."
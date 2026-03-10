# Wildlife Tracker Backend API

A secure Node.js/Express API for the Wildlife Tracker mobile and web applications.

## 🚀 Features

- **Secure Firebase Access**: Server-side Firebase Admin SDK prevents direct client access to secrets
- **RESTful API**: Full CRUD operations for wildlife observations
- **API Key Authentication**: Simple but effective authentication
- **Rate Limiting**: Protection against abuse
- **CORS Support**: Configurable cross-origin resource sharing
- **Batch Operations**: Efficient syncing of multiple observations

## 📋 Prerequisites

- Node.js 16+
- Firebase project with Firestore enabled
- Firebase service account key

## 🛠 Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project → Project Settings → Service Accounts
3. Click "Generate new private key"
4. Download the JSON file and rename it to `firebase-service-account.json`
5. Place it in the `backend/` directory

### 3. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
API_KEY=your-secure-api-key-here
FIREBASE_PROJECT_ID=wildlifetracker-4d28b
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5000
```

### 4. Start Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## 📚 API Endpoints

### Authentication
All endpoints require an `x-api-key` header with your API key.

### Observations

#### GET /api/observations
Get all observations with location data (read-only for map display).

**Response includes:**
- `has_image`: Boolean indicating if observation has an attached image
- `image_filename`: Original filename (for display purposes)
- `poaching_type`: Poaching type for incidents (Carcass, Snare, Poacher)

**Query Parameters:**
- `category`: Filter by category (Sighting, Incident, Maintenance)
- `limit`: Number of results (default: 100)

#### GET /api/observations/:id/image
**Secure image access** - Get image for a specific observation (requires API key).

**Authentication:** Required (x-api-key header)

**Response:** Redirects to signed URL or streams image data

**Security:** Images are stored privately in Firebase Storage and only accessible via this authenticated endpoint.

#### POST /api/observations
Create a new observation with optional image upload.

**Content-Type**: `multipart/form-data` (for images) or `application/json`

**Form Data:**
- `category`: "Sighting", "Incident", or "Maintenance"
- `animal`: Required for sightings
- `incident_type`: Required for incidents
- `poaching_type`: "Carcass", "Snare", or "Poacher" (for poaching incidents)
- `maintenance_type`: Required for maintenance
- `latitude`: GPS latitude
- `longitude`: GPS longitude
- `timestamp`: ISO timestamp
- `user`: User identifier
- `image`: Image file (optional, max 5MB)

**Security:** Images are stored securely in Firebase Storage with no public access.

#### PUT /api/observations/:id
Update an observation.

#### DELETE /api/observations/:id
Delete an observation.

## 🚀 Deployment

### Option 1: Vercel (Recommended - Free & Easy)

#### Step 1: Install Vercel CLI
```bash
npm install -g vercel
```

#### Step 2: Deploy from backend directory
```bash
cd backend
vercel --prod
```

#### Step 3: Set Environment Variables in Vercel Dashboard
Go to your Vercel project dashboard and add these environment variables:
- `API_KEY`: Your secure API key (generate a strong random string)
- `FIREBASE_PROJECT_ID`: `wildlifetracker-4d28b`
- `ALLOWED_ORIGINS`: Your app URLs (e.g., `https://your-app.vercel.app,https://your-web-app.com`)

#### Step 4: Upload Firebase Service Account Key
- Go to Vercel project settings → Environment Variables
- Add `FIREBASE_SERVICE_ACCOUNT_KEY` as a secret
- Paste your entire `firebase-service-account.json` content as the value

### Option 2: Railway (Also Free & Git-based)

#### Step 1: Connect to Railway
1. Go to [Railway.app](https://railway.app)
2. Connect your GitHub account
3. Select your wildlife-tracker repository
4. Set the root directory to `backend/`

#### Step 2: Set Environment Variables
In Railway dashboard:
- `API_KEY`: Your secure API key
- `FIREBASE_PROJECT_ID`: `wildlifetracker-4d28b`
- `ALLOWED_ORIGINS`: Your app URLs
- `FIREBASE_SERVICE_ACCOUNT_KEY`: Your service account JSON content

#### Step 3: Deploy
Railway will automatically deploy when you push to GitHub.

### Option 3: Render (Free tier available)

#### Step 1: Connect Repository
1. Go to [Render.com](https://render.com)
2. Create new Web Service
3. Connect your GitHub repo
4. Set build command: `npm install`
5. Set start command: `npm start`
6. Set root directory to `backend/`

#### Step 2: Set Environment Variables
Add the same environment variables as above.

### Option 4: GitHub Actions + Self-hosting

If you want to self-host, you can use GitHub Actions to deploy to your own server:

```yaml
# .github/workflows/deploy.yml
name: Deploy API
on:
  push:
    branches: [ main ]
    paths: [ 'backend/**' ]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Deploy to server
      run: |
        # Your deployment commands here
        # Example: rsync to your server, docker build, etc.
```

## 🔒 Security Features

- **API Key Authentication**: Required for all requests
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Helmet.js**: Security headers
- **CORS**: Configurable allowed origins
- **Input Validation**: Request body validation
- **Error Handling**: No sensitive information leaked

## 🔧 Troubleshooting

### Image Upload Issues

If poaching types sync but images don't, it's a **Firebase Storage bucket issue**.

#### Quick Fix
Go to [Firebase Console](https://console.firebase.google.com/) → Your Project → **Storage** → **Get started** (if you see this button)

#### Common Issues

**"Images not uploading"**
- Make sure you created a Firebase Storage bucket
- Bucket name should be: `wildlifetracker-4d28b.firebasestorage.app`
- Service account needs Storage permissions

**"Permission denied"**
- Check Firebase Console → Project Settings → Service Accounts
- Ensure your service account has "Storage Admin" role
- Verify the service account key is correct in your environment variables

**"Bucket doesn't exist"**
- Create a new Storage bucket in Firebase Console
- Choose any location
- Default security rules are fine (they expire after 30 days)

#### Check Your Setup
- ✅ Firebase Storage bucket exists
- ✅ Service account has Storage permissions
- ✅ Environment variables are correct
- ✅ App sends images as `multipart/form-data`

The poaching types prove your basic Firebase connection works - images just need the Storage bucket created.


## 🧪 Testing the API

### Health Check
```bash
curl http://localhost:3000/health
```

### Create Observation
```bash
curl -X POST http://localhost:3000/api/observations \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "category": "Sighting",
    "animal": "Lion",
    "latitude": -25.123,
    "longitude": 28.456
  }'
```

### Get Observations
```bash
curl -H "x-api-key: your-api-key" \
  http://localhost:3000/api/observations
```

## 📊 Dashboard Integration

Use the API endpoints to fetch data for your dashboard:

```javascript
// Fetch all observations
const response = await fetch('/api/observations', {
  headers: {
    'x-api-key': 'your-api-key'
  }
});
const data = await response.json();
```

## 🔧 Development

### Scripts
- `npm start`: Production server
- `npm run dev`: Development server with auto-reload
- `npm test`: Run tests (when implemented)

### Project Structure
```
backend/
├── routes/
│   └── observations.js    # Observation endpoints
├── firebase-service-account.json  # Firebase credentials
├── server.js              # Main application
├── package.json           # Dependencies
├── .env.example           # Environment template
└── README.md             # This file
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.
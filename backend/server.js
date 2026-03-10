require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK (serverless-safe)
let db;

function initializeFirebase() {
  if (!admin.apps.length) {
    // Firebase not initialized yet - ONLY use environment variable (no file loading)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        console.log('FIREBASE_SERVICE_ACCOUNT_KEY length:', process.env.FIREBASE_SERVICE_ACCOUNT_KEY.length);

        // Try to clean up the JSON string if needed
        let jsonString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();

        // Remove any surrounding quotes that might have been added accidentally
        if (jsonString.startsWith('"') && jsonString.endsWith('"')) {
          jsonString = jsonString.slice(1, -1);
        }

        // Unescape any escaped quotes
        jsonString = jsonString.replace(/\\"/g, '"');

        const serviceAccount = JSON.parse(jsonString);
        console.log('Successfully parsed service account from environment variable');

        // Validate required fields
        const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
        const missingFields = requiredFields.filter(field => !serviceAccount[field]);

        if (missingFields.length > 0) {
          console.error('Service account missing required fields:', missingFields);
          throw new Error(`Service account missing fields: ${missingFields.join(', ')}`);
        }

        console.log('Service account validation passed for project:', serviceAccount.project_id);

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: `https://${process.env.FIREBASE_PROJECT_ID || 'wildlifetracker-4d28b'}.firebaseio.com`,
          storageBucket: `${process.env.FIREBASE_PROJECT_ID || 'wildlifetracker-4d28b'}.firebasestorage.app`
        });
        console.log('Firebase Admin SDK initialized successfully with Storage');

      } catch (error) {
        console.error('Failed to initialize Firebase:', error.message);
        throw error;
      }
    } else {
      console.error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable not set!');
      throw new Error('Firebase service account key not configured');
    }
  }

  return admin.firestore();
}

// Initialize Firebase safely
try {
  initializeFirebase();
  // Access the named database
  db = admin.firestore();

  // Handle serverless environment where settings might already be configured
  try {
    db.settings({ databaseId: 'wildlifetracker-db' });
  } catch (settingsError) {
    console.log('Firebase settings already configured, continuing...');
  }

  console.log('Firebase initialized successfully');

} catch (error) {
  console.error('Failed to initialize Firebase:', error.message);
  console.log('Continuing without Firebase for testing map endpoints...');
  db = null; // Set db to null so routes that need it will fail gracefully
}
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

// CORS - use cors package for reliable preflight handling
app.set('trust proxy', 1); // Trust Vercel proxy for rate limiting

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5000',
  'https://jonobenjamin.github.io',
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : [])
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*') || origin.endsWith('jonobenjamin.github.io')) {
      return cb(null, true);
    }
    cb(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'x-api-key'],
  credentials: true,
  optionsSuccessStatus: 204
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Wildlife Tracker API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      observations: '/api/observations (POST only - write-only)',
      images: '/api/observations/:id/image (secure image access)',
      testFile: '/test-file (POST - test file upload)'
    },
    docs: 'See README.md for API documentation'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Simple file test endpoint
const testUpload = require('multer')({
  storage: require('multer').memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
}).single('image');

app.post('/test-file', testUpload, (req, res) => {
  res.json({
    file: req.file ? {
      name: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype,
      buffer: req.file.buffer ? `Present (${req.file.buffer.length} bytes)` : 'Missing'
    } : null,
    body: req.body,
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/observations', require('./api/observations')(db));
app.use('/api/map', require('./api/map'));
app.use('/api/auth', require('./api/auth'));
app.use('/api/admin', require('./api/admin'));
app.use('/api/fires', require('./api/fires')(db));
app.use('/api/cron/fire-check', require('./api/cron-fire-check'));
app.use('/api/water-monitoring', require('./api/water-monitoring')(db));
app.use('/api/tracking', require('./api/tracking')(db));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// For Vercel serverless functions, we export the app
// For local development, we can still listen
if (require.main === module) {
  // This runs when the file is executed directly (local development)
  app.listen(PORT, () => {
    console.log(`🚀 Wildlife Tracker API running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
  });
}

module.exports = app;

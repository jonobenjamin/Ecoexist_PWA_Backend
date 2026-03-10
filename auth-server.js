require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK (same as main server)
let db;

function initializeFirebase() {
  if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        console.log('FIREBASE_SERVICE_ACCOUNT_KEY length:', process.env.FIREBASE_SERVICE_ACCOUNT_KEY.length);

        let jsonString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();

        if (jsonString.startsWith('"') && jsonString.endsWith('"')) {
          jsonString = jsonString.slice(1, -1);
        }

        jsonString = jsonString.replace(/\\"/g, '"');

        if (!jsonString.trim().startsWith('{')) {
          const start = jsonString.indexOf('{');
          const end = jsonString.lastIndexOf('}') + 1;
          if (start !== -1 && end > start) jsonString = jsonString.slice(start, end);
        }

        const serviceAccount = JSON.parse(jsonString);
        console.log('Successfully parsed service account from environment variable');

        const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
        const missingFields = requiredFields.filter(field => !serviceAccount[field]);

        if (missingFields.length > 0) {
          console.error('Service account missing required fields:', missingFields);
          throw new Error(`Service account missing fields: ${missingFields.join(', ')}`);
        }

        console.log('Service account validation passed for project:', serviceAccount.project_id);

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: `https://${process.env.FIREBASE_PROJECT_ID || 'ecoexist-app'}.firebaseio.com`,
          storageBucket: `${process.env.FIREBASE_PROJECT_ID || 'ecoexist-app'}.firebasestorage.app`
        });
        console.log('Firebase Admin SDK initialized successfully');

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

const app = express();
const PORT = process.env.AUTH_PORT || 3001;

// Security middleware
app.use(helmet());

// CORS middleware
app.use((req, res, next) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS ?
    process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()) :
    ['http://localhost:3000', 'http://localhost:5000'];

  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Rate limiting (stricter for auth endpoints)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 auth requests per windowMs
  message: 'Too many authentication attempts, please try again later.'
});
app.use('/api/auth/', authLimiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize Firebase safely
try {
  initializeFirebase();
  db = admin.firestore();
  console.log('Firebase initialized successfully for auth server');
} catch (error) {
  console.error('Failed to initialize Firebase:', error.message);
  console.log('Auth server will not function without Firebase');
  db = null;
}

// Auth routes
app.use('/api/auth', require('./api/auth'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'auth-server',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Wildlife Tracker Auth Server',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      requestPin: 'POST /api/auth/request-pin',
      verifyPin: 'POST /api/auth/verify-pin'
    }
  });
});

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

// For local development
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Wildlife Tracker Auth Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📧 PIN requests: POST http://localhost:${PORT}/api/auth/request-pin`);
    console.log(`✅ PIN verification: POST http://localhost:${PORT}/api/auth/verify-pin`);
  });
}

module.exports = app;
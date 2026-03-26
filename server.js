require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const admin = require('firebase-admin');

// ---------------- FIREBASE INIT ----------------
let db;

function initializeFirebase() {
  if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
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

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: `https://${process.env.FIREBASE_PROJECT_ID || 'ecoexist-app'}.firebaseio.com`,
          storageBucket: `${process.env.FIREBASE_PROJECT_ID || 'ecoexist-app'}.firebasestorage.app`
        });

        console.log('✅ Firebase initialized');

      } catch (error) {
        console.error('❌ Firebase init failed:', error.message);
        throw error;
      }
    } else {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
    }
  }

  return admin.firestore();
}

try {
  initializeFirebase();
  db = admin.firestore();
} catch (e) {
  console.warn('⚠️ Running without Firebase:', e.message);
  db = null;
}

// ---------------- EXPRESS ----------------
const app = express();
const PORT = process.env.PORT || 3000;

// ---------------- SECURITY ----------------
app.use(helmet());
app.set('trust proxy', 1);

// ---------------- CORS (FIXED) ----------------
const allowedOrigins = [
  // Local dev
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5000',

  // GitHub Pages (your personal)
  'https://jonobenjamin.github.io',

  // NGO domain ✅
  'https://monitoring.ecoexisttrust.org'
];

// Add env-based origins
if (process.env.ALLOWED_ORIGINS) {
  allowedOrigins.push(...process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()));
}

const corsOptions = {
  origin: function (origin, callback) {
    // Allow server-to-server / curl / no-origin
    if (!origin) return callback(null, true);

    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.github.io')
    ) {
      return callback(null, true);
    }

    console.warn('❌ CORS blocked:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'x-api-key'
  ],
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // ✅ Handles preflight cleanly

// ---------------- RATE LIMIT ----------------
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// ---------------- BODY ----------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ---------------- ROUTES ----------------
app.get('/', (req, res) => {
  res.json({
    message: 'Ecoexist API',
    status: 'running'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString() });
});

// ---------------- FILE TEST ----------------
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
}).single('image');

app.post('/test-file', upload, (req, res) => {
  res.json({
    file: req.file ? {
      name: req.file.originalname,
      size: req.file.size
    } : null,
    body: req.body
  });
});

// ---------------- API ROUTES ----------------
app.use('/api/observations', require('./api/observations')(db));
app.use('/api/map', require('./api/map'));
app.use('/api/auth', require('./api/auth'));
app.use('/api/admin', require('./api/admin'));
app.use('/api/fires', require('./api/fires')(db));
app.use('/api/cron/fire-check', require('./api/cron-fire-check'));
app.use('/api/water-monitoring', require('./api/water-monitoring')(db));
app.use('/api/tracking', require('./api/tracking')(db));

try {
  app.use('/api/awt-data-firebase', require('./api/awt-data-firebase'));
} catch (e) {
  console.warn('awt-data-firebase not loaded');
  app.use('/api/awt-data-firebase', (req, res) =>
    res.status(503).json({ error: 'Unavailable' })
  );
}

app.use('/api/meeting-reports', require('./api/meeting-reports')(db));

// ---------------- ERROR HANDLING ----------------
app.use((err, req, res, next) => {
  console.error('🔥 Error:', err.message);
  res.status(500).json({
    error: 'Server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ---------------- 404 ----------------
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---------------- START ----------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 API running on ${PORT}`);
  });
}

module.exports = app;

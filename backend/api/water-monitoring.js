const express = require('express');
const router = express.Router();

// Check if user is revoked
async function checkUserRevoked(db, userIdentifier) {
  try {
    console.log('🔍 Checking if user is revoked - received identifier:', userIdentifier);

    if (!userIdentifier) {
      console.log('⚠️ No user identifier provided - allowing submission');
      return false;
    }

    // First, try to find user by exact document ID
    let userDoc = await db.collection('users').doc(userIdentifier).get();

    // If not found and looks like email, try email pattern
    if (!userDoc.exists && userIdentifier.includes('@')) {
      console.log('📧 Trying email pattern lookup for:', userIdentifier);
      const emailKey = userIdentifier.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
      const emailDocId = 'email_' + emailKey;
      console.log('📧 Looking for document ID:', emailDocId);
      userDoc = await db.collection('users').doc(emailDocId).get();
    }

    // If still not found, try to search all users (less efficient but comprehensive)
    if (!userDoc.exists) {
      console.log('🔍 User document not found by ID/email, searching all users...');
      const usersSnapshot = await db.collection('users').get();
      for (const doc of usersSnapshot.docs) {
        const data = doc.data();
        // Check multiple possible matches
        if (data.email === userIdentifier ||
            data.uid === userIdentifier ||
            data.name === userIdentifier ||
            (data.name && userIdentifier.includes(data.name)) ||
            (data.email && userIdentifier.includes(data.email.split('@')[0]))) {
          userDoc = doc;
          console.log('✅ Found user by searching - doc ID:', doc.id, 'matched by:', {
            email: data.email === userIdentifier,
            uid: data.uid === userIdentifier,
            name: data.name === userIdentifier
          });
          break;
        }
      }
    }

    if (!userDoc.exists) {
      console.log('⚠️ User document not found after all attempts - allowing submission for new user');
      console.log('   Searched for:', userIdentifier);
      return false; // Allow new users
    }

    const userData = userDoc.data();
    const isRevoked = userData.status === 'revoked';

    console.log('👤 User status check result:');
    console.log('   - Document ID:', userDoc.id);
    console.log('   - User email:', userData.email);
    console.log('   - User status:', userData.status);
    console.log('   - Is revoked:', isRevoked);

    return isRevoked;
  } catch (error) {
    console.error('❌ Error checking user status:', error);
    console.error('❌ Error details:', error.message);
    return false; // Allow submission if check fails (fail-safe)
  }
}

// Middleware to validate API key (simple authentication)
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key required'
    });
  }

  next();
};

// Apply API key validation to all routes
router.use(validateApiKey);

module.exports = (db) => {

// GET /api/water-monitoring - Fetch water monitoring data
router.get('/', async (req, res) => {
  try {
    // Check if Firebase is initialized
    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Database not available',
        message: 'Firebase not configured - water monitoring data unavailable'
      });
    }

    console.log('GET /api/water-monitoring requested');

    // Fetch water monitoring observations from Firestore
    let query = db.collection('water-monitoring');

    // Filter by location if specified
    if (req.query.location) {
      query = query.where('location', '==', req.query.location);
    }

    // Note: Removed orderBy to avoid composite index requirements in serverless environment
    const snapshot = await query.get();

    const waterMonitoringData = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      waterMonitoringData.push({
        id: doc.id,
        location: data.location,
        location_name: data.location_name,
        date: data.date,
        cond: data.cond,
        tds: data.tds,
        as: data.as,
        cr: data.cr,
        cu: data.cu,
        mn: data.mn,
        na: data.na,
        pb: data.pb,
        timestamp: data.timestamp,
        user: data.user
      });
    });

    // Sort by date in ascending order (oldest first)
    waterMonitoringData.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA - dateB;
    });

    console.log(`Successfully fetched ${waterMonitoringData.length} water monitoring records`);

    res.json({
      success: true,
      message: 'Water monitoring data fetched successfully',
      data: waterMonitoringData,
      count: waterMonitoringData.length
    });

  } catch (error) {
    console.error('Error fetching water monitoring data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch water monitoring data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/water-monitoring - Create new water monitoring record
router.post('/', async (req, res) => {
  try {
    // Check if Firebase is initialized
    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Database not available',
        message: 'Firebase not configured - water monitoring storage disabled'
      });
    }

    console.log('POST /api/water-monitoring received');
    console.log('Body fields:', Object.keys(req.body));
    console.log('Body values:', JSON.stringify(req.body, null, 2));

    const {
      location,
      location_name,
      latitude,
      longitude,
      date,
      cond,
      tds,
      as,
      cr,
      cu,
      mn,
      na,
      pb,
      user
    } = req.body;

    console.log('💧 New water monitoring submission:');
    console.log('   - Location:', location);
    console.log('   - Location Name:', location_name);
    console.log('   - Date:', date);
    console.log('   - User identifier:', user);

    // Check if user is revoked before allowing submission
    if (user) {
      console.log('🛡️ Checking user revocation status...');
      const isRevoked = await checkUserRevoked(db, user);
      if (isRevoked) {
        console.log('🚫 BLOCKED: Revoked user attempted to submit water monitoring data');
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'Your account has been suspended. Please contact an administrator.'
        });
      }
      console.log('✅ User is active - allowing submission');
    } else {
      console.log('⚠️ No user identifier in submission - allowing (might be anonymous)');
    }

    // Validate required fields
    if (!location) {
      return res.status(400).json({
        success: false,
        error: 'Location is required'
      });
    }

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date is required'
      });
    }

    // Validate location values
    const validLocations = ['tuludi', 'sable-alley', 'little-sable'];
    if (!validLocations.includes(location)) {
      return res.status(400).json({
        success: false,
        error: `Invalid location. Must be one of: ${validLocations.join(', ')}`
      });
    }

    const waterMonitoringData = {
      location,
      location_name,
      date,
      timestamp: new Date().toISOString()
    };

    // Only add user field if it has a valid value
    if (user !== undefined && user !== null && user !== '') {
      waterMonitoringData.user = user;
    }

    // Add GPS if provided
    if (latitude !== undefined && longitude !== undefined) {
      waterMonitoringData.latitude = latitude;
      waterMonitoringData.longitude = longitude;
    }

    // Add water quality parameters (only if they have values)
    const parameters = { cond, tds, as, cr, cu, mn, na, pb };
    Object.keys(parameters).forEach(key => {
      if (parameters[key] !== undefined && parameters[key] !== null && parameters[key] !== '') {
        waterMonitoringData[key] = parameters[key];
      }
    });

    console.log('Attempting to save water monitoring data to Firestore:', waterMonitoringData);

    const docRef = await db.collection('water-monitoring').add(waterMonitoringData);

    console.log('Successfully saved water monitoring data to Firestore with ID:', docRef.id);

    res.status(201).json({
      success: true,
      message: 'Water monitoring data created successfully',
      data: {
        id: docRef.id,
        ...waterMonitoringData
      }
    });

  } catch (error) {
    console.error('Error creating water monitoring record:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      error: 'Failed to create water monitoring record',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

  return router;
};
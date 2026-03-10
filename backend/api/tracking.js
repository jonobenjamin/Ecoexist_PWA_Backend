const express = require('express');
const router = express.Router();

// Check if user is revoked (reuse pattern from observations)
async function checkUserRevoked(db, userIdentifier) {
  try {
    if (!userIdentifier) return false;
    let userDoc = await db.collection('users').doc(userIdentifier).get();
    if (!userDoc.exists && userIdentifier.includes('@')) {
      const emailKey = userIdentifier.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
      userDoc = await db.collection('users').doc('email_' + emailKey).get();
    }
    if (!userDoc.exists) {
      const usersSnapshot = await db.collection('users').get();
      for (const doc of usersSnapshot.docs) {
        const data = doc.data();
        if (data.email === userIdentifier || data.uid === userIdentifier ||
            data.name === userIdentifier || (data.name && userIdentifier.includes(data.name)) ||
            (data.email && userIdentifier.includes(data.email.split('@')[0]))) {
          userDoc = doc;
          break;
        }
      }
    }
    if (!userDoc.exists) return false;
    return userDoc.data().status === 'revoked';
  } catch (error) {
    console.error('Error checking user status:', error);
    return false;
  }
}

module.exports = (db) => {
  const validateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Valid API key required' });
    }
    next();
  };

  router.use(validateApiKey);

  // POST /api/tracking - Create new tracking activity
  router.post('/', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({
          success: false,
          error: 'Database not available',
          message: 'Firebase not configured'
        });
      }

      const {
        startTime,
        endTime,
        trackingType,
        vehicle,
        user,
        totalTimeSeconds,
        distanceMeters,
        geoJson
      } = req.body;

      if (!startTime || !endTime || !trackingType || !user) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: startTime, endTime, trackingType, user'
        });
      }

      if (!['patrol', 'vehicle'].includes(String(trackingType).toLowerCase())) {
        return res.status(400).json({
          success: false,
          error: 'trackingType must be "patrol" or "vehicle"'
        });
      }

      if (trackingType.toLowerCase() === 'vehicle' && !vehicle) {
        return res.status(400).json({
          success: false,
          error: 'vehicle is required when trackingType is "vehicle"'
        });
      }

      // Check user revocation
      const isRevoked = await checkUserRevoked(db, user);
      if (isRevoked) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'Your account has been suspended.'
        });
      }

      const trackingData = {
        startTime,
        endTime,
        trackingType: String(trackingType).toLowerCase(),
        user,
        totalTimeSeconds: totalTimeSeconds ?? null,
        distanceMeters: distanceMeters ?? null,
        geoJson: geoJson ?? null,
        vehicle: trackingType.toLowerCase() === 'vehicle' ? vehicle : null,
        timestamp: new Date().toISOString(),
        synced: true
      };

      const docRef = await db.collection('tracking').add(trackingData);

      console.log('Tracking activity saved:', docRef.id);

      res.status(201).json({
        success: true,
        message: 'Tracking activity saved successfully',
        data: { id: docRef.id, ...trackingData }
      });
    } catch (error) {
      console.error('Error saving tracking:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save tracking',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // GET /api/tracking - Fetch tracking activities (for admin/map display)
  router.get('/', async (req, res) => {
    try {
      if (!db) {
        return res.status(503).json({
          success: false,
          error: 'Database not available'
        });
      }

      const snapshot = await db.collection('tracking')
        .orderBy('timestamp', 'desc')
        .limit(500)
        .get();

      const activities = [];
      snapshot.forEach(doc => {
        activities.push({ id: doc.id, ...doc.data() });
      });

      res.json({
        success: true,
        data: activities,
        count: activities.length
      });
    } catch (error) {
      console.error('Error fetching tracking:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch tracking'
      });
    }
  });

  return router;
};

/**
 * Meeting Reports API - Writes to Firestore collection 'meeting_reports'
 * POST /api/meeting-reports - Create meeting report
 * GET /api/meeting-reports - List meeting reports (for admin)
 */
const express = require('express');
const router = express.Router();

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

router.use(validateApiKey);

const COLLECTION = 'meeting_reports';

module.exports = (db) => {

// POST /api/meeting-reports - Create meeting report
router.post('/', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }

    const data = req.body;
    const user = data.user || data.reporterName || data.reporterEmail || 'Unknown User';

    const isRevoked = await checkUserRevoked(db, user);
    if (isRevoked) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'Your account has been suspended.'
      });
    }

    // Strip category/synced - store only meeting report fields
    const {
      category,
      synced,
      ...reportData
    } = data;

    const doc = {
      ...reportData,
      user,
      submittedAt: new Date().toISOString(),
      timestamp: data.timestamp || new Date().toISOString()
    };

    const docRef = await db.collection(COLLECTION).add(doc);

    console.log('Meeting report saved:', docRef.id);

    res.status(201).json({
      success: true,
      message: 'Meeting report saved',
      id: docRef.id
    });
  } catch (error) {
    console.error('Meeting report error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save meeting report',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/meeting-reports - List meeting reports
router.get('/', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const snapshot = await db.collection(COLLECTION)
      .orderBy('submittedAt', 'desc')
      .limit(limit)
      .get();

    const reports = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    res.json({
      success: true,
      data: reports,
      count: reports.length
    });
  } catch (error) {
    console.error('Meeting reports list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch meeting reports'
    });
  }
});

  return router;
};

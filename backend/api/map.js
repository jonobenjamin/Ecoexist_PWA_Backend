const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();

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

// GET /api/map/boundary - Get concession boundary GeoJSON
router.get('/boundary', async (req, res) => {
  try {
    console.log('GET /api/map/boundary requested');

    const boundaryPath = path.join(__dirname, '../data/Consession_boundary.geojson');

    // Check if file exists
    try {
      await fs.access(boundaryPath);
    } catch (error) {
      console.error('Boundary file not found:', boundaryPath);
      return res.status(404).json({
        error: 'Not Found',
        message: 'Boundary data file not found'
      });
    }

    // Read and parse the GeoJSON file
    const boundaryData = await fs.readFile(boundaryPath, 'utf8');
    const geoJson = JSON.parse(boundaryData);

    console.log('Boundary data loaded successfully');

    res.setHeader('Content-Type', 'application/json');
    res.json(geoJson);

  } catch (error) {
    console.error('Error serving boundary data:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to load boundary data'
    });
  }
});

// GET /api/map/roads - Get road network GeoJSON
router.get('/roads', async (req, res) => {
  try {
    console.log('GET /api/map/roads requested');

    const roadsPath = path.join(__dirname, '../data/KPR_roads.geojson');

    // Check if file exists
    try {
      await fs.access(roadsPath);
    } catch (error) {
      console.error('Roads file not found:', roadsPath);
      return res.status(404).json({
        error: 'Not Found',
        message: 'Roads data file not found'
      });
    }

    // Read and parse the GeoJSON file
    const roadsData = await fs.readFile(roadsPath, 'utf8');
    const geoJson = JSON.parse(roadsData);

    console.log('Roads data loaded successfully');

    res.setHeader('Content-Type', 'application/json');
    res.json(geoJson);

  } catch (error) {
    console.error('Error serving roads data:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to load roads data'
    });
  }
});

module.exports = router;

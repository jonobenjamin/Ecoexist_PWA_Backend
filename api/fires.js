const express = require('express');
const router = express.Router();
const { sendFireNotifications } = require('../services/notificationServices');

module.exports = (db) => {

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

// Function to parse CSV to GeoJSON
function csvToGeoJSON(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return { type: 'FeatureCollection', features: [] };

  const headers = lines[0].split(',');
  const features = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length !== headers.length) continue;

    const properties = {};
    headers.forEach((header, index) => {
      properties[header.trim()] = values[index].trim();
    });

    // Parse coordinates
    const lat = parseFloat(properties.latitude);
    const lng = parseFloat(properties.longitude);

    if (!isNaN(lat) && !isNaN(lng)) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        properties: {
          ...properties,
          sensor: properties.instrument || 'Unknown'
        }
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features: features
  };
}

// GET /api/fires - Fetch fire data from NASA FIRMS API
router.get('/', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 3, 5); // Max 5 days for area API

    // Continental USA bounding box
    const bbox = '-125,24,-66,49';

    console.log(`Fetching fire data for USA (bbox: ${bbox}), last ${days} days`);

    const BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";

    // Check if FIRMS_MAP_KEY environment variable is set
    if (!process.env.FIRMS_MAP_KEY) {
      console.error('FIRMS_MAP_KEY environment variable not set');
      return res.status(500).json({
        success: false,
        error: 'FIRMS API configuration error',
        message: 'Fire data service not configured. Please set FIRMS_MAP_KEY environment variable.'
      });
    }

    const mapKey = process.env.FIRMS_MAP_KEY;

    // Fetch VIIRS data
    console.log('Fetching VIIRS fire data...');
    const viirsUrl = `${BASE_URL}/${mapKey}/VIIRS_SNPP_NRT/${bbox}/${days}`;
    console.log('VIIRS URL:', viirsUrl);
    const viirsRes = await fetch(viirsUrl);

    console.log('VIIRS Response status:', viirsRes.status, viirsRes.statusText);

    if (!viirsRes.ok) {
      console.error(`VIIRS API request failed: ${viirsRes.status} ${viirsRes.statusText}`);
      const errorText = await viirsRes.text();
      console.error('VIIRS Error response:', errorText.substring(0, 200));
      return res.status(viirsRes.status).json({
        success: false,
        error: 'Failed to fetch VIIRS fire data',
        details: `API returned ${viirsRes.status}: ${errorText.substring(0, 200)}`
      });
    }

    // Get response text (CSV format)
    const viirsResponseText = await viirsRes.text();

    // Check if response is HTML error page
    if (viirsResponseText.trim().startsWith('<!DOCTYPE') || viirsResponseText.trim().startsWith('<html')) {
      console.error('VIIRS API returned HTML error page instead of CSV');
      return res.status(500).json({
        success: false,
        error: 'FIRMS API returned HTML error page',
        details: 'API returned HTML instead of CSV. Check MAP_KEY validity.'
      });
    }

    // Parse CSV to GeoJSON
    let viirsData;
    try {
      viirsData = csvToGeoJSON(viirsResponseText);
      console.log(`Parsed VIIRS CSV: ${viirsData.features.length} features`);
    } catch (parseError) {
      console.error('Failed to parse VIIRS CSV response:', parseError.message);
      return res.status(500).json({
        success: false,
        error: 'Invalid CSV response from FIRMS API',
        details: `CSV parsing failed: ${parseError.message}`
      });
    }

    // Fetch MODIS data
    console.log('Fetching MODIS fire data...');
    const modisUrl = `${BASE_URL}/${mapKey}/MODIS_NRT/${bbox}/${days}`;
    console.log('MODIS URL:', modisUrl);
    const modisRes = await fetch(modisUrl);

    console.log('MODIS Response status:', modisRes.status, modisRes.statusText);

    if (!modisRes.ok) {
      console.error(`MODIS API request failed: ${modisRes.status} ${modisRes.statusText}`);
      const errorText = await modisRes.text();
      console.error('MODIS Error response:', errorText.substring(0, 200));
      return res.status(modisRes.status).json({
        success: false,
        error: 'Failed to fetch MODIS fire data',
        details: `API returned ${modisRes.status}: ${errorText.substring(0, 200)}`
      });
    }

    // Get response text (CSV format)
    const modisResponseText = await modisRes.text();

    // Check if response is HTML error page
    if (modisResponseText.trim().startsWith('<!DOCTYPE') || modisResponseText.trim().startsWith('<html')) {
      console.error('MODIS API returned HTML error page instead of CSV');
      return res.status(500).json({
        success: false,
        error: 'FIRMS API returned HTML error page',
        details: 'API returned HTML instead of CSV. Check MAP_KEY validity.'
      });
    }

    // Parse CSV to GeoJSON
    let modisData;
    try {
      modisData = csvToGeoJSON(modisResponseText);
      console.log(`Parsed MODIS CSV: ${modisData.features.length} features`);
    } catch (parseError) {
      console.error('Failed to parse MODIS CSV response:', parseError.message);
      return res.status(500).json({
        success: false,
        error: 'Invalid CSV response from FIRMS API',
        details: `CSV parsing failed: ${parseError.message}`
      });
    }

    // Tag each feature with sensor type
    const viirsFeatures = (viirsData.features || []).map(f => ({
      ...f,
      properties: {
        ...f.properties,
        sensor: "VIIRS"
      }
    }));

    const modisFeatures = (modisData.features || []).map(f => ({
      ...f,
      properties: {
        ...f.properties,
        sensor: "MODIS"
      }
    }));

    // Merge both datasets
    const combined = {
      type: "FeatureCollection",
      features: [...viirsFeatures, ...modisFeatures]
    };

    console.log(`Total fires returned: ${combined.features.length}`);

    // Send fire alert emails when fires are detected (dashboard load + daily cron)
    try {
      const notificationResults = await sendFireNotifications(combined.features);
      console.log('Fire notification results:', notificationResults);
    } catch (notificationError) {
      console.error('Error sending fire notifications:', notificationError);
    }

    res.status(200).json(combined);

  } catch (error) {
    console.error('Error fetching fire data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fire data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

  return router;
};
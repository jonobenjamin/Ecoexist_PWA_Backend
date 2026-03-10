/**
 * Fire check service - fetches fire data from FIRMS API and sends notifications.
 * Used by both the /api/fires endpoint (on-demand) and the cron job (scheduled).
 */

const { sendFireNotifications } = require('./notificationServices');

const BASE_URL = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
const USA_BBOX = '-125,24,-66,49';

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

    const lat = parseFloat(properties.latitude);
    const lng = parseFloat(properties.longitude);

    if (!isNaN(lat) && !isNaN(lng)) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: { ...properties, sensor: properties.instrument || 'Unknown' }
      });
    }
  }

  return { type: 'FeatureCollection', features };
}

async function fetchFiresAndSendNotifications(days = 3) {
  const mapKey = process.env.FIRMS_MAP_KEY;
  if (!mapKey) {
    throw new Error('FIRMS_MAP_KEY not configured');
  }

  const daysToFetch = Math.min(parseInt(days) || 3, 5);
  console.log('[FireCheck] Fetching USA fire data, last ' + daysToFetch + ' days');

  const viirsUrl = BASE_URL + '/' + mapKey + '/VIIRS_SNPP_NRT/' + USA_BBOX + '/' + daysToFetch;
  const viirsRes = await fetch(viirsUrl);
  if (!viirsRes.ok) {
    throw new Error('VIIRS API failed: ' + viirsRes.status);
  }
  const viirsText = await viirsRes.text();
  if (viirsText.trim().startsWith('<!DOCTYPE') || viirsText.trim().startsWith('<html')) {
    throw new Error('FIRMS API returned HTML instead of CSV');
  }
  const viirsData = csvToGeoJSON(viirsText);

  const modisUrl = BASE_URL + '/' + mapKey + '/MODIS_NRT/' + USA_BBOX + '/' + daysToFetch;
  const modisRes = await fetch(modisUrl);
  if (!modisRes.ok) {
    throw new Error('MODIS API failed: ' + modisRes.status);
  }
  const modisText = await modisRes.text();
  if (modisText.trim().startsWith('<!DOCTYPE') || modisText.trim().startsWith('<html')) {
    throw new Error('FIRMS API returned HTML instead of CSV');
  }
  const modisData = csvToGeoJSON(modisText);

  const viirsFeatures = (viirsData.features || []).map(function (f) {
    return { ...f, properties: { ...f.properties, sensor: 'VIIRS' } };
  });
  const modisFeatures = (modisData.features || []).map(function (f) {
    return { ...f, properties: { ...f.properties, sensor: 'MODIS' } };
  });
  const features = viirsFeatures.concat(modisFeatures);

  console.log('[FireCheck] Found ' + features.length + ' fires');

  let notificationResults = {};

  if (features.length > 0) {
    try {
      notificationResults = await sendFireNotifications(features);
      console.log('[FireCheck] Notification results:', notificationResults);
    } catch (err) {
      console.error('[FireCheck] Notification error:', err);
      notificationResults = { error: err.message };
    }
  }

  return { features, notificationResults };
}

module.exports = { fetchFiresAndSendNotifications, csvToGeoJSON };

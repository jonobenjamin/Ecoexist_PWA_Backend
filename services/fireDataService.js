/**
 * Fetches fire data from NASA FIRMS API.
 * Used by both /api/fires (dashboard) and /api/cron/fire-alerts (scheduled notifications).
 */
async function fetchFireData(days = 3) {
  const daysParam = Math.min(parseInt(days) || 3, 5);
  const bbox = '-125,24,-66,49'; // Continental USA
  const BASE_URL = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
  const mapKey = process.env.FIRMS_MAP_KEY;

  if (!mapKey) {
    throw new Error('FIRMS_MAP_KEY environment variable not set');
  }

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

  const viirsUrl = `${BASE_URL}/${mapKey}/VIIRS_SNPP_NRT/${bbox}/${daysParam}`;
  const viirsRes = await fetch(viirsUrl);
  if (!viirsRes.ok) throw new Error(`VIIRS failed: ${viirsRes.status}`);
  const viirsText = await viirsRes.text();
  if (viirsText.trim().startsWith('<!DOCTYPE')) throw new Error('FIRMS returned HTML instead of CSV');
  const viirsData = csvToGeoJSON(viirsText);

  const modisUrl = `${BASE_URL}/${mapKey}/MODIS_NRT/${bbox}/${daysParam}`;
  const modisRes = await fetch(modisUrl);
  if (!modisRes.ok) throw new Error(`MODIS failed: ${modisRes.status}`);
  const modisText = await modisRes.text();
  if (modisText.trim().startsWith('<!DOCTYPE')) throw new Error('FIRMS returned HTML instead of CSV');
  const modisData = csvToGeoJSON(modisText);

  const viirsFeatures = (viirsData.features || []).map(f => ({
    ...f,
    properties: { ...f.properties, sensor: 'VIIRS' }
  }));
  const modisFeatures = (modisData.features || []).map(f => ({
    ...f,
    properties: { ...f.properties, sensor: 'MODIS' }
  }));

  return [...viirsFeatures, ...modisFeatures];
}

module.exports = { fetchFireData };

const emailjs = require('@emailjs/nodejs');

// Initialize EmailJS
const initializeEmailJS = () => {
  if (!process.env.EMAILJS_SERVICE_ID || !process.env.EMAILJS_TEMPLATE_ID || !process.env.EMAILJS_PUBLIC_KEY || !process.env.EMAILJS_PRIVATE_KEY) {
    console.warn('EmailJS credentials not configured. Email notifications disabled.');
    return false;
  }

  // Initialize EmailJS with both public and private keys
  emailjs.init({
    publicKey: process.env.EMAILJS_PUBLIC_KEY,
    privateKey: process.env.EMAILJS_PRIVATE_KEY,
  });

  return true;
};


// Generate Google Maps link from coordinates
const generateGoogleMapsLink = (latitude, longitude) => {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
};

// Format incident details for notification
const formatIncidentDetails = (incidentData) => {
  const {
    id,
    category,
    incident_type,
    poaching_type,
    latitude,
    longitude,
    timestamp,
    user,
    animal,
    notes,
    image_url
  } = incidentData;

  const mapsLink = generateGoogleMapsLink(latitude, longitude);
  const formattedDate = new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  return {
    id,
    category,
    incident_type,
    poaching_type: poaching_type || 'N/A',
    latitude,
    longitude,
    mapsLink,
    timestamp: formattedDate,
    user: user || 'Unknown',
    animal: animal || 'N/A',
    notes: notes || 'No additional notes',
    coordinates: `${latitude}, ${longitude}`,
    has_image: !!image_url // Just indicate if image exists, don't provide URL
  };
};

// Format fire details for notification
const formatFireDetails = (fireData) => {
  const {
    latitude,
    longitude,
    brightness,
    confidence,
    frp,
    sensor,
    acq_date,
    acq_time
  } = fireData.properties || fireData;

  const mapsLink = generateGoogleMapsLink(latitude, longitude);

  // Format acquisition time (HHMM to HH:MM)
  let formattedTime = 'Unknown';
  if (acq_time) {
    const timeStr = acq_time.toString().padStart(4, '0');
    formattedTime = `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}`;
  }

  const formattedDate = acq_date ? new Date(acq_date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) : 'Unknown';

  return {
    latitude,
    longitude,
    mapsLink,
    coordinates: `${latitude}, ${longitude}`,
    brightness: brightness || 'N/A',
    confidence: confidence || 'N/A',
    frp: frp || 'N/A',
    sensor: sensor || 'Unknown',
    acq_date: formattedDate,
    acq_time: formattedTime,
    region: getFireRegion(latitude, longitude)
  };
};

// Determine which region a fire is in
const getFireRegion = (latitude, longitude) => {
  // Check if fire is in Botswana (KPR concession area)
  const botswanaBounds = {
    north: -17.8,
    south: -26.9,
    west: 19.9,
    east: 29.4
  };

  if (latitude >= botswanaBounds.south &&
      latitude <= botswanaBounds.north &&
      longitude >= botswanaBounds.west &&
      longitude <= botswanaBounds.east) {
    return 'Botswana (KPR Concession Area)';
  }

  // Check if fire is in USA
  const usaBounds = {
    north: 49,
    south: 24,
    west: -125,
    east: -66
  };

  if (latitude >= usaBounds.south &&
      latitude <= usaBounds.north &&
      longitude >= usaBounds.west &&
      longitude <= usaBounds.east) {
    return 'United States';
  }

  return 'Other Region';
};

// Send email notification using EmailJS
const sendEmailNotification = async (incidentData) => {
  if (!initializeEmailJS()) {
    console.log('EmailJS not configured, skipping email notification');
    return { success: false, reason: 'EmailJS not configured' };
  }

  const recipients = process.env.NOTIFICATION_EMAILS ?
    process.env.NOTIFICATION_EMAILS.split(',').map(email => email.trim()) : [];

  if (recipients.length === 0) {
    console.warn('No notification email recipients configured');
    return { success: false, reason: 'No recipients configured' };
  }

  const details = formatIncidentDetails(incidentData);

  // Prepare template parameters for EmailJS (poaching - dynamic alert text)
  const templateParams = {
    incident_id: details.id,
    incident_type: details.incident_type,
    poaching_type: details.poaching_type,
    timestamp: details.timestamp,
    reporter: details.user,
    animal: details.animal || 'N/A',
    coordinates: details.coordinates,
    notes: details.notes,
    maps_link: details.mapsLink,
    maps_link_text: details.mapsLink,
    image_status: details.has_image ? 'Image attached (access via app)' : 'No image attached',
    from_name: process.env.EMAIL_FROM_NAME || 'Wildlife Tracker Alert',
    alert_subject: '🚨 POACHING INCIDENT ALERT',
    alert_heading: 'POACHING INCIDENT ALERT',
    alert_subtitle: 'Immediate Action Required',
    alert_intro: 'URGENT: A poaching incident has been reported and requires immediate attention from wildlife protection teams.',
    footer_message: 'Please respond immediately to protect wildlife'
  };

  try {
    // Send to each recipient individually (EmailJS template approach)
    const results = [];

    for (const recipient of recipients) {
      try {
        const result = await emailjs.send(
          process.env.EMAILJS_SERVICE_ID,
          process.env.EMAILJS_TEMPLATE_ID,
          {
            ...templateParams,
            to_email: recipient
          }
        );
        results.push({ success: true, recipient, messageId: result.text });
        console.log(`Email sent to ${recipient}:`, result.text);
      } catch (error) {
        console.error(`Failed to send email to ${recipient}:`, error);
        results.push({ success: false, recipient, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return {
      success: successCount > 0,
      results,
      message: `Sent to ${successCount}/${recipients.length} recipients`
    };
  } catch (error) {
    console.error('Error sending email notification:', error);
    return { success: false, error: error.message };
  }
};


// Main function to send notifications for a poaching incident
const sendPoachingIncidentNotifications = async (incidentData) => {
  console.log('🚨 Sending poaching incident email notifications...');

  const results = {
    email: null,
    timestamp: new Date().toISOString()
  };

  // Send email notification
  try {
    results.email = await sendEmailNotification(incidentData);
  } catch (error) {
    console.error('Email notification failed:', error);
    results.email = { success: false, error: error.message };
  }

  console.log('Notification results:', JSON.stringify(results, null, 2));
  return results;
};

// Check if incident is a poaching incident
const isPoachingIncident = (incidentData) => {
  const { category, incident_type } = incidentData;
  
  if (category !== 'Incident') {
    return false;
  }

  // Check if incident_type contains "poach" (case-insensitive)
  const poachingKeywords = ['poach', 'illegal hunting', 'snare', 'trap'];
  const incidentTypeLower = (incident_type || '').toLowerCase();
  
  return poachingKeywords.some(keyword => incidentTypeLower.includes(keyword));
};

// Send email notification for fire alerts
const sendFireAlertNotification = async (fireData) => {
  if (!initializeEmailJS()) {
    console.log('EmailJS not configured, skipping fire alert email');
    return { success: false, reason: 'EmailJS not configured' };
  }

  const recipients = process.env.NOTIFICATION_EMAILS ?
    process.env.NOTIFICATION_EMAILS.split(',').map(email => email.trim()) : [];

  if (recipients.length === 0) {
    console.warn('No notification email recipients configured');
    return { success: false, reason: 'No recipients configured' };
  }

  const details = formatFireDetails(fireData);

  // Prepare template parameters for EmailJS (fire - dynamic alert text)
  const templateParams = {
    incident_id: `FIRE-${Date.now()}`, // Generate unique ID for fire
    incident_type: 'Fire Detected',
    poaching_type: 'N/A',
    timestamp: `${details.acq_date} ${details.acq_time}`,
    reporter: 'NASA FIRMS Satellite',
    animal: 'N/A',
    coordinates: details.coordinates,
    notes: `🚨 FIRE ALERT: ${details.sensor} satellite detected fire in ${details.region}. Confidence: ${details.confidence}%, Brightness: ${details.brightness}K, FRP: ${details.frp} MW`,
    maps_link: details.mapsLink,
    maps_link_text: details.mapsLink,
    image_status: 'Satellite thermal detection - check map for location',
    from_name: process.env.EMAIL_FROM_NAME || 'KPR Fire Alert System',
    alert_subject: '🔥 FIRE ALERT',
    alert_heading: 'FIRE ALERT',
    alert_subtitle: 'Satellite Detection - Immediate Action Required',
    alert_intro: 'URGENT: Satellite thermal detection has identified a fire requiring immediate attention.',
    footer_message: 'Please respond immediately to assess and respond to the fire'
  };

  try {
    // Send to each recipient individually
    const results = [];

    for (const recipient of recipients) {
      try {
        const result = await emailjs.send(
          process.env.EMAILJS_SERVICE_ID,
          process.env.EMAILJS_TEMPLATE_ID, // Reuse poaching template
          {
            ...templateParams,
            to_email: recipient
          }
        );
        results.push({ success: true, recipient, messageId: result.text });
        console.log(`Fire alert email sent to ${recipient}:`, result.text);
      } catch (error) {
        console.error(`Failed to send fire alert email to ${recipient}:`, error);
        results.push({ success: false, recipient, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return {
      success: successCount > 0,
      results,
      message: `Fire alerts sent to ${successCount}/${recipients.length} recipients`
    };
  } catch (error) {
    console.error('Error sending fire alert email:', error);
    return { success: false, error: error.message };
  }
};

// Main function to send notifications for fire alerts (Botswana/KPR and USA)
const sendFireNotifications = async (firesData) => {
  console.log('🔥 Sending fire alert email notifications...');

  const results = {
    email: null,
    timestamp: new Date().toISOString(),
    fireCount: firesData.length
  };

  // Send email for fires in monitored regions (Botswana/KPR or USA)
  const monitoredFires = firesData.filter(fire => {
    const details = formatFireDetails(fire);
    return details.region === 'Botswana (KPR Concession Area)' || details.region === 'United States';
  });

  if (monitoredFires.length > 0) {
    console.log(`🚨 ${monitoredFires.length} fires detected in monitored region - sending alerts!`);

    try {
      const first = monitoredFires[0];
      const details = formatFireDetails(first);
      const consolidatedFireData = {
        properties: {
          ...first.properties,
          fireCount: monitoredFires.length,
          message: `${monitoredFires.length} fires detected in ${details.region}`,
          latitude: first.geometry.coordinates[1],
          longitude: first.geometry.coordinates[0]
        }
      };

      results.email = await sendFireAlertNotification(consolidatedFireData);
    } catch (error) {
      console.error('Fire alert notification failed:', error);
      results.email = { success: false, error: error.message };
    }
  } else {
    console.log('✅ No fires detected in monitored regions');
    results.email = { success: true, reason: 'No fires in monitored regions' };
  }

  console.log('Fire notification results:', JSON.stringify(results, null, 2));
  return results;
};

module.exports = {
  sendPoachingIncidentNotifications,
  isPoachingIncident,
  sendFireNotifications,
  generateGoogleMapsLink,
  formatIncidentDetails,
  formatFireDetails
};

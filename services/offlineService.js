const twilio = require('twilio');

// Initialize Twilio client
let twilioClient = null;

const initializeTwilio = () => {
  if (!twilioClient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('✅ Twilio client initialized for offline SMS alerts');
  }
  return twilioClient;
};

// Send SMS alert to emergency contacts
const sendEmergencySMS = async (contacts, alertData) => {
  try {
    const client = initializeTwilio();
    if (!client) {
      console.warn('⚠️ Twilio not configured, skipping SMS alerts');
      return { sent: 0, failed: contacts.length };
    }

    const { userName, userLocation, emergencyType, phoneNumber } = alertData;

    const message = `🚨 EMERGENCY ALERT 🚨\n${userName} needs immediate help!\nType: ${emergencyType}\nLocation: https://maps.google.com/?q=${userLocation.latitude},${userLocation.longitude}\nPlease respond urgently!`;

    const promises = contacts.map(async (contact) => {
      try {
        await client.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: contact.phone
        });
        return { success: true, contact: contact.name };
      } catch (error) {
        console.error(`❌ Failed to send SMS to ${contact.name}:`, error.message);
        return { success: false, contact: contact.name, error: error.message };
      }
    });

    const results = await Promise.allSettled(promises);
    const sent = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - sent;

    console.log(`📱 Emergency SMS sent: ${sent} successful, ${failed} failed`);
    return { sent, failed };

  } catch (error) {
    console.error('❌ Emergency SMS error:', error.message);
    return { sent: 0, failed: contacts.length };
  }
};

// Bluetooth mesh discovery simulation (for devices without internet)
// This would integrate with native Bluetooth APIs in a real implementation
const discoverNearbyDevices = async (userLocation, searchRadius = 100) => {
  // In a real implementation, this would use Bluetooth Low Energy (BLE)
  // to discover nearby SmartSensory devices and form a mesh network

  console.log(`🔍 Scanning for nearby devices within ${searchRadius}m...`);

  // Simulate device discovery (would be replaced with actual BLE scanning)
  const mockDevices = [
    // This would be populated by actual BLE discovery
  ];

  return {
    devices: mockDevices,
    count: mockDevices.length,
    meshFormed: mockDevices.length > 0
  };
};

// Send alert through Bluetooth mesh
const sendMeshAlert = async (devices, alertData) => {
  // In a real implementation, this would broadcast the alert through
  // the Bluetooth mesh network to nearby devices

  console.log(`📡 Broadcasting alert through mesh to ${devices.length} devices`);

  // Simulate mesh broadcasting
  const successful = devices.length;
  const failed = 0;

  return { successful, failed };
};

// Combined offline alert system
const triggerOfflineAlerts = async (userId, alertData) => {
  try {
    const User = require('../models/User');

    // Get user's emergency contacts
    const user = await User.findById(userId).populate('emergencyContacts');
    if (!user || !user.emergencyContacts || user.emergencyContacts.length === 0) {
      console.warn('⚠️ No emergency contacts found for offline alerts');
      return { sms: { sent: 0, failed: 0 }, mesh: { successful: 0, failed: 0 } };
    }

    const contacts = user.emergencyContacts.map(contact => ({
      name: contact.name,
      phone: contact.phone
    }));

    // Send SMS alerts
    const smsResult = await sendEmergencySMS(contacts, {
      ...alertData,
      userName: user.name,
      phoneNumber: user.mobile
    });

    // Discover nearby devices for mesh networking
    const { devices, meshFormed } = await discoverNearbyDevices(alertData.userLocation);

    let meshResult = { successful: 0, failed: 0 };
    if (meshFormed) {
      meshResult = await sendMeshAlert(devices, alertData);
    }

    return {
      sms: smsResult,
      mesh: meshResult,
      meshFormed,
      totalContacts: contacts.length,
      nearbyDevices: devices.length
    };

  } catch (error) {
    console.error('❌ Offline alert system error:', error);
    return { sms: { sent: 0, failed: 0 }, mesh: { successful: 0, failed: 0 } };
  }
};

module.exports = {
  initializeTwilio,
  sendEmergencySMS,
  discoverNearbyDevices,
  sendMeshAlert,
  triggerOfflineAlerts
};
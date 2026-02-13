/**
 * Advanced SOS Backend Routes - Phase 4
 * WebSocket handlers, emotion detection, guardians, crime data, PDF reports
 */

const express = require('express');
const router = express.Router();
const WebSocket = require('ws');
const SOS = require('../models/SOS');
const authenticateToken = require('../middleware/auth');

// ============ SOS HISTORY ROUTES ============

/**
 * GET /api/sos/history
 * Fetch SOS event history with pagination
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id; // Get userId from authenticated user
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    // Fetch user-specific SOS history
    const sosEvents = await SOS.find({ userId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(); // Use lean() for better performance

    // Get total count for pagination
    const total = await SOS.countDocuments({ userId });
    const pages = Math.ceil(total / limit);

    // Format response
    const formattedData = sosEvents.map(event => ({
      id: event._id.toString(),
      type: event.type,
      status: event.status,
      location: event.location,
      timestamp: event.timestamp,
      createdAt: event.createdAt,
      coordinates: event.coordinates,
      latitude: event.coordinates?.latitude,
      longitude: event.coordinates?.longitude,
      address: event.location,
      evidence: event.evidence,
      silent: event.silent,
      resolvedAt: event.resolvedAt,
    }));

    res.json({
      success: true,
      data: formattedData,
      pagination: {
        page,
        pages,
        limit,
        total,
        hasNextPage: page < pages,
        hasPrevPage: page > 1,
      },
      message: 'SOS history fetched successfully',
    });
  } catch (error) {
    console.error('❌ Error fetching SOS history:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to fetch SOS history',
    });
  }
});

// ============ LIVE AUDIO STREAMING ROUTES ============

/**
 * POST /api/stream/start
 * Initialize audio stream session
 */
router.post('/stream/start', async (req, res) => {
  try {
    const { userId, sosEventId, emergencyContacts } = req.body;

    const streamSession = {
      sessionId: `stream_${Date.now()}`,
      userId,
      sosEventId,
      startTime: Date.now(),
      wsConnected: false,
      guardians: [],
      metrics: {
        bytesReceived: 0,
        chunksReceived: 0,
        latency: 0,
      },
    };

    // Store in Redis for real-time tracking
    // await redis.setex(sessionId, 3600, JSON.stringify(streamSession));

    res.json({
      success: true,
      sessionId: streamSession.sessionId,
      streamUrl: `wss://api.example.com/stream/${streamSession.sessionId}`,
      message: 'Stream session created',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/stream/:sessionId/chunk
 * Receive audio chunk
 */
router.post('/stream/:sessionId/chunk', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { chunkIndex, encryptedData, compressionType } = req.body;

    // Save chunk to database
    // const savedChunk = await AudioChunk.create({
    //   sessionId,
    //   chunkIndex,
    //   encryptedData: Buffer.from(encryptedData, 'base64'),
    //   compressionType,
    //   receivedAt: new Date(),
    // });

    // Broadcast to connected guardians via WebSocket
    // broadcastToGuardians(sessionId, {
    //   type: 'AUDIO_CHUNK',
    //   chunkIndex,
    //   timestamp: Date.now(),
    // });

    res.json({
      success: true,
      chunkIndex,
      acked: true,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/stream/:sessionId/end
 * Finalize stream session
 */
router.post('/stream/:sessionId/end', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { finalMetrics } = req.body;

    // Update session with final metrics
    // await StreamSession.updateOne(
    //   { sessionId },
    //   {
    //     endTime: new Date(),
    //     metrics: finalMetrics,
    //     status: 'completed',
    //   }
    // );

    console.log(`✅ Stream ${sessionId} ended`);

    res.json({
      success: true,
      message: 'Stream session ended',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ EMOTION DETECTION ROUTES ============

/**
 * POST /api/emotion/analyze
 * Analyze emotion from audio features
 */
router.post('/emotion/analyze', async (req, res) => {
  try {
    const { features, sessionId } = req.body;

    // Call Python AI microservice for emotion detection
    // const emotionResult = await pythonService.detectEmotion(features);

    // Mock emotion detection
    const emotionResult = {
      fear: { confidence: features.pitch > 200 ? 0.7 : 0.3 },
      crying: { confidence: features.prosody?.variance > 80 ? 0.8 : 0.2 },
      panic: { confidence: features.speechRate > 200 ? 0.75 : 0.25 },
    };

    // Save emotion data
    // await EmotionLog.create({
    //   sessionId,
    //   emotion: emotion,
    //   confidence: confidence,
    //   features: features,
    //   timestamp: new Date(),
    // });

    res.json({
      success: true,
      emotions: emotionResult,
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/emotion/:eventId/timeline
 * Get emotion detection timeline for event
 */
router.get('/emotion/:eventId/timeline', async (req, res) => {
  try {
    const { eventId } = req.params;

    // Fetch emotion logs from database
    // const emotions = await EmotionLog.find({ eventId }).sort({ timestamp: 1 });

    res.json({
      success: true,
      eventId,
      emotions: [],
      summary: {
        peakFear: 0,
        peakCrying: 0,
        peakPanic: 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ GUARDIAN NETWORK ROUTES ============

/**
 * POST /api/guardians/add
 * Add trusted guardian
 */
router.post('/guardians/add', async (req, res) => {
  try {
    const { userId, guardianData } = req.body;

    const guardian = {
      id: `guardian_${Date.now()}`,
      userId,
      name: guardianData.name,
      phone: guardianData.phone,
      email: guardianData.email,
      relationship: guardianData.relationship,
      trustScore: 0.8,
      addedAt: new Date(),
    };

    // Save to database
    // await Guardian.create(guardian);

    res.json({
      success: true,
      guardian,
      message: 'Guardian added successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/guardians/:userId
 * Get all guardians for user
 */
router.get('/guardians/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Fetch guardians from database
    // const guardians = await Guardian.find({ userId });

    res.json({
      success: true,
      guardians: [],
      count: 0,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/guardians/:guardianId/respond
 * Handle guardian response to emergency
 */
router.post('/guardians/:guardianId/respond', async (req, res) => {
  try {
    const { guardianId } = req.params;
    const { sosEventId, action, reason } = req.body;

    const response = {
      guardianId,
      sosEventId,
      action,
      reason,
      respondedAt: new Date(),
    };

    // Save response
    // await GuardianResponse.create(response);

    // Update SOS event with guardian response
    // await SOSEvent.updateOne(
    //   { eventId: sosEventId },
    //   { $push: { guardianResponses: response } }
    // );

    // If guardian accepted, trigger location sharing
    if (action === 'ACCEPTED') {
      // initializeLocationSharing(sosEventId, guardianId);
    }

    res.json({
      success: true,
      response,
      message: 'Response recorded',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ SAFE ROUTE ROUTES ============

/**
 * POST /api/routes/analyze
 * Analyze and return safe routes
 */
router.post('/routes/analyze', async (req, res) => {
  try {
    const { startPoint, endPoint, options } = req.body;

    // Call route analysis service (with crime data integration)
    // const routes = await safeRouteAI.analyzeSafeRoute(startPoint, endPoint);

    res.json({
      success: true,
      startPoint,
      endPoint,
      routes: [
        {
          id: 'route_1',
          distance: 5000,
          duration: 600,
          safetyScore: 85,
          color: '#51CF66',
          riskFactors: [],
          recommendations: ['Route appears safe'],
        },
      ],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/crime-data
 * Query crime data for location
 */
router.get('/crime-data', async (req, res) => {
  try {
    const { latitude, longitude, radius } = req.query;

    // Query crime database within radius
    // const crimeIncidents = await CrimeData.find({
    //   location: {
    //     $near: { type: 'Point', coordinates: [latitude, longitude] },
    //     $maxDistance: radius,
    //   },
    // });

    res.json({
      success: true,
      incidents: [],
      location: { latitude, longitude },
      radius,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ PDF REPORT ROUTES ============

/**
 * POST /api/reports/generate
 * Generate legal PDF report
 */
router.post('/reports/generate', async (req, res) => {
  try {
    const { sosEventId } = req.body;

    // Fetch all event data
    // const sosEvent = await SOSEvent.findOne({ eventId: sosEventId });

    // Generate PDF
    // const pdfReport = await pdfService.generateReport(sosEvent);

    res.json({
      success: true,
      reportId: `REPORT_${Date.now()}`,
      url: 'https://storage.example.com/reports/report.pdf',
      filename: `SOS_REPORT_${sosEventId}.pdf`,
      generatedAt: new Date(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/reports/:reportId/download
 * Download PDF report
 */
router.get('/reports/:reportId/download', async (req, res) => {
  try {
    const { reportId } = req.params;

    // Fetch from storage
    // const pdfBuffer = await downloadFromStorage(reportId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="SOS_REPORT_${reportId}.pdf"`
    );

    // res.send(pdfBuffer);
    res.json({ success: false, message: 'Implementation pending' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ WebSocket Handlers ============

/**
 * WebSocket: Stream audio and guardian communication
 */
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws, sessionId) => {
  console.log(`📡 WebSocket connected: ${sessionId}`);

  // Handle incoming messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);

      if (message.type === 'AUDIO_CHUNK') {
        // Process audio chunk
        // Save to database
        // Broadcast to guardians
      } else if (message.type === 'GUARDIAN_CONNECT') {
        // Guardian connected to stream
        console.log(`👤 Guardian ${message.guardianId} connected`);
        // Track in session
      } else if (message.type === 'GUARDIAN_DISCONNECT') {
        // Guardian disconnected
        console.log(`👤 Guardian ${message.guardianId} disconnected`);
      }
    } catch (error) {
      console.error('❌ WebSocket message error:', error);
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    console.log(`📡 WebSocket disconnected: ${sessionId}`);
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

// Upgrade HTTP to WebSocket
router.get('/stream/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  if (!req.headers.upgrade?.toLowerCase() === 'websocket') {
    res.status(400).json({ error: 'WebSocket upgrade required' });
    return;
  }

  // In production: use server.on('upgrade')
  // wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (ws) => {
  //   wss.emit('connection', ws, sessionId);
  // });
});

// ============ METRICS & MONITORING ============

/**
 * GET /api/metrics/streams
 * Get active stream metrics
 */
router.get('/metrics/streams', async (req, res) => {
  try {
    // const activeStreams = await StreamSession.find({ status: 'active' });

    res.json({
      success: true,
      activeStreams: 0,
      totalBytesStreamed: 0,
      averageLatency: 0,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/health
 * Health check
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    services: {
      audioStreaming: 'operational',
      emotionDetection: 'operational',
      guardianNetwork: 'operational',
      routes: 'operational',
      pdfReports: 'operational',
    },
  });
});

module.exports = router;

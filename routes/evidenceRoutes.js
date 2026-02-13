/**
 * SOS Evidence API Routes
 * Backend endpoints for uploading, storing, and retrieving evidence files
 * Handles encrypted chunked uploads, metadata, and cloud storage integration
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const authenticateToken = require('../middleware/auth');
const Evidence = require('../models/SOSEvidence');
const SOSEvent = require('../models/SOS');
const User = require('../models/User');

// Multer setup for temporary chunk uploads
const upload = multer({
  dest: path.join(__dirname, '../uploads/chunks/'),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB per chunk
  },
});

/**
 * POST /api/sos-evidence/upload-chunk
 * Upload evidence file chunk (part of larger file)
 */
router.post(
  '/upload-chunk',
  authenticateToken,
  upload.single('chunk'),
  async (req, res) => {
    try {
      const { uploadId, recordingId, fileType, chunkIndex, totalChunks } = req.body;
      const userId = req.user.id;

      if (!uploadId || !recordingId || !fileType || chunkIndex === undefined) {
        return res.status(400).json({
          error: 'Missing required fields: uploadId, recordingId, fileType, chunkIndex',
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No chunk file provided' });
      }

      // Create upload tracking directory
      const uploadDir = path.join(
        __dirname,
        '../uploads/evidence/',
        uploadId
      );
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Move chunk to upload directory with sequential naming
      const chunkPath = path.join(uploadDir, `${fileType}_chunk_${chunkIndex}`);
      fs.renameSync(req.file.path, chunkPath);

      // Track upload progress
      const progressFile = path.join(uploadDir, 'progress.json');
      let progress = {};
      if (fs.existsSync(progressFile)) {
        progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
      }

      if (!progress[fileType]) {
        progress[fileType] = {
          uploadedChunks: 0,
          totalChunks: parseInt(totalChunks),
        };
      }

      progress[fileType].uploadedChunks = parseInt(chunkIndex) + 1;
      fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));

      res.json({
        success: true,
        uploadId,
        recordingId,
        fileType,
        chunkIndex: parseInt(chunkIndex),
        totalChunks: parseInt(totalChunks),
        progress,
      });
    } catch (error) {
      console.error('❌ Chunk upload failed:', error);
      res.status(500).json({ error: 'Chunk upload failed', details: error.message });
    }
  }
);

/**
 * POST /api/sos-evidence/finalize-upload
 * Finalize upload by assembling chunks and storing metadata
 */
router.post('/finalize-upload', authenticateToken, async (req, res) => {
  try {
    const { uploadId, recordingId, metadata } = req.body;
    const userId = req.user.id;

    if (!uploadId || !recordingId || !metadata) {
      return res.status(400).json({
        error: 'Missing required fields: uploadId, recordingId, metadata',
      });
    }

    const uploadDir = path.join(__dirname, '../uploads/evidence/', uploadId);

    if (!fs.existsSync(uploadDir)) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    // Read progress to verify all chunks received
    const progressFile = path.join(uploadDir, 'progress.json');
    const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));

    // Verify all chunks for all file types
    for (const [fileType, fileProgress] of Object.entries(progress)) {
      if (fileProgress.uploadedChunks !== fileProgress.totalChunks) {
        return res.status(400).json({
          error: `Incomplete upload for ${fileType}. Received ${fileProgress.uploadedChunks}/${fileProgress.totalChunks} chunks`,
        });
      }
    }

    // Assemble chunks into final files
    const assembledFiles = {};
    const fileUrls = {};

    for (const [fileType, fileProgress] of Object.entries(progress)) {
      try {
        const finalFilePath = path.join(uploadDir, `${fileType}_final.enc`);
        const writeStream = fs.createWriteStream(finalFilePath);

        // Assemble chunks in order
        for (let i = 0; i < fileProgress.totalChunks; i++) {
          const chunkPath = path.join(uploadDir, `${fileType}_chunk_${i}`);
          const chunkData = fs.readFileSync(chunkPath);
          writeStream.write(chunkData);
          // Delete chunk after writing
          fs.unlinkSync(chunkPath);
        }

        writeStream.end();

        assembledFiles[fileType] = finalFilePath;

        // Generate cloud URL (placeholder - implement actual cloud upload)
        fileUrls[fileType] = `https://smartsensry-backend.herokuapp.com/api/sos-evidence/${recordingId}/${fileType}`;
      } catch (error) {
        console.error(`Failed to assemble ${fileType}:`, error);
      }
    }

    // Create SOS Evidence record
    const evidence = new Evidence({
      recordingId,
      userId,
      timestamp: metadata.timestamp,
      duration: metadata.duration,
      startTime: metadata.startTime,
      encryptionIv: metadata.encryptionIv || crypto.randomBytes(16).toString('hex'),
      fileSizes: metadata.fileSizes,
      frontVideoUrl: fileUrls.frontVideo,
      backVideoUrl: fileUrls.backVideo,
      audioUrl: fileUrls.audioRecording,
      uploadStatus: 'completed',
      uploadedAt: new Date(),
      cloudStorageStatus: 'pending', // Will be updated after cloud upload
    });

    await evidence.save();

    // Update or create SOS Event
    const sosEvent = await SOSEvent.findOneAndUpdate(
      { recordingId },
      {
        recordingId,
        userId,
        timestamp: metadata.timestamp,
        status: metadata.status || 'confirmed',
        location: metadata.location,
        evidence: evidence._id,
      },
      { upsert: true, new: true }
    );

    // Add evidence to user's SOS history
    await User.findByIdAndUpdate(userId, {
      $push: { sosHistory: sosEvent._id },
    });

    // Clean up upload directory
    setTimeout(() => {
      if (fs.existsSync(uploadDir)) {
        fs.rmSync(uploadDir, { recursive: true });
      }
    }, 5000);

    res.json({
      success: true,
      message: 'Evidence uploaded successfully',
      evidenceId: evidence._id,
      recordingId,
      urls: fileUrls,
      uploadId,
    });
  } catch (error) {
    console.error('❌ Finalize upload failed:', error);
    res.status(500).json({
      error: 'Failed to finalize upload',
      details: error.message,
    });
  }
});

/**
 * GET /api/sos-evidence/:recordingId
 * Get evidence metadata and download URLs (with signed URLs for cloud storage)
 */
router.get('/:recordingId', authenticateToken, async (req, res) => {
  try {
    const { recordingId } = req.params;
    const userId = req.user.id;

    const evidence = await Evidence.findOne({ recordingId });

    if (!evidence) {
      return res.status(404).json({ error: 'Evidence not found' });
    }

    // Verify user owns this evidence
    if (evidence.userId.toString() !== userId) {
      return res.status(403).json({
        error: 'Access denied - not your evidence',
      });
    }

    // Generate signed URLs (placeholder implementation)
    const signedUrls = {
      frontVideo: evidence.frontVideoUrl
        ? `${evidence.frontVideoUrl}?token=${_generateSignedToken(recordingId, 'frontVideo', 3600)}`
        : null,
      backVideo: evidence.backVideoUrl
        ? `${evidence.backVideoUrl}?token=${_generateSignedToken(recordingId, 'backVideo', 3600)}`
        : null,
      audio: evidence.audioUrl
        ? `${evidence.audioUrl}?token=${_generateSignedToken(recordingId, 'audio', 3600)}`
        : null,
    };

    res.json({
      success: true,
      evidence: {
        recordingId: evidence.recordingId,
        timestamp: evidence.timestamp,
        duration: evidence.duration,
        fileSizes: evidence.fileSizes,
        urls: signedUrls,
        uploadStatus: evidence.uploadStatus,
        uploadedAt: evidence.uploadedAt,
      },
    });
  } catch (error) {
    console.error('❌ Failed to get evidence:', error);
    res.status(500).json({
      error: 'Failed to retrieve evidence',
      details: error.message,
    });
  }
});

/**
 * GET /api/sos-events
 * Get user's SOS event history (secure - user owner only)
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, skip = 0 } = req.query;

    const events = await SOSEvent.find({ userId })
      .populate('evidence')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await SOSEvent.countDocuments({ userId });

    res.json({
      success: true,
      events: events.map((event) => ({
        id: event._id,
        recordingId: event.recordingId,
        timestamp: event.timestamp,
        status: event.status,
        location: event.location,
        evidence: event.evidence
          ? {
              recordingId: event.evidence.recordingId,
              duration: event.evidence.duration,
              frontVideoUrl: event.evidence.frontVideoUrl,
              backVideoUrl: event.evidence.backVideoUrl,
              audioUrl: event.evidence.audioUrl,
            }
          : null,
        notes: event.notes,
      })),
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: parseInt(skip) + parseInt(limit) < total,
      },
    });
  } catch (error) {
    console.error('❌ Failed to get SOS events:', error);
    res.status(500).json({
      error: 'Failed to retrieve SOS history',
      details: error.message,
    });
  }
});

/**
 * GET /api/sos-events/:eventId
 * Get single SOS event details (read-only for user)
 */
router.get('/events/:eventId', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    const event = await SOSEvent.findById(eventId).populate('evidence');

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Verify user owns this event
    if (event.userId.toString() !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      success: true,
      event: {
        id: event._id,
        recordingId: event.recordingId,
        timestamp: event.timestamp,
        status: event.status,
        location: event.location,
        evidence: event.evidence,
        notes: event.notes,
        contacts_notified: event.contacts_notified,
      },
    });
  } catch (error) {
    console.error('❌ Failed to get SOS event:', error);
    res.status(500).json({
      error: 'Failed to retrieve event',
      details: error.message,
    });
  }
});

/**
 * DELETE /api/sos-events/:eventId
 * Prevent deletion of SOS events (for legal compliance)
 */
router.delete('/events/:eventId', authenticateToken, (req, res) => {
  res.status(403).json({
    error: 'Access denied',
    message: 'SOS events cannot be deleted for legal evidence preservation',
  });
});

/**
 * Helper: Generate signed token for file download
 */
function _generateSignedToken(recordingId, fileType, expiresIn = 3600) {
  const payload = {
    recordingId,
    fileType,
    issuedAt: Date.now(),
    expiresAt: Date.now() + expiresIn * 1000,
  };

  const signature = crypto
    .createHmac('sha256', process.env.JWT_SECRET || 'default-secret')
    .update(JSON.stringify(payload))
    .digest('hex');

  return Buffer.from(JSON.stringify({ ...payload, signature })).toString('base64');
}

// Upload evidence files
router.post('/upload', authenticateToken, upload.array('evidence', 10), async (req, res) => {
  try {
    const { sosId, type, latitude, longitude, placeName } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No evidence files provided' });
    }

    // Process and store files in MongoDB
    const uploadedFiles = [];
    const fileHashes = [];

    for (const file of req.files) {
      try {
        // Read file as base64 for storage in MongoDB
        const fileBuffer = fs.readFileSync(file.path);
        const base64Data = fileBuffer.toString('base64');

        // Calculate file hash for tamper protection
        const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        fileHashes.push(fileHash);

        // Generate secure URL for access (could be a signed URL or internal route)
        const secureUrl = `/api/evidence/file/${crypto.randomBytes(16).toString('hex')}`;

        uploadedFiles.push({
          type: getEvidenceType(file.mimetype),
          filename: file.originalname,
          data: base64Data, // Store base64 data in MongoDB
          secureUrl: secureUrl,
          size: file.size,
          mimeType: file.mimetype,
        });

        // Clean up temporary file
        fs.unlinkSync(file.path);

      } catch (fileError) {
        console.error('File processing error:', fileError);
        // Clean up temporary file on error
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        throw fileError;
      }
    }

    // Create evidence record
    const evidence = new SOSEvidence({
      userId: req.user.id,
      sosId,
      type,
      location: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        placeName,
      },
      evidenceFiles: uploadedFiles,
      deviceInfo: {
        deviceId: req.body.deviceId,
        os: req.body.os,
        appVersion: req.body.appVersion,
      },
    });

    // Generate hash for tamper protection
    evidence.hash = crypto.createHash('sha256').update(fileHashes.join('')).digest('hex');

    await evidence.save();

    res.json({
      message: 'Evidence uploaded successfully',
      evidence: {
        id: evidence._id,
        files: evidence.evidenceFiles.map(f => ({
          type: f.type,
          filename: f.filename,
          secureUrl: f.secureUrl,
          size: f.size,
        })),
        hash: evidence.hash,
      },
    });
  } catch (error) {
    console.error('Evidence upload error:', error);

    // Clean up any remaining temporary files
    if (req.files) {
      req.files.forEach(file => {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (cleanupError) {
          console.error('Error cleaning up file:', cleanupError);
        }
      });
    }

    res.status(500).json({ message: 'Server error' });
  }
});

// Get all evidence for current user
router.get('/user/all', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    // Fetch evidence for current user
    const evidence = await SOSEvidence.find({ userId: req.user.id })
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(skip)
      .populate('sosId', 'type location timestamp status')
      .exec();

    // Get total count
    const totalCount = await SOSEvidence.countDocuments({ userId: req.user.id });

    // Format response without base64 data (too large)
    const formattedEvidence = evidence.map(ev => ({
      id: ev._id,
      sosId: ev.sosId,
      type: ev.type,
      timestamp: ev.timestamp,
      location: ev.location,
      files: ev.evidenceFiles.map(f => ({
        type: f.type,
        filename: f.filename,
        mimeType: f.mimeType,
        size: f.size,
        secureUrl: f.secureUrl,
      })),
      sharedWith: ev.sharedWith,
    }));

    res.json({
      success: true,
      data: formattedEvidence,
      pagination: {
        total: totalCount,
        page: page,
        limit: limit,
        pages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Get user evidence error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get evidence for a specific SOS
router.get('/sos/:sosId', authenticateToken, async (req, res) => {
  try {
    const evidence = await SOSEvidence.find({
      sosId: req.params.sosId,
      userId: req.user.id,
    }).sort({ createdAt: -1 });

    res.json({ evidence });
  } catch (error) {
    console.error('Get evidence error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Share evidence with authorities
router.put('/:evidenceId/share', authenticateToken, async (req, res) => {
  try {
    const { shareWith } = req.body; // ['police', 'family', 'emergency_services']

    const evidence = await SOSEvidence.findOne({
      _id: req.params.evidenceId,
      userId: req.user.id,
    });

    if (!evidence) {
      return res.status(404).json({ message: 'Evidence not found' });
    }

    // Add sharing records
    const shareRecords = shareWith.map(type => ({
      type,
      sharedAt: new Date(),
    }));

    evidence.sharedWith.push(...shareRecords);
    await evidence.save();

    res.json({
      message: 'Evidence shared successfully',
      sharedWith: evidence.sharedWith,
    });
  } catch (error) {
    console.error('Share evidence error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper functions
function getEvidenceType(mimetype) {
  if (mimetype.startsWith('video/')) return 'video_front'; // Default to front camera
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.startsWith('image/')) return 'photo';
  return 'unknown';
}

function generateSecureUrl(filename) {
  // In production, this would generate a signed URL from Firebase Storage / AWS S3
  // For now, return a placeholder secure URL
  const token = crypto.randomBytes(32).toString('hex');
  return `https://secure.evidence.smartsensrty.com/${filename}?token=${token}`;
}

async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// Get evidence file by secure URL token
router.get('/file/:token', authenticateToken, async (req, res) => {
  try {
    const { token } = req.params;

    // Find evidence containing this file
    const evidence = await SOSEvidence.findOne({
      'evidenceFiles.secureUrl': `/api/evidence/file/${token}`,
      userId: req.user.id,
    });

    if (!evidence) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Find the specific file
    const file = evidence.evidenceFiles.find(f => f.secureUrl === `/api/evidence/file/${token}`);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Convert base64 back to buffer and serve
    const fileBuffer = Buffer.from(file.data, 'base64');

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Length', fileBuffer.length);

    res.send(fileBuffer);

  } catch (error) {
    console.error('File retrieval error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
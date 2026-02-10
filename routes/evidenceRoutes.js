const express = require('express');
const router = express.Router();
const SOSEvidence = require('../models/SOSEvidence');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Configure multer for evidence uploads
const evidenceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/evidence');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `evidence_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const evidenceUpload = multer({
  storage: evidenceStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/avi', 'audio/mpeg', 'audio/wav', 'image/jpeg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Upload evidence files
router.post('/upload', authenticateToken, evidenceUpload.array('evidence', 10), async (req, res) => {
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
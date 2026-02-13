require('dotenv').config();

console.log('🔑 JWT_SECRET loaded:', process.env.JWT_SECRET ? 'Present' : 'Missing');
console.log('🔑 JWT_SECRET value:', process.env.JWT_SECRET);

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const passport = require('passport');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Import auth components
require('./config/passport');
const authRoutes = require('./routes/authRoutes');
const volunteerRoutes = require('./routes/volunteerRoutes');
const evidenceRoutes = require('./routes/evidenceRoutes');
const advancedSOSRoutes = require('./routes/advancedSOSRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// Allow local dev frontend and production frontend (set FRONTEND_URL in Render env)
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
// Set ALLOW_ALL_ORIGINS=true in env to allow all origins (useful for quick testing).
const ALLOW_ALL_ORIGINS = process.env.ALLOW_ALL_ORIGINS === 'true';

const corsOptions = {
  origin: function (origin, callback) {
    // Allow non-browser/native requests (no origin) and when ALLOW_ALL_ORIGINS is true
    if (!origin || ALLOW_ALL_ORIGINS) return callback(null, true);

    const allowed = [
      'http://localhost:3000',
      FRONTEND_URL,
      // Allow React Native development connections (any port)
      /^http:\/\/192\.168\.\d+\.\d+(?::\d+)?$/,
      /^http:\/\/10\.0\.\d+\.\d+(?::\d+)?$/,
      /^http:\/\/172\.\d+\.\d+\.\d+(?::\d+)?$/,
    ];

    for (const a of allowed) {
      if (typeof a === 'string' && a === origin) return callback(null, true);
      if (a instanceof RegExp && a.test(origin)) return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PROFILE_UPLOAD_DIR = path.join(UPLOADS_DIR, 'profile_images');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(PROFILE_UPLOAD_DIR)) fs.mkdirSync(PROFILE_UPLOAD_DIR);

// Serve uploaded files statically
app.use('/uploads', express.static(UPLOADS_DIR));

// Multer setup for profile image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, PROFILE_UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${req.user || 'anon'}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// Session middleware for Passport
app.use(
  session({
    secret: process.env.JWT_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true },
  })
);

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smartsensrty')
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Import User model
const User = require('./models/User');
// Import Contact model
const Contact = require('./models/Contact');

// ✅ PASSPORT GOOGLE OAUTH ROUTES
app.use('/auth', authRoutes);

// ✅ VOLUNTEER NETWORK ROUTES
app.use('/api/volunteers', volunteerRoutes);

// ✅ EVIDENCE MANAGEMENT ROUTES
app.use('/api/evidence', evidenceRoutes);

// ✅ ADVANCED SOS ROUTES
app.use('/api/sos', advancedSOSRoutes);

// ✅ LEGACY GOOGLE OAUTH TOKEN VERIFICATION (SECURITY CRITICAL)
// Verify Google ID token and create/update user
app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: 'ID token required' });
    }

    // Verify token with Google
    const response = await axios.get(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
    );

    const { email, name, picture } = response.data;

    if (!email) {
      return res.status(400).json({ message: 'Invalid token' });
    }

    // Find or create user
    let user = await User.findOne({ email });

    if (!user) {
      // Create new user from Google data
      user = new User({
        name: name || email.split('@')[0],
        email,
        mobile: '', // Required but empty - user fills later
        password: 'GOOGLE_AUTH', // Placeholder for OAuth users
        profileImage: picture,
      });
      await user.save();
    } else {
      // Update existing user's profile image if available
      if (picture && !user.profileImage) {
        user.profileImage = picture;
        await user.save();
      }
    }

    // Generate JWT for your app
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Google sign-in successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        profileImage: user.profileImage,
      },
    });
  } catch (error) {
    console.error('Google token verification error:', error.message);
    res.status(401).json({ message: 'Invalid Google token' });
  }
});

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, mobile, address, password, profileImage } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = new User({
      name,
      email,
      mobile,
      address,
      password: hashedPassword,
      profileImage,
    });

    await user.save();

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        address: user.address,
        profileImage: user.profileImage,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        address: user.address,
        profileImage: user.profileImage,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Middleware to verify JWT
const auth = (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');

    if (!authHeader) {
      console.log('❌ No Authorization header provided');
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    if (!authHeader.startsWith('Bearer ')) {
      console.log('❌ Authorization header does not start with Bearer');
      return res.status(401).json({ message: 'Invalid token format. Expected: Bearer <token>' });
    }

    // Extract token from "Bearer <token>" format
    const token = authHeader.slice(7).trim();
    console.log('🔍 Extracted token:', token.substring(0, 20) + '...');

    if (!token) {
      console.log('❌ Empty token after Bearer');
      return res.status(401).json({ message: 'Empty token provided' });
    }

    const secret = process.env.JWT_SECRET || 'your-secret-key';
    console.log('🔑 Using JWT secret:', secret);
    console.log('🔑 Secret from env:', process.env.JWT_SECRET);
    console.log('🔑 Using fallback:', !process.env.JWT_SECRET);

    // Verify the token
    const decoded = jwt.verify(token, secret);
    console.log('✅ Token decoded successfully:', decoded);

    if (!decoded.userId) {
      console.log('❌ Token does not contain userId');
      return res.status(401).json({ message: 'Invalid token structure' });
    }

    req.user = decoded.userId;
    console.log('✅ Token verified for user:', req.user);
    next();

  } catch (error) {
    console.error('❌ JWT verification error:', error.message);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token has expired' });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token signature' });
    } else {
      return res.status(401).json({ message: 'Token verification failed' });
    }
  }
};

// Profile route
app.get('/api/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user).select('-password');
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update profile route
// Updated profile route: accepts JSON updates, multipart form uploads (field `profileImage`),
// or base64 `profileImage` in JSON body. Saves uploaded file to /uploads/profile_images and
// stores the public URL path in `profileImage` field on the User.
app.put('/api/profile', auth, upload.single('profileImage'), async (req, res) => {
  try {
    let { name, email, mobile, address } = req.body || {};

    // If a file was uploaded via multipart/form-data, set profileImage to its public path
    if (req.file) {
      const publicPath = `/uploads/profile_images/${path.basename(req.file.path)}`;
      // attach to update object
      req.body.profileImage = publicPath;
    }

    // Support base64 data URL in JSON body: req.body.profileImage can be a data:* string
    if (req.body && typeof req.body.profileImage === 'string' && req.body.profileImage.startsWith('data:')) {
      const matches = req.body.profileImage.match(/^data:(.+);base64,(.+)$/);
      if (matches) {
        const mime = matches[1];
        const ext = mime.split('/').pop() || 'jpg';
        const data = matches[2];
        const buffer = Buffer.from(data, 'base64');
        const filename = `${req.user || 'anon'}_${Date.now()}.${ext}`;
        const filepath = path.join(PROFILE_UPLOAD_DIR, filename);
        fs.writeFileSync(filepath, buffer);
        req.body.profileImage = `/uploads/profile_images/${filename}`;
      }
    }

    // Check if email is already taken by another user
    if (email) {
      const existingUser = await User.findOne({ email, _id: { $ne: req.user } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    const updatePayload = {};
    if (name !== undefined) updatePayload.name = name;
    if (email !== undefined) updatePayload.email = email;
    if (mobile !== undefined) updatePayload.mobile = mobile;
    if (address !== undefined) updatePayload.address = address;
    if (req.body && req.body.profileImage) updatePayload.profileImage = req.body.profileImage;

    const updatedUser = await User.findByIdAndUpdate(
      req.user,
      updatePayload,
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Placeholder routes for other APIs
app.get('/api/contacts', auth, async (req, res) => {
  try {
    const contacts = await Contact.find({ userId: req.user });
    res.json(contacts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/contacts', auth, async (req, res) => {
  try {
    const { name, relation, phone } = req.body;
    const contact = new Contact({
      userId: req.user,
      name,
      relation,
      phone,
    });
    await contact.save();
    res.status(201).json(contact);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/contacts/:id', auth, async (req, res) => {
  try {
    const { name, relation, phone } = req.body;
    const contact = await Contact.findOneAndUpdate(
      { _id: req.params.id, userId: req.user },
      { name, relation, phone },
      { new: true }
    );
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }
    res.json(contact);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/contacts/:id', auth, async (req, res) => {
  try {
    const contact = await Contact.findOneAndDelete({ _id: req.params.id, userId: req.user });
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }
    res.json({ message: 'Contact deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Chat route for Mistral AI
app.post('/api/chat', auth, async (req, res) => {
  try {
    const { message, context } = req.body;
    
    // Prepare the prompt for Mistral AI with safety context
    const systemPrompt = `You are Smart Sentry, an AI safety assistant for a personal safety app. 
    Your role is to provide helpful, accurate information about personal safety, emergency procedures, and app features.
    
    Key guidelines:
    - Always prioritize user safety
    - Provide clear, actionable advice for emergencies
    - Be empathetic and supportive
    - Reference app features when relevant (SOS, trusted contacts, location sharing)
    - If user is in immediate danger, urge them to use SOS feature
    - Keep responses concise but informative
    - Use the provided context about user's profile and contacts when relevant
    
    User context: ${JSON.stringify(context)}
    `;
    
    const response = await axios.post('https://api.mistral.ai/v1/chat/completions', {
      model: 'mistral-medium',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      max_tokens: 500,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    const aiResponse = response.data.choices[0].message.content;
    
    res.json({
      response: aiResponse,
      offline: false,
      model: 'mistral-ai'
    });
  } catch (error) {
    console.error('Mistral API error:', error.response?.data || error.message);
    res.status(500).json({ 
      response: "I'm having trouble connecting right now. For emergencies, please use the SOS feature.",
      offline: true,
      model: 'fallback'
    });
  }
});

app.post('/api/sos/start', auth, async (req, res) => {
  try {
    const { type, location, timestamp, evidence, silent, coordinates } = req.body;

    // Create SOS record
    const SOS = require('./models/SOS');
    const sosRecord = new SOS({
      userId: req.user.userId,
      type: type || 'manual',
      location: location || 'Unknown location',
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      evidence,
      silent: silent || false,
      coordinates,
      status: 'active'
    });

    await sosRecord.save();

    console.log(`🚨 SOS logged for user ${req.user.userId}: ${type} at ${location}`);

    res.json({
      message: 'SOS logged successfully',
      sosId: sosRecord._id,
      status: 'active'
    });
  } catch (error) {
    console.error('Error logging SOS:', error);
    res.status(500).json({ message: 'Failed to log SOS', error: error.message });
  }
});

// Get SOS history for current user
// NOTE: Route is now defined in advancedSOSRoutes.js and mounted at /api/sos
// This prevents route conflicts and keeps code organized

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);\n  console.log(`📱 Accessible from Android device at: http://192.168.1.4:${PORT}`);\n  console.log(`💻 Accessible from PC at: http://localhost:${PORT}`);\n  console.log(`🌐 Render URL: https://smartsensrty-backend.onrender.com`);\n  console.log(`📡 API Base: https://smartsensrty-backend.onrender.com/api`);\n});
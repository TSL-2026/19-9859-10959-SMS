require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const pool = require('./src/db/pool');

const app = express();
const PORT = process.env.PORT || 3000;

// Route-specific CSP
app.use((req, res, next) => {
  if (req.path === '/' || req.path.startsWith('/demo') || req.path.startsWith('/report') || req.path.startsWith('/dashboard/') || req.path.startsWith('/dev/')) {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "connect-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
      "img-src 'self' data: https:; " +
      "font-src 'self' data: https://fonts.gstatic.com; " +
      "object-src 'none'"
    );
  } else {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self'; " +
      "img-src 'self' data:; " +
      "connect-src 'self'"
    );
  }
  next();
});

// Security headers (handwriting CSP above instead)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', message: err.message });
  }
});

// API routes
app.use('/api', require('./src/api/routes'));
app.use('/api/regulator', require('./src/api/routes/regulator'));
app.use('/api/just-culture', require('./src/api/routes/justCulture'));
app.use('/api', require('./src/api/routes/workflow'));
app.use('/dev', require('./src/api/routes/dev'));

// Demo portal (before / to ensure it matches first)
app.use('/demo', require('./src/api/routes/demo'));

// Quick Report page
app.use('/report', require('./src/api/routes/report'));

// Landing page
app.use('/', require('./src/api/routes/landing'));

// Dashboard route
app.get('/dashboard/regulator/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard', 'regulator', 'index.html'));
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Start server only if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Landing page: http://localhost:${PORT}`);
    console.log(`Demo portal:  http://localhost:${PORT}/demo`);
    console.log(`Dev console:  http://localhost:${PORT}/dev/dashboard`);
    console.log(`Quick report: http://localhost:${PORT}/report`);
  });
}

module.exports = { app, pool };

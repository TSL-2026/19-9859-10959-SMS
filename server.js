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
  if (req.path.startsWith('/dashboard/')) {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
      "style-src 'self' 'unsafe-inline'; " +
      "connect-src 'self' https://; " +
      "img-src 'self' data: https://; " +
      "font-src 'self' data:; " +
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
    console.log(`Dashboard: http://localhost:${PORT}/dashboard/regulator/?token=YOUR_TOKEN`);
  });
}

module.exports = { app, pool };

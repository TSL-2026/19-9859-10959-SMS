const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;

    if (!payload.tenant_id) {
      return res.status(403).json({ error: 'Token missing tenant_id' });
    }

    req.tenant_id = payload.tenant_id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    req.user = null;
    req.tenant_id = null;
    return next();
  }

  const token = header.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    req.tenant_id = payload.tenant_id || null;
  } catch {
    req.user = null;
    req.tenant_id = null;
  }

  next();
}

module.exports = { authenticate, optionalAuth };

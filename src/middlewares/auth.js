const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    req.user = decoded;
    next();
  } catch (_error) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized: Invalid token' });
  }
};

module.exports = { authenticate };

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'taekwondo_manager_secret_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未提供认证令牌' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, error: '认证令牌无效或已过期' });
  }

  req.user = decoded;
  next();
}

module.exports = { generateToken, verifyToken, authMiddleware, JWT_SECRET };

const jwt = require('jsonwebtoken');
const secretKey = process.env.JWT_SECRET_KEY; // Use a secure secret key

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(403).send({ message: 'No token provided.' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token.split(' ')[1], secretKey); // 'Bearer token'
    req.userId = decoded.githubUserId;
    req.username = decoded.username;
    next();
  } catch (error) {
    return res.status(401).send({ message: 'Unauthorized!' });
  }
};

module.exports = verifyToken;

const jwt = require('jsonwebtoken');
const secretKey = process.env.JWT_SECRET_KEY; // Use a secure secret key

/**
 * Middleware function to verify the authorization token
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The next middleware function
 */
const verifyToken = async (req, res, next) => {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(403).send({ message: 'No token provided.' });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token.split(' ')[1], secretKey); // Extract token from 'Bearer token'
    req.userId = decoded.githubUserId;
    req.username = decoded.username;
    req.accessToken = decoded.accessToken;

    // Check if access token exists
    if (req.accessToken) {
      const { Octokit } = await import('@octokit/rest');
      // Initialize Octokit with the access token
      req.octokit = new Octokit({ auth: req.accessToken });
    }
    next();
  } catch (error) {
    console.log({ error });
    return res.status(401).send({ message: 'Unauthorized!' });
  }
};

module.exports = verifyToken;

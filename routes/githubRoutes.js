const express = require('express');
const router = express.Router();
const githubRoutes = require('../controllers/githubController');
const verifyToken = require('../middleware/auth');  // Middleware to verify JWT

// GitHub OAuth callback route
router.get('/oauth/callback', githubRoutes.githubOAuthCallback);
router.get('/status', verifyToken, githubRoutes.githubStatus);

// Remove GitHub integration
router.delete('/disconnect', verifyToken, githubRoutes.removeIntegration);

module.exports = router;

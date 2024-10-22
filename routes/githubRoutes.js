const express = require('express');
const router = express.Router();
const githubRoutes = require('../controllers/githubController');
const verifyToken = require('../middleware/auth');  // Middleware to verify JWT

// GitHub OAuth callback route
router.get('/oauth/callback', githubRoutes.githubOAuthCallback);
router.get('/status', verifyToken, githubRoutes.githubStatus);
router.get('/organizations', verifyToken, githubRoutes.fetchGithubOrganizations);
router.get('/repos/:org', verifyToken, githubRoutes.fetchRepoOrganizationsByOrg);
router.get('/repo-data/:owner/:repo', verifyToken, githubRoutes.fetchRepoDataByOwnerRepo);
router.post('/orgs-stats', verifyToken, githubRoutes.organizationStats);

// Remove GitHub integration
router.delete('/disconnect', verifyToken, githubRoutes.removeIntegration);

module.exports = router;

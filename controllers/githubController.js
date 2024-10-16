const axios = require('axios');
const GitHubIntegration = require('../models/GitHubIntegration');
const jwt = require('jsonwebtoken');
const secretKey = process.env.JWT_SECRET_KEY; // Use a secure secret key


// OAuth 2 Callback
exports.githubOAuthCallback = async (req, res) => {
  const code = req.query.code;

  // Exchange code for access token
  try {
    const response = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: code
    }, {
      headers: { accept: 'application/json' }
    });

    const { access_token } = response.data;

    // Get user details from GitHub
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `token ${access_token}` }
    });

    const { id, login } = userResponse.data;

    // Check if the user already exists in the database
    let user = await GitHubIntegration.findOne({ githubUserId: id });

    if (!user) {
      // If the user does not exist, create a new entry
      user = new GitHubIntegration({
        githubUserId: id,
        username: login,
        accessToken: access_token,
        connectedAt: new Date()
      });
      await user.save();
    } else {
      // If the user exists, you can optionally update the access token
      user.accessToken = access_token;
      await user.save();
    }

    // Generate a JWT token
    const token = jwt.sign({ githubUserId: id, username: login }, secretKey, {
      expiresIn: '24h' // Token expiration (24 hour)
    });

    res.redirect(`${process.env.APP_URL}success?token=${token}`);
  } catch (err) {
    console.log(err)
    res.redirect(`${process.env.APP_URL}error?error=${err}`);
    // res.status(500).send('OAuth Error');
  }
};

// Remove integration
exports.removeIntegration = async (req, res) => {
  try {
    await GitHubIntegration.deleteOne({ githubUserId: req.userId });
    res.status(200).json({msg: "disconnected successfully"});
  } catch (err) {
    res.status(200).json({msg:'Error removing integration'});
  }
};

exports.githubStatus = async (req, res) => {
  const userId = req.userId

  try {
    // Check if user is connected (exists in the DB)
    const userIntegration = await GitHubIntegration.findOne({ githubUserId: userId });

    if (userIntegration) {
      // User is connected to GitHub
      return res.status(200).json({
        connected: true,
        username: userIntegration.username,
        connectedAt: userIntegration.connectedAt
      });
    } else {
      // User is not connected
      return res.status(200).json({ connected: false });
    }
  } catch (error) {
    console.error('Error checking GitHub connection status:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

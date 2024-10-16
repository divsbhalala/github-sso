const mongoose = require('mongoose');

const githubIntegrationSchema = new mongoose.Schema({
  githubUserId: {
    type: String,
    required: true,
    unique: true  // Ensure that each GitHub user ID is unique
  },
  username: String,
  accessToken: String,
  connectedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('GitHubIntegration', githubIntegrationSchema);

const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
  },
  url: String,
  githubUserId: {
    type: mongoose.Types.ObjectId,
    ref: 'GitHubIntegration'
  }
});

module.exports = mongoose.model('organization', organizationSchema);

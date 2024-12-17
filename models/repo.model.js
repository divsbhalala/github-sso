const mongoose = require('mongoose');

const repoSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
  },
  organizationId: {
    type: mongoose.Types.ObjectId,
    ref: 'organization'
  },
  type: {
    type: String,
  },
  url: {
    type: String,
  }
});

module.exports = mongoose.model('repo', repoSchema);

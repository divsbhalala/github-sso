const mongoose = require('mongoose');

const commitSchema = new mongoose.Schema({
  sha: {
    type: String,
    required: true,
    unique: true,
  },
  commitAuthor: {
    name: String,
    email: String,
    date: String,
  },
  author: {
    id: String,
    name: String,
    avatar_url: String,
  },
  message: String,
  url: String,
  repoId: {
    type: mongoose.Types.ObjectId,
    ref: 'repo',
  },
});

module.exports = mongoose.model('commit', commitSchema);

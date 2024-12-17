const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  url: String,
  state: String,
  title: String,
  user: {
    id: String,
    name: String,
  },
  createdOn: String,
  closedOn: String,
  closedBy: {
    id: String,
    name: String,
  },
  repoId: {
    type: mongoose.Types.ObjectId,
    ref: 'repo',
  },
});

module.exports = mongoose.model('issue', issueSchema);

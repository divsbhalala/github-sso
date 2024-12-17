const mongoose = require('mongoose');

const pullRequestSchema = new mongoose.Schema({
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
  mergedOn: String,
  mergeCommitSha: String,
  head: {
    label: String,
    name: String ,
    sha: String
  },
  base: {
    label: String,
    name: String ,
    sha: String
  },
  repoId: {
    type: mongoose.Types.ObjectId,
    ref: 'repo',
  },
});

module.exports = mongoose.model('pull-request', pullRequestSchema);

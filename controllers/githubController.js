const axios = require('axios');
const GitHubIntegration = require('../models/GitHubIntegration');
const jwt = require('jsonwebtoken');
const secretKey = process.env.JWT_SECRET_KEY; // Use a secure secret key



// Helper function to initialize Octokit with a token
const initializeOctokit = async (token) => {
  const { Octokit } = await import('@octokit/rest');
  return new Octokit({ auth: token });
}

// Helper function for error handling
const handleError = (res, message, error = null) => {
  console.error(message, error);
  return res.status(500).json({ error: message });
};
// OAuth 2 Callback
/**
 * This function handles the OAuth 2 callback from GitHub after a user has
 * authorized the application. It exchanges the authorization code for an
 * access token and uses the access token to fetch the user's details from
 * GitHub. If the user does not exist in the database, a new entry is created.
 * A JSON Web Token (JWT) is generated and returned to the client.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 */
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
    const token = jwt.sign({ githubUserId: id, username: login, accessToken: access_token }, secretKey, {
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
/**
 * This function removes the integration between the user and GitHub.
 * It deletes the corresponding document from the database.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 */
exports.removeIntegration = async (req, res) => {
  try {
    // Delete the document from the database
    await GitHubIntegration.deleteOne({ githubUserId: req.userId });
    // Return a success message
    res.status(200).json({msg: "disconnected successfully"});
  } catch (err) {
    // Return an error message
    res.status(200).json({msg:'Error removing integration'});
  }
};

/**
 * Check the GitHub connection status for an authenticated user
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 */
exports.githubStatus = async (req, res) => {
  const userId = req.userId;

  try {
    // Check if user is connected (exists in the DB)
    const userIntegration = await GitHubIntegration.findOne({ githubUserId: userId });

    if (userIntegration) {
      // User is connected to GitHub
      /**
       * Response format:
       * {
       *   connected: true,
       *   username: string,
       *   connectedAt: Date
       * }
       */
      return res.status(200).json({
        connected: true,
        username: userIntegration.username,
        connectedAt: userIntegration.connectedAt
      });
    } else {
      // User is not connected
      /**
       * Response format:
       * { connected: false }
       */
      return res.status(200).json({ connected: false });
    }
  } catch (error) {
    console.error('Error checking GitHub connection status:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};


// Fetch all organizations for authenticated user
/**
 * Fetches all organizations associated with the authenticated user
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 */
exports.fetchGithubOrganizations = async (req, res) => {
  try {
    // Import the Octokit module

    // Check if access token is present
    if (!req.accessToken) {
      return res.status(404).json({ error: 'Not Found' });
    }

    // Initialize Octokit with the access token
    const octokit = await initializeOctokit(req.accessToken);

    // Request organizations data from GitHub API
    const { data: organizations } = await octokit.request('/user/orgs');


    // Return the organizations data
    res.status(200).json([...organizations]);
  } catch (error) {
    // Handle errors when fetching organizations
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
};

/**
 * Fetch repositories for an organization
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 */
exports.fetchRepoOrganizationsByOrg = async (req, res) => {
  const org = req.params.org;

  // Check if access token is present
  if (!req.accessToken) {
    return res.status(404).json({ error: 'Not Found' });
  }

  // Initialize Octokit with the access token
  const octokit = await initializeOctokit(req.accessToken);

  try {
    // Request repositories data from GitHub API
    const { data: repos } = await octokit.request(`/orgs/${org}/repos`);
    res.status(200).json(repos);
  } catch (error) {
    // Handle errors when fetching repositories
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
};

// Fetch repository data (Commits, Pull Requests, Issues)
// This endpoint takes an `owner` and `repo` parameter and returns the data
// for the specified repository.
/**
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 */
exports.fetchRepoDataByOwnerRepo = async (req, res) => {
  const { owner, repo } = req.params;

  // Check if access token is present
  if (!req.accessToken) {
    return res.status(404).json({ error: 'Not Found' });
  }

  // Initialize Octokit with the access token
  const octokit = await initializeOctokit(req.accessToken);

  try {
    // Request commits data from GitHub API
    const { data: commits } = await octokit.request(`/repos/${owner}/${repo}/commits`);
    // Request pull requests data from GitHub API
    const { data: pullRequests } = await octokit.request(`/repos/${owner}/${repo}/pulls`);
    // Request issues data from GitHub API
    const { data: issues } = await octokit.request(`/repos/${owner}/${repo}/issues`);
    // Return the repository data
    res.status(200).json({ commits, pullRequests, issues });
  } catch (error) {
    // Handle errors when fetching repository data
    res.status(500).json({ error: 'Failed to fetch repository data' });
  }
};


// Helper function to fetch all paginated data
async function fetchAllData(octokit, url, params) {
  return await octokit.paginate(url, params);
}


async function fetchCommit(octokit, orgId, repoName, userStatsMap={}){
  try {
    const commits = await fetchAllData(octokit, 'GET /repos/{org}/{repo}/commits', { org: orgId, repo: repoName, per_page: 100 });
    // Process commits
    commits.forEach(commit => {
      const user = commit.author ? commit.author.login : 'unknown';
      const userId = commit.author ? commit.author.id : '-';
      if (!userStatsMap[user]) {
        userStatsMap[user] = { userId, totalCommits: 0, totalPRs: 0, totalIssues: 0 };
      }
      userStatsMap[user].totalCommits += 1;
      userStatsMap[user].changelog = 0;
    });

    return userStatsMap;
  } catch (e) {
    console.error('Error fetching org commit:', e);
    throw new Error(e)
  }
}


async function fetchPullRequest(octokit, orgId, repoName, userStatsMap={}){
  try {
    const pullRequests = await fetchAllData(octokit, 'GET /repos/{org}/{repo}/pulls', { org: orgId, repo: repoName, state: 'all', per_page: 100 });

    // Process pull requests
    pullRequests.forEach(pr => {
      const user = pr.user.login;
      if (!userStatsMap[user]) {
        userStatsMap[user] = { totalCommits: 0, totalPRs: 0, totalIssues: 0 };
      }
      userStatsMap[user].totalPRs += 1;
      userStatsMap[user].changelog = 0;
    });

    return userStatsMap;
  } catch (e) {
    console.error('Error fetching org pull request:', e);
    throw new Error(e)
  }
}


async function fetchIssues(octokit, orgId, repoName, userStatsMap={}){
  try {
    const issues = await fetchAllData(octokit, 'GET /repos/{org}/{repo}/issues', { org: orgId, repo: repoName, state: 'all', per_page: 100 });

    // Process issues
    issues.forEach(issue => {
      const user = issue.user.login;
      if (!userStatsMap[user]) {
        userStatsMap[user] = { totalCommits: 0, totalPRs: 0, totalIssues: 0 };
      }
      userStatsMap[user].totalIssues += 1;
      userStatsMap[user].changelog = 0;
    });

    await fetchAllChangeLogs(octokit, orgId, repoName, issues, userStatsMap)

    return userStatsMaps;
  } catch (e) {
    console.error('Error fetching org issue:', e);
    throw new Error(e)
  }
}

async function fetchAllChangeLogs(octokit, orgId, repoName, issues=[], userStatsMap={}){
  try {
    await Promise.all(
        issues.map(async (issue) => {
          const [changelog] = await Promise.all([
            fetchAllData(octokit, "GET /repos/{org}/{repo}/issues/{issue_number}/events", {
              org: orgId,
              repo: repoName,
              issue_number: issue.number
            })
          ]);
          const user = issue.user.login;
          userStatsMap[user].changelog += changelog.length;
          return changelog;
        })
    );

  } catch (e) {
    console.error('Error fetching org issues change logs:', e);
    throw new Error(e)
  }
}

/**
 * Fetches and processes organization statistics based on the provided organization IDs.
 * Accumulates data on user commits, pull requests, and issues.
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 */
exports.organizationStats = async (req, res) => {
    const { orgIds } = req.body;

    try {
        let userStatsMap = {}; // To accumulate stats by user

        // Iterate through all organization IDs
        for (const orgId of orgIds) {
            // Fetch repositories for the organization
            const repos = await fetchAllData(req.octokit, 'GET /orgs/{org}/repos', {
                org: orgId,
                per_page: 100
            });

            // Fetch data for each repository (commits, PRs, issues)
            for (const repo of repos) {

              userStatsMap = await fetchCommit(req.octokit, orgId, repo.name, userStatsMap);
              userStatsMap= await fetchPullRequest(req.octokit, orgId, repo.name, userStatsMap);
              userStatsMap= await fetchIssues(req.octokit, orgId, repo.name, userStatsMap);

            }
        }

        const transformedData = Object.keys(userStatsMap).map(user => ({
            user,
            userId: userStatsMap[user].userId,
            totalCommits: userStatsMap[user].totalCommits,
            totalPRs: userStatsMap[user].totalPRs,
            totalIssues: userStatsMap[user].totalIssues,
            changelogs: userStatsMap[user].changelog,
        }));

        // Send accumulated stats to the frontend
        res.json(transformedData);
    } catch (error) {
        console.error('Error fetching org stats:', error);
        res.status(500).json({ error: 'Failed to fetch organization stats' });
    }
};

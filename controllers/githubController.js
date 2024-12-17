const axios = require("axios");
const GitHubIntegration = require("../models/GitHubIntegration");
const jwt = require("jsonwebtoken");
const organizationModel = require("../models/organization.model");
const repoModel = require("../models/repo.model");
const commitModel = require("../models/commit.model");
const pullRequestModel = require("../models/pullRequest.model");
const issuesModel = require("../models/issues.model");
const secretKey = process.env.JWT_SECRET_KEY; // Use a secure secret key

// Helper function to initialize Octokit with a token
const initializeOctokit = async (token) => {
  const { Octokit } = await import("@octokit/rest");
  return new Octokit({ auth: token });
};

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
    const response = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: code,
      },
      {
        headers: { accept: "application/json" },
      }
    );

    const { access_token } = response.data;

    // Get user details from GitHub
    const userResponse = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `token ${access_token}` },
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
        connectedAt: new Date(),
      });
      await user.save();
    } else {
      // If the user exists, you can optionally update the access token
      user.accessToken = access_token;
      await user.save();
    }

    // Generate a JWT token
    const token = jwt.sign(
      { githubUserId: id, username: login, accessToken: access_token },
      secretKey,
      {
        expiresIn: "24h", // Token expiration (24 hour)
      }
    );

    res.redirect(`${process.env.APP_URL}success?token=${token}`);
  } catch (err) {
    console.log(err);
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
    res.status(200).json({ msg: "disconnected successfully" });
  } catch (err) {
    // Return an error message
    res.status(200).json({ msg: "Error removing integration" });
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
    const userIntegration = await GitHubIntegration.findOne({
      githubUserId: userId,
    });

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
        connectedAt: userIntegration.connectedAt,
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
    console.error("Error checking GitHub connection status:", error);
    return res.status(500).json({ error: "Internal Server Error" });
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
      return res.status(404).json({ error: "Not Found" });
    }

    // Initialize Octokit with the access token
    const octokit = await initializeOctokit(req.accessToken);

    // Request organizations data from GitHub API
    const { data: organizations } = await octokit.request("/user/orgs");

    const githubInfo = await GitHubIntegration.findOne({
      accessToken: req.accessToken,
    }).select("_id");
    organizations?.forEach(async (organization) => {
      await organizationModel.findOneAndUpdate(
        { id: organization.id },
        {
          id: organization.id,
          name: organization.login,
          url: organization.url,
          githubUserId: githubInfo._id,
        },
        { upsert: true }
      );
    });

    // Return the organizations data
    res.status(200).json([...organizations]);
  } catch (error) {
    // Handle errors when fetching organizations
    res.status(500).json({ error: "Failed to fetch organizations" });
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
    return res.status(404).json({ error: "Not Found" });
  }

  // Initialize Octokit with the access token
  const octokit = await initializeOctokit(req.accessToken);

  try {
    // Request repositories data from GitHub API
    const { data: repos } = await octokit.request(`/orgs/${org}/repos`);
    res.status(200).json(repos);
  } catch (error) {
    // Handle errors when fetching repositories
    res.status(500).json({ error: "Failed to fetch repositories" });
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
    return res.status(404).json({ error: "Not Found" });
  }

  // Initialize Octokit with the access token
  const octokit = await initializeOctokit(req.accessToken);

  try {
    // Request commits data from GitHub API
    const { data: commits } = await octokit.request(
      `/repos/${owner}/${repo}/commits`
    );
    // Request pull requests data from GitHub API
    const { data: pullRequests } = await octokit.request(
      `/repos/${owner}/${repo}/pulls`
    );
    // Request issues data from GitHub API
    const { data: issues } = await octokit.request(
      `/repos/${owner}/${repo}/issues`
    );
    // Return the repository data
    res.status(200).json({ commits, pullRequests, issues });
  } catch (error) {
    // Handle errors when fetching repository data
    res.status(500).json({ error: "Failed to fetch repository data" });
  }
};

// Helper function to fetch all paginated data
async function fetchAllData(octokit, url, params) {
  return await octokit.paginate(url, params);
}

async function fetchCommit(octokit, orgId, repoId, repoName) {
  try {
    const commits = await fetchAllData(
      octokit,
      "GET /repos/{org}/{repo}/commits",
      { org: orgId, repo: repoName }
    );

    // Process commits
    commits.forEach(async (commit) => {
      await commitModel.findOneAndUpdate(
        { sha: commit.sha },
        {
          sha: commit.sha,
          commitAuthor: commit?.commit?.author,
          author: {
            id: commit?.author?.id || "-",
            name: commit?.author?.login || "unknown",
            avatar_url: commit?.author?.avatar_url || "",
          },
          message: commit?.commit?.message || "",
          url: commit?.url,
          repoId,
        },
        { upsert: true }
      );
    });

    return commits;
  } catch (e) {
    console.error("Error fetching org commit:", e);
    throw new Error(e);
  }
}

async function fetchPullRequest(octokit, orgId, repoId, repoName) {
  try {
    const pullRequests = await fetchAllData(
      octokit,
      "GET /repos/{org}/{repo}/pulls",
      { org: orgId, repo: repoName, state: "all", per_page: 100 }
    );

    // Process pull requests
    pullRequests.forEach(async (pr) => {
      await pullRequestModel.findOneAndUpdate(
        { id: pr.id },
        {
          id: pr.id,
          url: pr.url,
          state: pr.state,
          title: pr.title,
          user: {
            id: pr.user.id,
            name: pr.user.login,
          },
          createdOn: pr.created_at,
          closedOn: pr.closed_at,
          mergedOn: pr.merged_at,
          mergeCommitSha: pr.merge_commit_sha,
          head: {
            label: pr.head?.label,
            name: pr.head?.ref,
            sha: pr.head?.sha,
          },
          base: {
            label: pr.base?.label,
            name: pr.base?.ref,
            sha: pr.base?.sha,
          },
          repoId,
        },
        { upsert: true }
      );
    });

    return pullRequests;
  } catch (e) {
    console.error("Error fetching org pull request:", e);
    throw new Error(e);
  }
}

async function fetchIssues(octokit, orgId, repoId, repoName) {
  try {
    const issues = await fetchAllData(
      octokit,
      "GET /repos/{org}/{repo}/issues",
      { org: orgId, repo: repoName, state: "all", per_page: 100 }
    );

    // Process issues
    issues.forEach(async (issue) => {
      if (!issue.pull_request) {
        await issuesModel.findOneAndUpdate(
          { id: issue.id },
          {
            id: issue.id,
            url: issue.url,
            state: issue.state,
            title: issue.title,
            user: {
              id: issue.user.id,
              name: issue.user.login,
            },
            createdOn: issue.created_at,
            closedOn: issue.closed_at,
            closedBy: {
              id: issue.closed_by?.id,
              name: issue.closed_by?.login,
            },
            repoId,
          },
          { upsert: true }
        );
      }
    });

    // await fetchAllChangeLogs(octokit, orgId, repoName, issues)

    return issues;
  } catch (e) {
    console.error("Error fetching org issue:", e);
    throw new Error(e);
  }
}

async function fetchAllChangeLogs(
  octokit,
  orgId,
  repoName,
  issues = [],
  userStatsMap = {}
) {
  try {
    await Promise.all(
      issues.map(async (issue) => {
        const [changelog] = await Promise.all([
          fetchAllData(
            octokit,
            "GET /repos/{org}/{repo}/issues/{issue_number}/events",
            {
              org: orgId,
              repo: repoName,
              issue_number: issue.number,
            }
          ),
        ]);
        const user = issue.user.login;
        userStatsMap[user].changelog += changelog.length;
        return changelog;
      })
    );
  } catch (e) {
    console.error("Error fetching org issues change logs:", e);
    throw new Error(e);
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
    let data = []; // To accumulate stats by user

    // Iterate through all organization IDs
    for (const orgId of orgIds) {
      const organizationInfo = await organizationModel
        .findOne({ name: orgId })
        .select("_id");
      // Fetch repositories for the organization
      const repos = await fetchAllData(req.octokit, "GET /orgs/{org}/repos", {
        org: orgId,
        per_page: 100,
      });

      // Fetch data for each repository (commits, PRs, issues)
      for (const repo of repos) {
        const repoInfo = await repoModel.findOneAndUpdate(
          { id: repo.id },
          {
            id: repo.id,
            name: repo.name,
            organizationId: organizationInfo._id,
            type: repo.type,
            url: repo.url,
          },
          { upsert: true, new: true }
        );

        const commits = await fetchCommit(
          req.octokit,
          orgId,
          repoInfo._id,
          repo.name
        );
        data = data.concat(commits);
        const prs = await fetchPullRequest(
          req.octokit,
          orgId,
          repoInfo._id,
          repo.name
        );
        data = data.concat(prs);
        const issues = await fetchIssues(
          req.octokit,
          orgId,
          repoInfo._id,
          repo.name
        );
        data = data.concat(issues);
      }
    }

    // Send accumulated stats to the frontend
    res.json(data);
    commitModel.collection.createIndex({
      message: "text",
      sha: "text",
      "author.name": "text",
      "commitAuthor.name": "text",
      "commitAuthor.email": "text",
    });
    pullRequestModel.collection.createIndex({
      mergeCommitSha: "text",
      title: "text",
      "user.name": "text",
    });
    issuesModel.collection.createIndex({
      title: "text",
      "closedBy.name": "text",
      "user.name": "text",
    });
  } catch (error) {
    console.error("Error fetching org stats:", error);
    res.status(500).json({ error: "Failed to fetch organization stats" });
  }
};

async function fetchRepoDetails(organizationList, octokit) {
  let repoDetails = [];

  for (const organization of organizationList) {
    let repoList = await repoModel
      .find({ organizationId: organization._id })
      .select("_id name");

    if (!repoList.length) {
      const repos = await fetchAllData(octokit, "GET /orgs/{org}/repos", {
        org: organization.name,
        per_page: 100,
      });

      // Fetch data for each repository (commits, PRs, issues)
      for (const repo of repos) {
        const repoInfo = await repoModel.findOneAndUpdate(
          { id: repo.id },
          {
            id: repo.id,
            name: repo.name,
            organizationId: organization._id,
            type: repo.type,
            url: repo.url,
          },
          { upsert: true, new: true }
        );
        repoDetails.push({
          _id: repoInfo._id,
          name: repo.name,
          organizationName: organization.name,
        });
      }
    } else {
      repoDetails = repoDetails.concat(
        repoList.map((e) => ({
          _id: e._id,
          name: e.name,
          organizationName: organization.name,
        }))
      );
    }
  }
  return repoDetails;
}

exports.getCommitList = async (req, res) => {
  let { orgIds = [], page = 1, pageSize = 100, search } = req.query;
  page = parseInt(page);
  pageSize = parseInt(pageSize);
  try {
    const organizationIds = await organizationModel
      .findOne({ name: { $in: orgIds } })
      .select("_id");
    const repoIds = await repoModel
      .find({ organizationId: { $in: organizationIds } })
      .select("_id");
    const filters = { repoId: { $in: repoIds } };
    if (search) {
      filters.$text = { $search: search || "" };
    }
    const commits = await commitModel
      .find(filters)
      .skip((page - 1) * pageSize)
      .limit(pageSize);
    const totalCount = await commitModel.countDocuments(filters);

    res.json({ data: commits, totalCount });
  } catch (error) {
    console.error("Error fetching org stats:", error);
    res.status(500).json({ error: "Failed to fetch organization stats" });
  }
};

exports.getPullRequestList = async (req, res) => {
  let { orgIds = [], page = 1, pageSize = 100, search } = req.query;
  page = parseInt(page);
  pageSize = parseInt(pageSize);
  try {
    const organizationIds = await organizationModel
      .findOne({ name: { $in: orgIds } })
      .select("_id");
    const repoIds = await repoModel
      .find({ organizationId: { $in: organizationIds } })
      .select("_id");
    const filters = { repoId: { $in: repoIds } };
    if (search) {
      filters.$text = { $search: search || "" };
    }
    const prs = await pullRequestModel
      .find(filters)
      .skip((page - 1) * pageSize)
      .limit(pageSize);
    const totalCount = await pullRequestModel.countDocuments(filters);

    res.json({ data: prs, totalCount });
  } catch (error) {
    console.error("Error fetching org stats:", error);
    res.status(500).json({ error: "Failed to fetch organization stats" });
  }
};

exports.getIssueList = async (req, res) => {
  let { orgIds = [], page = 1, pageSize = 100 } = req.query;
  page = parseInt(page);
  pageSize = parseInt(pageSize);
  try {
    const organizationIds = await organizationModel
      .findOne({ name: { $in: orgIds } })
      .select("_id");
    const repoIds = await repoModel
      .find({ organizationId: { $in: organizationIds } })
      .select("_id");
    const filters = { repoId: { $in: repoIds } };
    if (search) {
      filters.$text = { $search: search || "" };
    }
    const issues = await issuesModel
      .find(filters)
      .skip((page - 1) * pageSize)
      .limit(pageSize);
    const totalCount = await issuesModel.countDocuments(filters);

    res.json({ data: issues, totalCount });
  } catch (error) {
    console.error("Error fetching org stats:", error);
    res.status(500).json({ error: "Failed to fetch organization stats" });
  }
};

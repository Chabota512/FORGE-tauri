import { Octokit } from "@octokit/rest";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

let connectionSettings: any;

async function getAccessToken() {
  if (
    connectionSettings &&
    connectionSettings.settings.expires_at &&
    new Date(connectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error("X_REPLIT_TOKEN not found for repl/depl");
  }

  connectionSettings = await fetch(
    "https://" +
      hostname +
      "/api/v2/connection?include_secrets=true&connector_names=github",
    {
      headers: {
        Accept: "application/json",
        X_REPLIT_TOKEN: xReplitToken,
      },
    }
  )
    .then((res) => res.json())
    .then((data) => data.items?.[0]);

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error("GitHub not connected");
  }
  return accessToken;
}

async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

export async function pushToGitHub(
  repoName: string,
  description: string = "Forge - Personal Engineering Advisor"
) {
  try {
    const octokit = await getUncachableGitHubClient();

    // Get authenticated user
    const { data: user } = await octokit.rest.users.getAuthenticated();
    const username = user.login;

    // Create repository
    const { data: repo } = await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      description,
      private: false,
      auto_init: false,
    });

    const repoUrl = repo.clone_url;

    // Initialize and push code
    const projectRoot = process.cwd();

    // Check if .git exists
    const gitDir = path.join(projectRoot, ".git");
    if (fs.existsSync(gitDir)) {
      // Git already initialized, just add remote and push
      try {
        execSync("git remote remove origin", { cwd: projectRoot });
      } catch {
        // Remote doesn't exist, that's fine
      }
      execSync(`git remote add origin ${repoUrl}`, { cwd: projectRoot });
    } else {
      // Initialize new git repo
      execSync("git init", { cwd: projectRoot });
      execSync(`git remote add origin ${repoUrl}`, { cwd: projectRoot });
    }

    // Add all files
    execSync("git add .", { cwd: projectRoot });

    // Check if there are changes to commit
    try {
      execSync("git diff --cached --exit-code", { cwd: projectRoot });
      // No changes
      return {
        success: true,
        message: "No changes to commit",
        repoUrl: repo.html_url,
        repoName: repoName,
      };
    } catch {
      // Changes exist, commit them
      execSync('git commit -m "Initial commit from Forge"', {
        cwd: projectRoot,
      });
    }

    // Push to GitHub
    try {
      execSync("git push -u origin main", { cwd: projectRoot });
    } catch {
      // Try master branch
      try {
        execSync("git push -u origin master", { cwd: projectRoot });
      } catch {
        // Neither main nor master worked, try to push current branch
        const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
          cwd: projectRoot,
        })
          .toString()
          .trim();
        execSync(`git push -u origin ${currentBranch}`, { cwd: projectRoot });
      }
    }

    return {
      success: true,
      message: "Successfully pushed to GitHub",
      repoUrl: repo.html_url,
      repoName: repoName,
    };
  } catch (error: any) {
    throw new Error(`Failed to push to GitHub: ${error.message}`);
  }
}

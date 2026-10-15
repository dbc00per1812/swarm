import { createApp } from "./app.ts";

if (import.meta.main) {
  Deno.serve(createApp({
    accessToken: Deno.env.get("SWARM_MCP_ACCESS_TOKEN"),
    githubToken: Deno.env.get("SWARM_GITHUB_TOKEN"),
    slackToken: Deno.env.get("SWARM_SLACK_TOKEN"),
    linearToken: Deno.env.get("SWARM_LINEAR_TOKEN"),
    gmailAccessToken: Deno.env.get("SWARM_GMAIL_ACCESS_TOKEN"),
    gmailClientId: Deno.env.get("SWARM_GMAIL_CLIENT_ID"),
    gmailClientSecret: Deno.env.get("SWARM_GMAIL_CLIENT_SECRET"),
    gmailRefreshToken: Deno.env.get("SWARM_GMAIL_REFRESH_TOKEN"),
    githubRepositories: Deno.env.get("SWARM_GITHUB_REPOSITORIES")?.split(",")
      .map((name) => name.trim()).filter(Boolean),
  }));
}

import { createApp } from "./app.ts";

if (import.meta.main) {
  Deno.serve(createApp({
    accessToken: Deno.env.get("SWARM_MCP_ACCESS_TOKEN"),
    githubToken: Deno.env.get("SWARM_GITHUB_TOKEN"),
    githubRepositories: Deno.env.get("SWARM_GITHUB_REPOSITORIES")?.split(",")
      .map((name) => name.trim()).filter(Boolean),
  }));
}

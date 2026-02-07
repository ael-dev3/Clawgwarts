import { defineConfig } from "vite";

const githubRepoBase = "/Clawgwarts/";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? githubRepoBase : "/",
  build: {
    chunkSizeWarningLimit: 1400
  }
});

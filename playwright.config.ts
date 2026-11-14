import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  timeout: 60000,
  use: {
    screenshot: "only-on-failure",
    baseURL: "http://localhost:3000",
    viewport: { width: 1680, height: 1050 },
    launchOptions: {
      executablePath:
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  reporter: "list",
});

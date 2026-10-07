import { loadEnvFile } from "node:process";

export function loadLocalEnv() {
  try {
    loadEnvFile(".env.local");
  } catch {
    // CI and hosted runtimes provide real environment variables directly.
  }
}

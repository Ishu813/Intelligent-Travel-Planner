import { execSync } from "node:child_process";

const port = process.argv[2] ?? "3001";
const projectRoot = new URL("..", import.meta.url).pathname;

function listPids() {
  try {
    return execSync(`lsof -ti :${port}`, { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

for (const pid of listPids()) {
  try {
    const args = execSync(`ps -p ${pid} -o args=`, { encoding: "utf8" });
    if (!args.includes("Intelligent Travel Planner") && !args.includes("trip-planner")) {
      continue;
    }
    process.kill(Number(pid));
    // eslint-disable-next-line no-console
    console.log(`Freed port ${port} (stopped pid ${pid})`);
  } catch {
    /* process may have already exited */
  }
}

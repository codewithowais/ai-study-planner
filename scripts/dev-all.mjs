// Run the Next.js dev server and the local companion service together.
// Usage: npm run dev:all
import spawn from "cross-spawn";

const procs = [];

function run(name, cmd, args, color) {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
  const tag = `\x1b[${color}m[${name}]\x1b[0m`;
  const pipe = (stream) =>
    stream.on("data", (d) =>
      d
        .toString()
        .split("\n")
        .filter(Boolean)
        .forEach((line) => console.log(`${tag} ${line}`))
    );
  pipe(child.stdout);
  pipe(child.stderr);
  child.on("exit", (code) => {
    console.log(`${tag} exited with code ${code}`);
    shutdown();
  });
  procs.push(child);
}

function shutdown() {
  for (const p of procs) {
    if (!p.killed) p.kill("SIGTERM");
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

run("companion", "node", ["companion/server.mjs"], "36");
run("web", "node", ["node_modules/next/dist/bin/next", "dev"], "35");

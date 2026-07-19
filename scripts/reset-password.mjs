// Local password reset for the single-user JSON store.
//
// Run: npm run reset-password
//
// You type the new password directly into your terminal (masked). It is
// hashed with bcrypt on your machine and written to data/users.json. The
// plaintext is never printed, logged, or sent anywhere — this is the safe way
// to regain access without storing a password in the repo.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import bcrypt from "bcryptjs";

const USERS = path.join(process.cwd(), "data", "users.json");

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (!fs.existsSync(USERS)) {
  fail(
    "No account exists yet. Start the app (npm run dev) and register at " +
      "http://localhost:3000/login — the first sign-up creates your account.",
  );
}

const users = JSON.parse(fs.readFileSync(USERS, "utf8"));
if (!Array.isArray(users) || users.length === 0) {
  fail("No account found in data/users.json. Register in the app first.");
}

// Single-user app: default to the only account, else let a CLI arg pick.
const argEmail = process.argv[2]?.trim().toLowerCase();
const user = argEmail
  ? users.find((u) => u.email.toLowerCase() === argEmail)
  : users[0];
if (!user) {
  fail(
    `No account matches "${argEmail}". Accounts: ${users
      .map((u) => u.email)
      .join(", ")}`,
  );
}

// One shared readline interface for both prompts (masking the typed input on
// a real terminal). Creating a fresh interface per prompt drops buffered input.
function askInteractive() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const tty = Boolean(process.stdin.isTTY);
  let current = "";
  if (tty) {
    rl._writeToOutput = (str) =>
      rl.output.write(str.includes(current) ? str : "*");
  }
  const ask = (query) =>
    new Promise((resolve) => {
      current = query;
      rl.question(query, (value) => {
        rl.output.write("\n");
        resolve(value);
      });
    });
  return { ask, close: () => rl.close() };
}

const run = async () => {
  console.log(`\nResetting password for: ${user.email}\n`);

  let pw;
  // Non-interactive path (automation / CI): ASP_NEW_PASSWORD=... npm run reset-password
  if (process.env.ASP_NEW_PASSWORD) {
    pw = process.env.ASP_NEW_PASSWORD;
    if (pw.length < 6) fail("ASP_NEW_PASSWORD must be at least 6 characters.");
  } else {
    const prompter = askInteractive();
    pw = await prompter.ask("New password (min 6 chars): ");
    const confirm = await prompter.ask("Confirm new password:      ");
    prompter.close();
    if (pw.length < 6) fail("Password must be at least 6 characters.");
    if (pw !== confirm) fail("Passwords did not match. Nothing was changed.");
  }

  user.passwordHash = await bcrypt.hash(pw, 10);
  // Atomic-ish write: temp file then rename.
  const tmp = `${USERS}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2), "utf8");
  fs.renameSync(tmp, USERS);

  console.log(
    `\n✓ Password updated for ${user.email}.\n  Sign in at http://localhost:3000/login (or your dev port).\n`,
  );
};

run();

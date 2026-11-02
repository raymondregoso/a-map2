// Make a JVM_USERS entry for one employee.
//   node scripts/add-user.mjs name@jvmlending.com
// You'll be asked for their password (typing is hidden). Paste the printed line into the
// JVM_USERS environment variable in Vercel (separate employees with commas), then redeploy.
import crypto from "node:crypto";
import readline from "node:readline";

const email = (process.argv[2] || "").trim().toLowerCase();
const domain = (process.env.ALLOWED_DOMAIN || "jvmlending.com").toLowerCase();
if (!email.endsWith("@" + domain)) { console.error(`Give a ${domain} email, e.g. node scripts/add-user.mjs name@${domain}`); process.exit(1); }

function ask(q) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = s => { if (s.includes(q)) process.stdout.write(s); };
    rl.question(q, a => { rl.close(); process.stdout.write("\n"); resolve(a); });
  });
}
const pw = await ask("Password for " + email + ": ");
if (pw.length < 10) { console.error("Use at least 10 characters."); process.exit(1); }
const again = await ask("Type it again: ");
if (pw !== again) { console.error("Those didn't match."); process.exit(1); }
const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex");
console.log("\nAdd this to JVM_USERS:\n\n" + `${email}:${salt}:${hash}` + "\n");

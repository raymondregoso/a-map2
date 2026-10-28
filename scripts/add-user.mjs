// Makes one JVM_USERS entry for an employee. Run on your own computer:
//   node scripts/add-user.mjs name@jvmlending.com
// Type the password twice (it isn't shown). Paste the printed line into JVM_USERS in Vercel.
import readline from "node:readline";
import { hashPassword } from "../api/_auth.js";

const domain = (process.env.ALLOWED_DOMAIN || "jvmlending.com").toLowerCase();
const email = String(process.argv[2] || "").trim().toLowerCase();
if (!email.endsWith("@" + domain)) {
  console.error(`Usage: node scripts/add-user.mjs name@${domain}`);
  process.exit(1);
}

function ask(q) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = s => { if (s.includes(q)) rl.output.write(q); };   // hide what's typed
    rl.question(q, a => { rl.close(); process.stdout.write("\n"); resolve(a); });
  });
}

const p1 = await ask("Password for " + email + ": ");
if (p1.length < 10) { console.error("Use at least 10 characters."); process.exit(1); }
const p2 = await ask("Type it again: ");
if (p1 !== p2) { console.error("The passwords don't match. Nothing was made."); process.exit(1); }

const { salt, hash } = hashPassword(p1);
console.log("\nAdd this to JVM_USERS (separate employees with commas):\n");
console.log(`${email}:${salt}:${hash}\n`);

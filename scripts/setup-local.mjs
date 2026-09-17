import fs from "node:fs";
import crypto from "node:crypto";
if (fs.existsSync(".env.local")) {
  console.log(
    "Existing .env.local preserved. Configure DIAM_ADMIN_EMAIL, DIAM_ADMIN_PASSWORD and DIAM_SESSION_SECRET there.",
  );
  process.exit(0);
}
const password = crypto.randomBytes(18).toString("base64url");
const secret = crypto.randomBytes(48).toString("hex");
fs.writeFileSync(
  ".env.local",
  `DIAM_ADMIN_EMAIL=admin@diam.local\nDIAM_ADMIN_PASSWORD=${password}\nDIAM_SESSION_SECRET=${secret}\n`,
);
fs.mkdirSync(".local", { recursive: true });
fs.writeFileSync(
  ".local/local-access.txt",
  `Local development login\nEmail: admin@diam.local\nPassword: ${password}\nDo not commit or share this file.\n`,
);
console.log(
  "Local login configured. Credentials are saved in .local/local-access.txt (gitignored).",
);

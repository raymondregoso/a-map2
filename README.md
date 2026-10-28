# Broker Tour Router · JVM Lending

Plans a broker tour from the day's tour sheet (.xlsx / .csv), opens the route in Google or Apple Maps,
and makes the **Stop list**: each stop as a labeled Apple Maps pin ("Agent – Address") with LS/BS,
HomeRun eligibility and open hours. Only signed-in JVM Lending employees can open it.

## Deploy (first time)

1. Unzip this folder and put it in a GitHub repo (or drag the folder into Vercel → **Add New → Project**).
2. Framework preset: **Other**. Leave build settings empty. Vercel serves the `public` folder and the `api` functions.
3. In **Settings → Environment Variables**, import `vercel.env` (see below), then **Redeploy**.

The app stays locked until `SESSION_SECRET` and at least one `JVM_USERS` entry are set.

## Environment variables

| Name | Needed | What it does |
| --- | --- | --- |
| `SESSION_SECRET` | Yes | Signs sign-in sessions. 64 random hex characters. Changing it signs everyone out. |
| `JVM_USERS` | Yes | Employees who can sign in: `email:salt:hash`, separated by commas. |
| `ALLOWED_DOMAIN` | No | Only emails at this domain can sign in. Default `jvmlending.com`. |
| `ANTHROPIC_API_KEY` | No | Turns on listing-photo reading, messy-text reading, and backup pinning. Usage is billed to that key. |
| `CLAUDE_MODEL` | No | Model for those features. Default `claude-sonnet-5-5`. |

## Add or remove an employee

On your computer, in this folder (needs Node 20+):

```
node scripts/add-user.mjs name@jvmlending.com
```

Type their password twice (at least 10 characters). It prints one line like
`name@jvmlending.com:3f9a…:8c41…`. Add it to `JVM_USERS` in Vercel (comma between employees) and redeploy.

To remove someone, delete their entry and redeploy. They're signed out on their next click.
To change a password, run the command again and replace their entry.

## Logo

The header shows a logo mark built from the brand guide (orange square + "jvmlending").
To use the official logo, add it as `public/jvm-logo.png` (white or light version, since the header is teal)
and redeploy. It replaces the built-in mark on the app and the sign-in page.

## How sign-in works

- Every page and API call checks the session first (`middleware.js`). Without one, you get the sign-in page.
- Passwords are never stored, only scrypt hashes. Sessions last 12 hours, in an HttpOnly cookie.
- Five wrong passwords pause that email for 15 minutes.

## Privacy

Tour data stays in each person's own browser. Addresses go to the free US Census geocoder for pinning,
and to Claude only if `ANTHROPIC_API_KEY` is set and someone uses photo/text reading.

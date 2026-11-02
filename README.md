# Broker Tour Router — JVM Lending (Vercel)

Plans a broker tour from a tour sheet (.xls / .xlsx / .csv) or pasted addresses: up to 8 stops between your
start and end, ordered for the shortest drive, then by agent BS count and Homerun eligibility, within each
listing's open hours and your "Done by" time. Opens the route in Google Maps or Apple Maps.

Only signed-in JVM Lending employees can open the app or use its address lookup. The check runs on Vercel
before anything is served (`middleware.js`), so the page itself is never sent to someone who isn't signed in.

## Plan Today's Tour (first tab)

1. **Upload Raw Data** — the MLS "Tour/Open House" export (.csv or .xlsx). The app:
   - removes duplicate addresses (keeps the first),
   - removes tours starting 8:00–8:30 AM and tours ending 4:00–11:59 PM,
   - removes ZIP 94595,
   - writes the 19-column Monday Broker Tour layout (Visited and Call as checkboxes, Agent and Phone split
     from the MLS agent field),
   - sets Color: yellow for $0–$840,000 (whole row filled yellow, same rule as the reference file), green up to
     the "Green up to" amount (default $1,300,000), white above.
   **Export** downloads it as `Monday_Broker_Tour_MM.DD.YY.xlsx` (day name and date come from the tour date).
2. **Split by team** — **Import Excel** (the exported sheet, or the raw export) or **Use today's sheet**.
   - Heejin: Walnut Creek, Alamo, Lafayette, Orinda, San Ramon
   - Aaron: Albany, Berkeley, El Cerrito, Kensington, Emeryville, Oakland, Piedmont, Richmond
   - Andrei: Concord, Pleasant Hill, Clayton, Martinez, Antioch, Bay Point
   - All sheets: Castro Valley, Hayward, San Lorenzo, Pleasanton, Livermore
   A person with no listings gets no sheet. Cities on no list are named on screen and left out.
   **Export team workbook** downloads `..._By_Team.xlsx`, and each person's route page fills in automatically.
   To change the city lists, edit `TEAMS` and `SHARED_CITIES` in `public/tour-sheet.js`.

## Route pages

Heejin's, Aaron's and Andrei's Route each keep their own stops, start/end, times and settings (saved in that
browser). Defaults: Heejin Alamo → San Ramon; Aaron El Sobrante 94803 → Broadway Plaza; Andrei Pleasant Hill
Senior Center → Broadway Plaza. Importing a team workbook on a route page uses that person's sheet.

## 1. Deploy

**GitHub (easiest to update later):** upload this folder to a new private GitHub repository, then on vercel.com
click **Add New → Project**, import it, and click **Deploy**.

**Command line:** in this folder run `npx vercel`, sign in, then `npx vercel --prod`.

## 2. Turn on sign-in (required — the app stays locked until you do)

In Vercel open **Project → Settings → Environment Variables** and add:

| Name | Value |
|---|---|
| `SESSION_SECRET` | A long random string, 32+ characters. Make one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `JVM_USERS` | One entry per employee (see below), separated by commas |

Then **redeploy** (Deployments → ⋯ → Redeploy) so the new values take effect.

### Add an employee

On your computer, in this folder:

```
node scripts/add-user.mjs name@jvmlending.com
```

Type their password twice (at least 10 characters; typing is hidden). It prints one line like
`name@jvmlending.com:3f9a…:b71c…`. Add that line to `JVM_USERS` (comma between employees) and redeploy.
The password itself is never stored, only a salted scrypt hash.

- **Remove someone:** delete their entry from `JVM_USERS` and redeploy. They're signed out on their next request.
- **Reset a password:** run the script again for that email and replace their entry.
- Only `@jvmlending.com` addresses can sign in. To change the domain, set `ALLOWED_DOMAIN`.
- Sessions last 12 hours. After 5 wrong passwords, that email and device are paused for 15 minutes.

## 3. Logo

The header and sign-in page show a JVM Lending mark built from the brand guide. To use the official logo,
add the file as `public/jvm-logo.png` (a version made for dark backgrounds works best in the teal header) and
redeploy. It replaces the built-in mark automatically.

## Locations

Addresses are pinned to street level with the free US Census geocoder right after you import or paste them.
Addresses the Census can't match stay placed by ZIP and are flagged in the app.

## Optional: photo reading and place names (Claude)

Add `ANTHROPIC_API_KEY` (from https://console.anthropic.com; usage billed to that account) as an environment
variable and redeploy. The "Add listing photos" button appears. Optional `CLAUDE_MODEL` changes the model.

## Privacy

Tour data is stored only in each person's own browser. Addresses go to the Census geocoder for pinning, and to
Claude only if the key is set and someone uses photo or text reading.

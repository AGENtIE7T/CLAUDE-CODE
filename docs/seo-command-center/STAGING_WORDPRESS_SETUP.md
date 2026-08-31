# Setting up a disposable WordPress test site

Follow this when you are ready for the controlled single-change test. It should
take about twenty minutes.

**Do not send the Application Password in chat.** It goes into a server
environment variable and nowhere else. There is no field in the application to
type it into, deliberately.

---

## 1. Get a throwaway WordPress site

Any of these is fine. Pick whichever is least effort for you.

**Option A — a hosted free sandbox (easiest).**
Use a provider that gives temporary WordPress instances, e.g.
[TasteWP](https://tastewp.com) or [InstaWP](https://instawp.com). Both create a
site in under a minute and hand you a wp-admin login. A free instance usually
expires after a few days, which is exactly what you want.

**Option B — a staging site on your existing host.**
Most managed WordPress hosts (WP Engine, Kinsta, SiteGround, Cloudways) have a
one-click "create staging" button. Use that, not your live site.

**Option C — local, exposed with a tunnel.**
`wp-env`, LocalWP, or Docker, then `cloudflared tunnel --url http://localhost:8080`
to get an HTTPS address the app can reach.

Requirements the site must meet:

- Reachable over **HTTPS** from the internet (the app calls it server-side).
- The REST API is enabled at `https://<site>/wp-json` — open that URL in a
  browser; you should see JSON, not a 404. Some security plugins disable it.
- It contains at least **three or four posts and two or three pages** with real
  sentences in them. Internal linking works on text: a site of empty "Hello
  world" posts will correctly produce zero suggestions. Import a theme's demo
  content, or paste a few hundred words into each.

**Do not use your production website for this.**

---

## 2. Create the user

Use a dedicated user rather than your own admin account, so revoking access
later affects nothing else.

1. wp-admin → **Users → Add New**.
2. Username: something identifiable, e.g. `seo-automation`.
3. Role: **Editor**.
   - Editor gives `edit_posts` and `edit_pages`, which is everything this
     application needs.
   - Administrator is *not* required. Do not grant it.
4. Save.

If your host forces a single admin user, that will work too — the application
only ever calls the endpoints it needs — but a dedicated Editor is better.

---

## 3. Create an Application Password

An Application Password is a WordPress feature that issues a revocable
credential for API access. It is **not** your login password, and revoking it
does not change the account.

1. wp-admin → **Users → All Users → (the user you just made) → Edit**.
2. Scroll to **Application Passwords**.
3. In "New Application Password Name" type something recognisable, e.g.
   `SEO Command Center`.
4. Click **Add New Application Password**.
5. WordPress shows a value like `abcd EFGH ijkl MNOP qrst UVWX` **once**. Copy
   it now; you cannot see it again.
   - The spaces are part of it. Keep them, or remove them — WordPress accepts
     both. Be consistent.

If the Application Passwords section is missing:
- the site is not on HTTPS (WordPress hides the feature on plain HTTP), or
- a security plugin has disabled it, or
- WordPress is older than 5.6.

---

## 4. Put the credentials on the server

**Never** paste these into a chat, a file in the repository, or a form in the
application.

### If the app is running on Vercel

Project → Settings → Environment Variables. Add each of these, scoped to the
**Preview** or a dedicated **Staging** environment — not Production:

```
WORDPRESS_BASE_URL      = https://your-staging-site.example
WORDPRESS_USERNAME      = seo-automation
WORDPRESS_APP_PASSWORD  = abcd EFGH ijkl MNOP qrst UVWX
WORDPRESS_ENVIRONMENT   = staging
WORDPRESS_ACCESS        = read_only
WORDPRESS_USE_MOCK      = 0
```

Leave `SEO_ENABLE_PRODUCTION_WRITES` unset or `0`. Redeploy so the variables
take effect.

### If the app is running locally

Put them in `.env.local` in the project root. That file is git-ignored — check
with `git check-ignore -v .env.local` before you write anything into it.

Notes on each value:

- `WORDPRESS_BASE_URL` — the site root. **No trailing slash, no `/wp-json`.**
  Right: `https://staging.example.com`. Wrong: `https://staging.example.com/wp-json/`.
- `WORDPRESS_ACCESS` — start at `read_only`. The application will refuse every
  write while it is set that way, which is the point: the first test proves it
  can *read* your site before it is allowed to touch it.
- `WORDPRESS_ENVIRONMENT` — `staging`. Autopilot's default rules only permit
  staging, and a mock connection can never be used against production.

---

## 5. Test the connection

1. Open the application and go to **SEO · Connection**.
2. The capability cards should now show **WordPress: Configured** and
   **Connection access: Read-only**.
3. Click **Run connection test**.

What a pass looks like:

> ✅ Reachable · read-only · staging
> Site reports its name as "Your Staging Site". 14 page(s) and post(s) are readable.

Common failures and what they mean:

| Message | Cause |
|---|---|
| `auth_failed` — WordPress rejected the credentials | Wrong username, or the Application Password was mistyped. Regenerate it. |
| `not_found` / REST API v2 namespace is not exposed | `/wp-json` is blocked. Check for a security plugin, or permalinks set to "Plain". |
| `timeout` | The site is asleep (free tiers do this) or behind a firewall. Load it in a browser first. |
| `network` | The base URL is wrong — usually a trailing slash or a missing `https://`. |

**Stop here and tell me the test passed.** Do not change `WORDPRESS_ACCESS`
yet.

---

## 6. What I will run next

Once you confirm the connection test passes, I will run exactly this, once:

1. Connect and verify the credentials.
2. Read the site and list its pages and posts.
3. Generate internal-link suggestions and show you the scores.
4. Build a preview of **one** change and show you the exact before/after.
5. Wait for your approval — bound to that exact revision.
6. Apply **one** internal link, after you set `WORDPRESS_ACCESS=read_write`.
7. Re-read the page from WordPress and verify the link is really there.
8. Roll the change back from the pre-write backup.
9. Re-read again and verify the page is byte-identical to how it started.
10. Report every step.

No batch update. No production site. No unrestricted Autopilot. No changes to
protected pages.

---

## 7. Revoking access afterwards

When the test is finished, or at any time you want to cut access instantly:

1. wp-admin → **Users → (the user) → Edit** → Application Passwords.
2. Click **Revoke** next to `SEO Command Center`.

The credential stops working immediately. Nothing else about the account
changes. Then clear the `WORDPRESS_*` variables from the server, and if you used
a temporary sandbox, delete the site.

To be thorough, also revoke if:
- you ever pasted the password anywhere other than the environment variables,
- the sandbox provider's site becomes publicly guessable,
- you have finished testing and do not plan to continue this week.

A revoked Application Password cannot be un-revoked; you create a new one.

# WordPress connection

The SEO Command Center edits page content through a **server-side WordPress
REST adapter**. This document describes what exists today, what it can and
cannot do, and what has to happen before it is pointed at a real site.

## Status

| | |
|---|---|
| Adapter code | Complete (`src/lib/cms/wordpress/`) |
| Test coverage | 31 tests against a fully mocked WordPress REST API |
| Real site connected | **No** |
| Production writes | **Disabled** (`SEO_ENABLE_PRODUCTION_WRITES=0`) |

Nothing in this repository has modified a live website. The adapter has been
exercised only against the in-process fixture server in
`src/lib/cms/wordpress/mock-server.ts`.

## Architecture

```
execute/engine.ts          approval + hash re-check + verify + rollback
        │  CmsStore seam (getPage / writePage / listUrls)
        ▼
cms/wordpress/store.ts     backup-before-write, url → post-id resolution
        │  CmsConnection
        ▼
cms/wordpress/client.ts    REST calls, optimistic concurrency, error mapping
        │  fetch
        ▼
   WordPress /wp-json
```

`execute/engine.ts` is unchanged by this work. It owns the safety contract;
the adapter only teaches it how to talk to WordPress.

## Credentials

Credentials are read from environment variables on the server and held in a
closure inside `createWordPressConnection()`. They are:

- never rendered in the UI,
- never stored in browser storage,
- never returned through an API response,
- never written to the audit log,
- never committed (`.env.example` holds empty placeholders only).

`redact()` strips anything resembling a credential from text derived from a
response before it can reach a message or a log line. Three tests assert that
the token appears in neither the connection object, nor an error payload, nor
the request log.

Use an **Application Password** (WordPress → Users → Profile → Application
Passwords), not the account password. It can be revoked in wp-admin without
changing the account, which is the intended kill switch.

### Required variables

See `.env.example` for the authoritative list:

| Variable | Purpose |
|---|---|
| `WORDPRESS_BASE_URL` | Site root, no `/wp-json` suffix |
| `WORDPRESS_USERNAME` | User the Application Password belongs to |
| `WORDPRESS_APP_PASSWORD` | Application Password (never the login password) |
| `WORDPRESS_ENVIRONMENT` | `staging` or `production` |
| `WORDPRESS_ACCESS` | `read_only` or `read_write` |

With `WORDPRESS_BASE_URL` blank the system reports **no connection**. It does
not fall back to fixture data, and it does not report a change as applied.

## Mock isolation

A connection carries an `isMock` flag. `assertUsable()` throws
`mock_in_production` when a mock connection is used against a production
environment, and it is called at the top of every read and write in the store.
There is no flag, setting, or instruction that can override it — the check is a
plain code path, not a policy value.

Fixture content is deliberately hostile: it includes a page whose body contains
`IGNORE ALL PREVIOUS INSTRUCTIONS…`. It is treated as data, flagged by
`classifyInjection()`, and acted on by nothing.

## Concurrency and verification

WordPress exposes no `If-Match`, so `update()` implements optimistic
concurrency explicitly:

1. re-read the resource,
2. compare the server's `modified_gmt` with the version the caller previewed,
3. on a mismatch throw `stale_content` and **do not write**.

This is what makes "someone edited the page between the preview and the
approval" safe rather than destructive.

The mock server can also simulate a write the server *accepts and silently
ignores* (`faults.verifyFailIds`). The engine catches this by re-reading after
every write; a covering test asserts the content did not change.

## Backups

`store.ts` takes a snapshot of the live bytes **before** every write. If the
backup cannot be taken, the write does not happen. `rollbackFromBackups()`
restores a whole batch and reports every page it could not restore instead of
claiming success.

## Error model

`CmsError.code` is one of:

`not_connected`, `auth_failed`, `forbidden`, `not_found`, `rate_limited`,
`timeout`, `stale_content`, `write_failed`, `verification_failed`,
`read_only`, `network`, `mock_in_production`, `unsupported`.

Each carries `retryable` and, for rate limits, `retryAfterMs`. Nothing is
retried automatically that must not be — `auth_failed` and `stale_content` are
explicitly non-retryable.

## Bringing up a staging site

1. Create a disposable WordPress site you control. Do not use production.
2. Create an Application Password for a user with `edit_posts`.
3. Populate the `WORDPRESS_*` variables server-side with
   `WORDPRESS_ENVIRONMENT=staging` and `WORDPRESS_ACCESS=read_only`.
4. Run connection verification. It must report `ok: true` and the site name.
5. Run an **audit**, then a **preview**. Confirm the proposed diffs by eye.
6. Set `WORDPRESS_ACCESS=read_write`, keeping
   `SEO_ENABLE_PRODUCTION_WRITES=0`, and execute one approved single-page
   change against staging. Confirm the change on the site, then roll it back
   and confirm the rollback.
7. Only after that cycle passes should production be discussed. Production
   additionally requires `SEO_ENABLE_PRODUCTION_WRITES=1`, which is a
   deliberate, separate decision.

# SEO Command Center — User Guide

A safe, explainable way to run SEO on sites you own. You type plain English; the
system turns it into a reviewable plan and — only with approval — makes the
change and verifies it.

## The three modes

- **Audit** (default) — read-only. Crawl, analyze, report. Never changes a site.
- **Preview** — proposes exact changes (links, metadata, redirects). Nothing is
  published.
- **Execute** — applies **only** an approved revision, then verifies the live
  result, with rollback ready.

If a request could change a live site, it becomes a Preview and requires
approval. If a request maps to a prohibited tactic, it is refused with a
legitimate alternative.

## Getting started

1. **Add a website** on `/websites`. New sites start **UNVERIFIED** — crawling
   and any write stay blocked until you confirm ownership (DNS TXT, HTML file,
   meta tag, Search Console, or an authenticated CMS connection).
2. **Set protected URLs** (checkout, account, legal) — these can never be
   modified by any write task.
3. Go to `/command` and type an instruction.

## Example commands

| You type | What happens |
|---|---|
| "Audit my site and find broken internal links" | Audit mode. Read-only report. |
| "Find orphan pages and pages more than 3 clicks deep" | Audit mode. |
| "Suggest internal links from blog posts to service pages, no more than 2 per article, preview only" | Preview. Explainable candidates, no changes. |
| "Suggest title tags and meta descriptions, limit to 20 pages" | Preview. |
| "Apply the approved internal links" | Execute — requires an approval bound to the exact revision. |
| "Buy 500 backlinks" | **Refused** — prohibited. Offered a legitimate alternative (outreach prospect list). |

## Reading a plan

Every command returns one of:
- **Ready** — a plan with mode, scope, limits, and confidence. Write plans are
  flagged "requires approval".
- **Needs clarification** — e.g. which website, when you have several.
- **Refused** — prohibited request, with a safe alternative.

Findings in reports are labelled **fact** (observed), **inference** (derived), or
**recommendation** (advice). The tool never guarantees rankings.

## Internal linking, explained

Each suggested link shows its **score components** (semantic, topic, entity,
intent, page-type, business priority, destination quality), the proposed anchor,
the exact source sentence, and why it's relevant. Defaults: ≤5 links/page, ≤1 to
the same target/page, ≥0.80 confidence, ≤20 pages/batch. Links are never inserted
inside existing anchors, headings, code, nav, or forms.

## Autopilot (demo)

On `/command`, **▶ Run autopilot** runs the whole loop on a seeded demo site —
crawl → audit → link → approve → insert → verify — and shows the page before and
after. In production the same loop **holds for your approval** until writes are
explicitly enabled.

## Outreach & backlinks

The platform finds prospects, detects unlinked brand mentions, and drafts
personalized outreach into a review queue. It **never** sends automatically:
a send needs your explicit approval of the exact recipients and message, passes
a rate check and a no-ranking-guarantee compliance check, and is logged. It
never creates backlinks or publishes on third-party sites.

## Roles

| Role | Can |
|---|---|
| OWNER / ADMIN | everything (manage, approve, execute) |
| SEO_MANAGER | run audits & previews — **cannot** approve or execute |
| EDITOR | approve/reject suggestions — **cannot** execute writes |
| VIEWER | read reports only |

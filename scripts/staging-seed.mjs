/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Staging content pack — a realistic small site, as a WordPress import file.
 * ─────────────────────────────────────────────────────────────────────────
 *  The single most likely way a first real-site test disappoints is thin
 *  content. Internal linking runs on text: a site of empty "Hello world" posts
 *  correctly produces zero suggestions, and the system then looks broken while
 *  behaving perfectly.
 *
 *  This pack removes that variable. Seven pieces of genuine prose — three
 *  service pages and four blog posts — written the way a real local firm
 *  writes, in two overlapping topic clusters so there are real opportunities
 *  to find, not manufactured ones.
 *
 *  It is NOT tuned to game the scorer. `staging-seed.test.ts` runs the shipped
 *  scoring engine over this exact content at the shipped 0.80 confidence
 *  floor, so what the test proves is what your site will do.
 *
 *  Two things the content is deliberately careful about, because they are how
 *  the engine actually works:
 *
 *   · Anchor text must appear in a PARAGRAPH, not only a heading — the link
 *     applier refuses to edit inside headings, so a phrase that lives only in
 *     an <h2> can never be linked.
 *   · Entity overlap is 15% of the score, and entities are capitalised
 *     phrases. A shared firm name and town, used naturally throughout, is what
 *     a real site has and what the scorer rewards.
 */

export const FIRM = "Meridian Law";
export const TOWN = "Ashford";

/** type: "page" = service pages (link targets), "post" = blog (link sources). */
export const SEED_CONTENT = [
  // ── service pages: the destinations ──────────────────────────────────────
  {
    type: "page",
    slug: "estate-planning",
    path: "/services/estate-planning",
    title: "Estate Planning",
    html: `
<h2>Estate Planning in Ashford</h2>
<p>We help families across Ashford put an estate plan in place before it is
needed rather than after. The work is mostly unglamorous and mostly
preventative: a valid will, a clear record of what you own, and named people
who can act when you cannot.</p>
<p>Our estate planning work starts with a list. We ask what you own, who
depends on you, and what you would want to happen to each. It is surprising how
often that conversation is the first time a couple has compared answers.</p>
<h2>Estate Planning, in practice</h2>
<p>At Meridian Law a plan usually means a will, a letter of wishes, and a
decision about whether a trust earns its keep. We do not recommend a trust by
default. To be worth the cost and the annual admin, it has to solve a problem
you actually have.</p>
<p>If you own a home in Ashford, have children from more than one
relationship, or run a business, the estate planning conversation gets more
useful, not less. The cost of getting it wrong is paid by the people you leave
behind, at the worst possible time.</p>
<p>We review a plan every three to five years, or sooner after a birth, a
death, a marriage or a house move.</p>`,
  },
  {
    type: "page",
    slug: "probate",
    path: "/services/probate",
    title: "Probate Administration",
    html: `
<h2>Probate Administration in Ashford</h2>
<p>We act for executors and administrators across Ashford, from a simple estate
with one property to a contested one with beneficiaries who are not speaking.
The probate administration work is the same in shape: establish what the estate
holds, settle what it owes, and distribute what remains.</p>
<p>Our first job is usually to slow things down. The bank calls, the estate
agent calls, and an executor who has just lost someone starts making decisions
under pressure. We take that pressure off.</p>
<h2>Probate Administration, and how long it takes</h2>
<p>A straightforward estate at Meridian Law takes six to nine months. If there
is property to sell, a business interest, or a claim against the estate, it
takes longer and we say so at the outset rather than at month eight.</p>
<p>We charge probate administration work at a fixed fee wherever the scope can
be pinned down, and hourly only where it genuinely cannot. The estate pays, not
the executor personally.</p>
<p>If an executor wants to step back, we can take the whole administration on
under a power of attorney rather than leave them carrying it.</p>`,
  },
  {
    type: "page",
    slug: "power-of-attorney",
    path: "/services/power-of-attorney",
    title: "Power of Attorney",
    html: `
<h2>Power of Attorney in Ashford</h2>
<p>We prepare and register powers of attorney for clients across Ashford. A
power of attorney names someone you trust to make decisions for you if you
cannot make them yourself, and it has to be made while you still can.</p>
<p>Our clients usually come to this the hard way, having watched a parent lose
capacity without one. The alternative is a deputyship application, which is
slower, more expensive, and supervised by a court for the rest of that
person's life.</p>
<h2>Power of Attorney, in two parts</h2>
<p>At Meridian Law we prepare one for property and finances and one for health
and care. We are often asked whether the second is necessary. It is the one
families end up needing at the hardest moment, and it costs little alongside
the first.</p>
<p>A power of attorney is not a loss of control. It sits unused until it is
needed, you choose exactly who holds it, and you can revoke it at any time
while you have capacity.</p>`,
  },

  // ── blog posts: the sources ──────────────────────────────────────────────
  {
    type: "post",
    slug: "avoid-probate-ashford",
    path: "/blog/avoid-probate-ashford",
    title: "Can you avoid probate in Ashford?",
    html: `
<h2>Probate Administration, and when it is unavoidable</h2>
<p>The short answer is sometimes, partly, and rarely for free. Probate
Administration is the legal process of dealing with what someone owned after
they die, and whether it applies depends on what they owned and how it was
held.</p>
<p>Our clients in Ashford usually ask this after watching a friend spend a year
on an estate. That is a reasonable fear, but the cure is often worse than the
disease. Stripping assets out of your own name to dodge a process that happens
after your death can cost you control while you are still alive.</p>
<h2>Estate Planning, and what genuinely helps</h2>
<p>Jointly held property passes outside the estate. So do most pensions and any
life policy written in trust. The rest of it — the house in a sole name, the
savings, the shares — goes through the estate whatever you do.</p>
<p>The honest version is that good estate planning does not usually avoid
probate. It makes probate short. An executor who can find the paperwork, knows
what exists, and has clear authority finishes in months rather than years.</p>
<p>At Meridian Law we would rather make the administration cheap than make it
disappear. If you want to talk it through, the estate planning conversation is
the place to start, not a scheme sold on the internet.</p>`,
  },
  {
    type: "post",
    slug: "dying-without-a-will",
    path: "/blog/dying-without-a-will",
    title: "What happens if you die without a will",
    html: `
<h2>Estate Planning, and the rules that apply without it</h2>
<p>If you die without a will, a fixed statutory order decides who gets what.
The rules are old, rigid, and indifferent to your intentions. They do not know
that you and your partner never married, or that one of your children has not
spoken to you in a decade.</p>
<p>Our clients are usually surprised by two things. An unmarried partner
inherits nothing, however long you lived together. And a surviving spouse does
not automatically take everything once there are children and the estate is
large enough.</p>
<h2>Probate Administration without a will</h2>
<p>The estate still has to be administered. Probate administration without a
will means someone has to apply to be appointed, in a set order of priority,
and that person may not be who you would have chosen.</p>
<p>Every one of these problems is solved by an afternoon's estate planning.
At Meridian Law a straightforward will for a couple in Ashford is a fixed fee
and one meeting. The comparison is not will versus no will. It is one afternoon
now against a year of someone else's life later.</p>
<p>The same appointment is the right moment to sort out a power of attorney,
because the two documents cover the two things that actually go wrong.</p>`,
  },
  {
    type: "post",
    slug: "choosing-an-attorney",
    path: "/blog/choosing-an-attorney",
    title: "Choosing who holds your power of attorney",
    html: `
<h2>Power of Attorney, a job rather than an honour</h2>
<p>The most common mistake is treating it as a compliment to be handed to the
eldest child. A power of attorney is administrative work, often for years,
usually at a distance, frequently while grieving.</p>
<p>Our advice is to pick for temperament rather than seniority. The right
person is organised, reachable, willing to say no to relatives, and comfortable
keeping records they may one day have to justify.</p>
<h2>Estate Planning, and appointing more than one</h2>
<p>We usually suggest two attorneys who can act jointly and severally, so
either can sign when the other is abroad or ill. A single attorney is a single
point of failure, and replacing one after capacity is lost is not possible.</p>
<p>At Meridian Law we talk this through before drafting, because the document
is easy and the decision is not. The same conversation usually surfaces gaps in
the wider estate planning, especially where a business or a second property is
involved.</p>
<p>If the person you would have chosen has already lost capacity, a power of
attorney is no longer available and probate administration is not the answer
either — that situation needs a deputyship, and we can explain what it
involves.</p>`,
  },
  {
    type: "post",
    slug: "estate-planning-new-parents",
    path: "/blog/estate-planning-new-parents",
    title: "An estate planning checklist for new parents",
    html: `
<h2>Estate Planning, when there is suddenly someone smaller</h2>
<p>The first will most people make is the one made after a child arrives, and
it is usually made for one reason: guardianship. Naming who raises your
children if you both die is the single decision no one else can make for
you.</p>
<p>Our checklist for new parents in Ashford is short. Name guardians. Name
executors, and do not assume they are the same people. Decide at what age a
child should inherit outright, because eighteen is younger than most parents
think when they picture it.</p>
<h2>Probate Administration, and the parts people forget</h2>
<p>Check the death-in-service benefit from work and who it is nominated to.
Check any life policy is written in trust, so it pays out without waiting for
the estate. The estate planning documents and the nominations have to agree
with each other, and often they do not.</p>
<p>At Meridian Law we do this as one appointment with a will, guardianship
provisions and a power of attorney together, because new parents do not have a
second free afternoon.</p>
<p>If the worst does happen, the people you named still have to deal with
probate administration. The difference a plan makes is whether they spend that
time grieving or spend it on the phone to banks.</p>`,
  },
];

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cdata = (s) => `<![CDATA[${String(s).replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;

/**
 * Render the pack as a WordPress eXtended RSS file.
 *
 * WXR is what Tools → Import → WordPress consumes. Items are published
 * immediately so the REST API can see them without a further step.
 */
export function toWxr({ siteUrl = "https://example.com", author = "seo-automation" } = {}) {
  const now = new Date();
  const pubDate = now.toUTCString();
  const sqlDate = now.toISOString().slice(0, 19).replace("T", " ");

  const items = SEED_CONTENT.map((item, i) => {
    const postId = 1000 + i;
    return `
  <item>
    <title>${cdata(item.title)}</title>
    <link>${esc(siteUrl)}${esc(item.path)}</link>
    <pubDate>${pubDate}</pubDate>
    <dc:creator>${cdata(author)}</dc:creator>
    <guid isPermaLink="false">${esc(siteUrl)}/?p=${postId}</guid>
    <description></description>
    <content:encoded>${cdata(item.html.trim())}</content:encoded>
    <excerpt:encoded>${cdata("")}</excerpt:encoded>
    <wp:post_id>${postId}</wp:post_id>
    <wp:post_date>${cdata(sqlDate)}</wp:post_date>
    <wp:post_date_gmt>${cdata(sqlDate)}</wp:post_date_gmt>
    <wp:comment_status>${cdata("closed")}</wp:comment_status>
    <wp:ping_status>${cdata("closed")}</wp:ping_status>
    <wp:post_name>${cdata(item.slug)}</wp:post_name>
    <wp:status>${cdata("publish")}</wp:status>
    <wp:post_parent>0</wp:post_parent>
    <wp:menu_order>0</wp:menu_order>
    <wp:post_type>${cdata(item.type)}</wp:post_type>
    <wp:post_password>${cdata("")}</wp:post_password>
    <wp:is_sticky>0</wp:is_sticky>
  </item>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" ?>
<!--
  SEO Command Center — staging content pack.
  Import with: wp-admin → Tools → Import → WordPress → Upload file and import.
  Safe to import into a disposable staging site. Do not import into production.
-->
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wfw="http://wellformedweb.org/CommentAPI/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title>${esc(FIRM)}</title>
  <link>${esc(siteUrl)}</link>
  <description>Staging content pack</description>
  <pubDate>${pubDate}</pubDate>
  <language>en-GB</language>
  <wp:wxr_version>1.2</wp:wxr_version>
  <wp:base_site_url>${esc(siteUrl)}</wp:base_site_url>
  <wp:base_blog_url>${esc(siteUrl)}</wp:base_blog_url>
  <wp:author>
    <wp:author_id>1</wp:author_id>
    <wp:author_login>${cdata(author)}</wp:author_login>
    <wp:author_email>${cdata("seo-automation@example.invalid")}</wp:author_email>
    <wp:author_display_name>${cdata(author)}</wp:author_display_name>
  </wp:author>
${items}
</channel>
</rss>
`;
}

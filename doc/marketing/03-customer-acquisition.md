# Wormhole Customer Acquisition Strategy

## Acquisition Funnel Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  AWARENESS                                                       │
│  "I've heard of Wormhole"                                       │
│  Target: 100,000 impressions/month                              │
├─────────────────────────────────────────────────────────────────┤
│  INTEREST                                                        │
│  "I want to learn more"                                         │
│  Target: 10,000 website visits/month                            │
├─────────────────────────────────────────────────────────────────┤
│  CONSIDERATION                                                   │
│  "I'm comparing options"                                        │
│  Target: 2,000 downloads/month                                  │
├─────────────────────────────────────────────────────────────────┤
│  CONVERSION                                                      │
│  "I'm using Wormhole"                                           │
│  Target: 500 MAU/month growth                                   │
├─────────────────────────────────────────────────────────────────┤
│  RETENTION                                                       │
│  "I use Wormhole regularly"                                     │
│  Target: 60% 30-day retention                                   │
├─────────────────────────────────────────────────────────────────┤
│  REFERRAL                                                        │
│  "I tell others about Wormhole"                                 │
│  Target: 1.5 viral coefficient                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Customer Segments & Acquisition Channels

### Segment 1: Freelance Video Editors

**Demographics:**
- Age: 25-45
- Location: LA, NYC, London, Sydney, Toronto (media hubs)
- Income: $50K-150K/year
- Gender: 60% male, 40% female
- Education: Film school, self-taught, bootcamps

**Psychographics:**
- Values creative freedom over stability
- Frustrated with "rent-seeking" software subscriptions
- Active in online communities for tips and resources
- Influenceable by peers and respected creators

**Acquisition Channels:**

| Channel | Tactic | Expected CAC | Priority |
|---------|--------|--------------|----------|
| **YouTube** | Sponsor editing tutorials (Peter McKinnon, Casey Neistat type) | $2-5/install | High |
| **Reddit** | Organic posts in r/VideoEditing, r/editors, r/DaVinciResolve | $0 | High |
| **Discord** | Join editing communities, provide value, mention when relevant | $0 | High |
| **Twitter/X** | Engage with #VideoEditing, #PostProduction threads | $0 | Medium |
| **ProductHunt** | Launch with video demo | $0 | High (one-time) |
| **SEO** | "Frame.io alternative", "Dropbox alternative for video" | $0 | Medium |

**Key Messages:**
- "Stop waiting 30 minutes for your 50GB render to upload"
- "Collaborate with your colorist without paying for another Frame.io seat"
- "Mount your render farm's output folder while files are still rendering"

---

### Segment 2: Indie Game Developers

**Demographics:**
- Age: 20-40
- Location: Global (strong in EU, NA, East Asia)
- Income: Varies widely ($0-200K)
- Gender: 80% male, 20% female (industry average)
- Education: CS degree, bootcamp, self-taught

**Psychographics:**
- Highly technical, comfortable with CLI
- Open-source friendly
- Budget-conscious (especially solo devs)
- Values tools that "just work"

**Acquisition Channels:**

| Channel | Tactic | Expected CAC | Priority |
|---------|--------|--------------|----------|
| **Reddit** | r/gamedev, r/indiedev, r/unrealengine, r/godot | $0 | High |
| **Twitter/X** | #gamedev, #indiedev, #screenshotsaturday | $0 | High |
| **Discord** | Game dev servers (Godot, Unity, Unreal communities) | $0 | High |
| **Itch.io** | Blog posts, devlog mentions | $0 | Medium |
| **GitHub** | Stars, trending, open-source visibility | $0 | High |
| **YouTube** | Sponsor devlog channels (Brackeys alumni, Game Dev Garage) | $3-7/install | Medium |
| **HackerNews** | "Show HN" post | $0 | High (one-time) |

**Key Messages:**
- "Mount your build server's output folder - test instantly on all platforms"
- "Replace Perforce for asset-only shares (free!)"
- "Share game builds with QA testers without uploading to a cloud"

---

### Segment 3: VFX/Motion Graphics Studios

**Demographics:**
- Company size: 5-50 employees
- Location: LA, Vancouver, London, Montreal, Auckland
- Annual revenue: $500K-10M
- Decision maker: Studio lead, IT manager, or senior artist

**Psychographics:**
- Extremely deadline-driven
- Willing to pay for tools that save time
- Concerned about data security (client NDA files)
- Often frustrated with enterprise tool complexity

**Acquisition Channels:**

| Channel | Tactic | Expected CAC | Priority |
|---------|--------|--------------|----------|
| **Direct outreach** | Email studio leads with case study | $10-20/lead | High |
| **LinkedIn** | Target "VFX Supervisor", "Post-Production Manager" | $5-15/lead | Medium |
| **Industry events** | NAB, SIGGRAPH, IBC (booth or guerrilla) | $50-100/lead | Medium |
| **Trade publications** | Post Magazine, Broadcast, Animation Magazine | $20-50/lead | Low |
| **Referrals** | Existing studio → their vendors/clients | $0 | High |

**Key Messages:**
- "Replace Resilio + Dropbox. Save $400+/month."
- "Onboard freelancers in 30 seconds - no seat management"
- "Your files never touch a third-party server"

---

### Segment 4: Remote Development Teams (Future)

**Demographics:**
- Company size: 10-100 employees
- Industry: SaaS, fintech, agencies
- Tech stack: Modern (React, Node, Python, Go)
- Location: Global (SF, NYC, Berlin, London, Bangalore)

**Psychographics:**
- Already using 5+ SaaS tools
- Privacy/compliance concerns (GDPR, SOC2)
- DevOps-minded, appreciate automation
- Willing to pay for team features

**Acquisition Channels (Future - after team features):**

| Channel | Tactic | Expected CAC | Priority |
|---------|--------|--------------|----------|
| **Dev.to / Medium** | Technical blog posts | $0 | Medium |
| **HackerNews** | Technical deep-dives | $0 | Medium |
| **Twitter/X** | Engage with DevOps, remote work communities | $0 | Medium |
| **LinkedIn Ads** | Target "Engineering Manager", "DevOps Lead" | $15-30/lead | Low |
| **Podcast sponsorship** | Changelog, Software Engineering Daily | $500-2000/episode | Low |

---

## Channel Deep Dives

### Reddit Strategy

**Target Subreddits:**

| Subreddit | Subscribers | Posting Style | Timing |
|-----------|-------------|---------------|--------|
| r/VideoEditing | 350K | Helpful, show workflow | When showing use case |
| r/editors | 75K | Professional, no hype | When asked about tools |
| r/DaVinciResolve | 120K | Technical, specific | When discussing renders |
| r/gamedev | 1.3M | Show, don't tell | #ScreenshotSaturday |
| r/indiedev | 200K | Devlog style | When sharing progress |
| r/selfhosted | 300K | Technical, privacy-focused | When comparing to cloud |
| r/DataHoarder | 500K | Storage-obsessed | When discussing P2P/storage |
| r/linux | 800K | Open-source friendly | When discussing FUSE |

**Posting Principles:**
1. **Provide value first** - Answer questions, share knowledge, then mention Wormhole
2. **No astroturfing** - Be transparent about being creator/team
3. **Engage genuinely** - Reply to comments, address concerns
4. **Use native format** - Text posts > link posts, embedded video > YouTube links

**Example Post (r/VideoEditing):**
```
Title: I built a tool to mount my render farm output folder on my editing machine

Body:
I was tired of waiting for renders to upload to the cloud before I could start editing,
so I built Wormhole - it lets me mount any folder from my render machine directly on
my MacBook Pro as if it were a local drive.

Now I can start editing proxy files while the full-res renders are still rendering.
No upload, no download, just... there.

It's free and open source: [link]

Happy to answer any questions about how it works.
```

---

### YouTube Strategy

**Content Types:**

| Type | Length | Goal | Example |
|------|--------|------|---------|
| **Tutorial** | 5-10 min | Show workflow | "How to mount your render farm with Wormhole" |
| **Comparison** | 8-12 min | SEO + differentiation | "Wormhole vs Dropbox vs Resilio for video editors" |
| **Demo** | 2-3 min | Quick proof | "50GB render folder mounted in 10 seconds" |
| **Behind the scenes** | 10-15 min | Build trust | "How we built Wormhole (technical deep dive)" |

**Sponsorship Targets:**

| Creator | Subscribers | Audience | Est. Cost | Fit |
|---------|-------------|----------|-----------|-----|
| **Gerald Undone** | 400K | Filmmakers, gear | $3-5K | High |
| **Daniel Schiffer** | 2M | Cinematic B-roll | $10-20K | Medium |
| **Corridor Crew** | 10M | VFX, filmmaking | $50K+ | High (aspirational) |
| **Brackeys** (alumni) | 1.5M | Game dev (retired) | N/A | Archive SEO |
| **Game Dev Garage** | 100K | Indie game dev | $1-2K | High |
| **Fireship** | 2.5M | Developers | $5-10K | Medium |

**Sponsorship Script Template:**
```
"This video is sponsored by Wormhole.

You know how uploading renders to the cloud takes forever?
Wormhole lets you skip that entirely.

You share a code, your collaborator connects, and they can access your files
directly - like mounting a network drive, but over the internet.

No cloud storage, no monthly fees, end-to-end encrypted.

Link in the description. Now back to the video."
```

---

### Twitter/X Strategy

**Account Positioning:**
- Handle: @wormholeapp or @usewormhole
- Bio: "Mount any folder from any computer. No setup. Free & open source."
- Pinned: Demo video or launch thread

**Content Calendar:**

| Day | Content Type | Example |
|-----|--------------|---------|
| Mon | Use case thread | "5 ways video editors use Wormhole" |
| Tue | Technical insight | "How QUIC makes Wormhole faster than traditional file sharing" |
| Wed | Community highlight | RT user success story |
| Thu | Comparison/education | "Cloud sync vs P2P mount - what's the difference?" |
| Fri | Fun/meme | Industry pain point humor |
| Sat | Engage with community | Reply to #VideoEditing, #gamedev threads |
| Sun | Rest or founder story | Personal angle on why we built this |

**Hashtags to Monitor:**
- #VideoEditing, #PostProduction, #FilmTwitter
- #GameDev, #IndieGame, #ScreenshotSaturday
- #SelfHosted, #FOSS, #OpenSource
- #RemoteWork, #DigitalNomad

**Engagement Tactics:**
1. **Quote tweet pain points** with solution hint
2. **Reply to tool recommendations** threads
3. **Celebrate user wins** publicly
4. **Engage with competitors' unhappy customers** (tastefully)

---

### ProductHunt Launch Strategy

**Pre-Launch (2 weeks before):**
- [ ] Build "coming soon" page with email capture
- [ ] Ship to 50-100 beta testers
- [ ] Collect testimonials and polish based on feedback
- [ ] Prepare all assets (logo, screenshots, video, description)
- [ ] Identify hunters to approach (optional)
- [ ] Schedule launch for Tuesday/Wednesday (highest traffic)

**Launch Day:**
- [ ] Post at 12:01 AM PT (earliest allowed)
- [ ] Share on all social channels immediately
- [ ] Post to Reddit communities (without asking for upvotes)
- [ ] Email beta testers asking for support
- [ ] Be available all day to reply to comments
- [ ] Cross-post to HackerNews mid-morning

**Listing Content:**

**Tagline:** "Mount any folder from any computer. No setup."

**Description:**
```
Wormhole lets you share any folder with a simple code.
Others can mount it as a local drive on their machine.

Perfect for:
- Video editors sharing renders without cloud uploads
- Game devs distributing builds to testers
- Teams replacing expensive sync tools

Features:
- Cross-platform (Mac, Windows, Linux)
- End-to-end encrypted
- No accounts, no monthly fees
- Open source

We built Wormhole because we were tired of waiting for cloud syncs.
Now we share a code and files just... appear.
```

**First Comment (from maker):**
```
Hey PH!

I'm [Name], creator of Wormhole.

I spent years frustrated by:
- 30-minute uploads for video renders
- $50/month for Frame.io + Dropbox seats
- 15-step Syncthing configurations

So I built what I wanted: mount any folder, anywhere, with just a code.

Some numbers from beta:
- 50GB folder accessible in <10 seconds
- $0/month vs $50+/month in cloud costs
- 1 step vs 15 steps to set up

It's free, open source, and I'd love your feedback.

What's your biggest file sharing frustration?
```

**Target:** Top 5 Product of the Day (500+ upvotes)

---

### SEO Strategy

**Target Keywords:**

| Keyword | Monthly Volume | Difficulty | Intent |
|---------|---------------|------------|--------|
| "syncthing alternative" | 1,000 | Low | Comparison |
| "resilio sync alternative" | 500 | Low | Comparison |
| "frame.io alternative" | 800 | Medium | Comparison |
| "p2p file sharing" | 2,500 | Medium | Discovery |
| "mount remote folder" | 400 | Low | Technical |
| "share files without cloud" | 600 | Low | Problem-aware |
| "free file sync software" | 3,000 | High | Discovery |
| "dropbox alternative free" | 2,000 | High | Comparison |

**Content Strategy:**

| Page | Target Keyword | Type |
|------|----------------|------|
| Homepage | "p2p file sharing" | Product |
| /vs/syncthing | "syncthing alternative" | Comparison |
| /vs/dropbox | "dropbox alternative" | Comparison |
| /vs/resilio | "resilio sync alternative" | Comparison |
| /use-cases/video-editors | "video file sharing" | Use case |
| /use-cases/game-dev | "game build distribution" | Use case |
| /blog/how-fuse-works | "mount remote folder" | Educational |

---

## Paid Acquisition (Future)

### When to Start Paid Ads

**Prerequisites:**
1. Organic CAC established (baseline to beat)
2. Retention > 40% at 30 days
3. Landing page conversion > 10%
4. Clear understanding of LTV (even if free tier)

### Twitter/X Ads

**Verdict: Medium Priority**

| Pros | Cons |
|------|------|
| Precise targeting by interest/following | Expensive CPM ($5-15) |
| Good for developer/creative audiences | Low purchase intent |
| Engagement ads relatively cheap | Algorithm changes frequently |

**Recommended:** Promoted tweets for launch, not ongoing spend

**Target Audiences:**
- Followers of: @frame_io, @Dropbox, @resaborern, @synaborcthing
- Interests: Video editing, game development, Linux, open source
- Job titles: Video editor, VFX artist, game developer

**Budget:** $500-1,000 for launch week, pause and evaluate

---

### YouTube Ads

**Verdict: High Priority (for awareness)**

| Pros | Cons |
|------|------|
| Video format perfect for demos | Skip rate high |
| Target by channel/video | Need quality creative |
| Lower CPM than Twitter | Attribution harder |

**Ad Types:**
1. **Skippable in-stream (6-15 sec):** Hook in first 5 seconds, CTA at end
2. **Non-skippable (15 sec):** Full demo, use sparingly
3. **Discovery ads:** Thumbnail + headline, appears in search

**Targeting:**
- Channels: DaVinci Resolve tutorials, Premiere Pro tutorials, game dev vlogs
- Videos: "Frame.io tutorial", "Syncthing setup", "Dropbox alternatives"
- Interests: Video editing software, game development, cloud storage

**Budget:** $1,000-2,000/month (after launch)

---

### Reddit Ads

**Verdict: Low Priority**

| Pros | Cons |
|------|------|
| Subreddit targeting | Community hates ads |
| Cheap CPM | Low CTR |
| Good for awareness | Organic better for this audience |

**Recommendation:** Focus on organic Reddit engagement. Ads only for major launches.

---

### Google Ads

**Verdict: Medium Priority (for intent-based)**

| Pros | Cons |
|------|------|
| High intent (searching for solution) | Expensive for competitive terms |
| Clear attribution | Requires landing page optimization |

**Target Keywords:**
- "syncthing alternative" (low competition)
- "resilio sync free alternative" (low competition)
- "share large files without cloud" (medium)
- "mount remote folder mac" (low)

**Budget:** $500/month, focused on long-tail keywords

---

## Viral & Referral Mechanics

### Built-in Virality

**The Join Code = Viral Loop**

Every time someone uses Wormhole, they share a code with someone else.
That person needs Wormhole to connect.
→ Every active user is an acquisition channel.

**Viral Coefficient Target:** 1.5+ (each user brings 1.5 new users)

### Enhancing Virality

| Tactic | Implementation |
|--------|----------------|
| **Branded share links** | `wormhole.app/join/XXXX-XXXX` |
| **Clipboard awareness** | Detect code in clipboard, prompt to connect |
| **"Powered by Wormhole"** | Optional badge in shared folder |
| **First-share incentive** | Unlock dark theme after first share |
| **Invite tracking** | See how many people connected via your codes |

### Referral Program (Future)

**Structure:**
- Free tier: Thank you, community recognition
- Pro tier (future): 1 month free for each referral who converts

---

## Metrics & Attribution

### Key Metrics by Stage

| Stage | Metric | Target | Measurement |
|-------|--------|--------|-------------|
| Awareness | Impressions | 100K/mo | Social analytics |
| Interest | Website visits | 10K/mo | Google Analytics |
| Consideration | Downloads | 2K/mo | GitHub releases + installers |
| Conversion | Installed + shared | 500/mo | Telemetry (opt-in) |
| Retention | 30-day active | 60% | Telemetry (opt-in) |
| Referral | Codes shared | 1.5 per user | Telemetry (opt-in) |

### Attribution Setup

**UTM Parameters:**
- `utm_source`: twitter, reddit, youtube, producthunt, etc.
- `utm_medium`: organic, paid, referral
- `utm_campaign`: launch, comparison-post, sponsor-[creator]

**Example:**
```
wormhole.app?utm_source=youtube&utm_medium=sponsor&utm_campaign=gerald-undone-jan25
```

### Analytics Stack

| Tool | Purpose | Cost |
|------|---------|------|
| **Plausible** | Privacy-friendly web analytics | $9/mo |
| **GitHub Insights** | Repo traffic, stars | Free |
| **PostHog** | Product analytics (self-hosted) | Free |
| **Custom telemetry** | In-app metrics (opt-in) | Free |

---

## Budget Allocation

### Year 1 Marketing Budget: $20,000

| Category | Allocation | Amount |
|----------|------------|--------|
| **Content/Video Production** | 30% | $6,000 |
| **YouTube Sponsorships** | 25% | $5,000 |
| **Paid Ads (Twitter, YouTube, Google)** | 20% | $4,000 |
| **Events/Swag** | 15% | $3,000 |
| **Tools/Software** | 10% | $2,000 |

### Spend Timeline

| Quarter | Focus | Budget |
|---------|-------|--------|
| Q1 | Launch (ProductHunt, HN, organic) | $2,000 |
| Q2 | Content + first sponsorship | $5,000 |
| Q3 | Paid acquisition testing | $6,000 |
| Q4 | Scale what works | $7,000 |

---

## Acquisition Playbook Summary

### Do First (Low Cost, High Impact)

1. Post to Reddit communities (organic)
2. Launch on ProductHunt
3. Post to HackerNews
4. Create comparison pages for SEO
5. Engage on Twitter with target audience
6. Build demo video for YouTube

### Do Next (Medium Investment)

1. Sponsor 1-2 mid-tier YouTube creators
2. Start Google Ads on long-tail keywords
3. Publish case studies with early users
4. Guest post on relevant blogs

### Do Later (Higher Investment)

1. Scale YouTube sponsorships
2. Attend industry events (NAB, SIGGRAPH)
3. Launch referral program
4. Consider podcast sponsorships

---

## Appendix: Competitor Ad Analysis

### Dropbox
- Heavy brand advertising (TV, billboards)
- Google Ads on "file sharing", "cloud storage"
- Focus on trust, collaboration

### Resilio
- Minimal paid advertising
- Relies on SEO and word-of-mouth
- Enterprise sales-focused

### Frame.io
- YouTube pre-roll on video editing content
- Sponsorships of film festivals
- Integration partnerships (Adobe)

**Wormhole Opportunity:** They're not competing on "free", "P2P", or "privacy". We own those angles.

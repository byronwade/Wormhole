# Wormhole Guerrilla Marketing Playbook

## Philosophy

> **Guerrilla marketing is about creativity over budget.**
> Make people stop, think, and share - without paying for attention.

**Core Principles:**
1. **Be remarkable** - Do something worth talking about
2. **Be helpful** - Provide value, not just promotion
3. **Be authentic** - Real stories beat polished ads
4. **Be everywhere they are** - Show up where the audience already gathers
5. **Be patient** - Compound interest applies to attention too

---

## Digital Guerrilla Tactics

### 1. The "Pain Point Validator"

**Concept:** Find people complaining about the exact problem Wormhole solves. Reply with empathy first, solution second.

**Execution:**
```
Step 1: Set up monitoring for:
- "uploading to dropbox takes forever"
- "syncthing is so confusing"
- "frame.io is so expensive"
- "waiting for renders to sync"
- "hate cloud storage"

Tools: TweetDeck, Google Alerts, Reddit search

Step 2: When you find a complaint, reply:
"Felt this. I was spending 30+ min/day waiting for uploads.

Built something to fix it for myself - mounts folders directly
instead of uploading. Free if you want to try: [link]

No pressure, just hate seeing others stuck in the same loop."
```

**Rules:**
- Wait 5-10 min before replying (don't look like a bot)
- Only reply if genuinely relevant
- Don't spam the same person twice
- Be helpful even if they don't want your product

**Expected Results:**
- 1-5 genuine conversations per week
- 10-20% conversion to trying product
- Authentic testimonials and feedback

---

### 2. The "Comparison Calculator"

**Concept:** Build a free tool that shows how much people are spending on cloud storage vs. what they'd spend with Wormhole ($0).

**Landing Page:** `wormhole.app/savings`

```
┌─────────────────────────────────────────────────────┐
│  💸 HOW MUCH ARE YOU PAYING TO ACCESS YOUR OWN FILES? │
├─────────────────────────────────────────────────────┤
│                                                     │
│  I use:                                             │
│  ☐ Dropbox      ☐ Google Drive   ☐ Frame.io        │
│  ☐ Box          ☐ OneDrive       ☐ Resilio         │
│  ☐ iCloud       ☐ Backblaze      ☐ Other           │
│                                                     │
│  Monthly cost: $[___] /month                        │
│  Team size: [___] people                            │
│                                                     │
│  [ Calculate My Savings ]                           │
│                                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  YOUR ANNUAL CLOUD TAX:  $1,440                     │
│  WITH WORMHOLE:          $0                         │
│  YOUR SAVINGS:           $1,440/year                │
│                                                     │
│  Over 5 years: $7,200                               │
│                                                     │
│  [ Get Wormhole Free ]                              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Shareability:**
- Generate shareable image: "I save $X/year by not uploading my own files"
- Tweet template pre-filled
- Leaderboard of biggest savers (anonymous)

**Distribution:**
- Share on r/DataHoarder, r/selfhosted
- Post to personal finance communities
- SEO for "dropbox cost calculator"

---

### 3. The "Speed Race"

**Concept:** Create viral video content showing Wormhole vs. cloud upload for large files.

**Video Format:**
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│    DROPBOX              vs.            WORMHOLE     │
│  ┌─────────────┐                 ┌─────────────┐   │
│  │             │                 │             │   │
│  │  Uploading  │                 │  Mounted    │   │
│  │    45%      │                 │  ✓ DONE     │   │
│  │             │                 │             │   │
│  │  ETA: 12min │                 │  Time: 8sec │   │
│  │             │                 │             │   │
│  └─────────────┘                 └─────────────┘   │
│                                                     │
│     50GB VIDEO FILE - REAL TIME COMPARISON          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Execution:**
1. Record split-screen comparison
2. Use real file sizes (50GB, 100GB)
3. Time-lapse the cloud upload, real-time the Wormhole mount
4. End with text: "Why wait? wormhole.app"

**Distribution:**
- TikTok (tech community)
- YouTube Shorts
- Twitter/X
- Instagram Reels
- r/oddlysatisfying (for the speed contrast)

---

### 4. The "Conference Photobomb"

**Concept:** At relevant conferences (NAB, SIGGRAPH, GDC), be everywhere without a booth.

**Tactics:**

**Sticker Bombing (Ethical):**
- Print 1,000 high-quality die-cut stickers
- Purple wormhole logo, small text: "wormhole.app"
- Hand them out, leave on community sticker walls
- Cost: ~$200

**T-Shirt Walking Billboard:**
- Custom shirts: "Ask me how I share 50GB in 10 seconds"
- Back: "wormhole.app"
- Wear around conference, especially during networking events
- Cost: ~$50

**QR Code Drops:**
- Print cards with just a QR code and "?"
- Leave on tables during sessions, lunch areas
- QR goes to demo video
- Cost: ~$50

**Hallway Demos:**
- Set up laptop near busy areas
- Run live demo for anyone curious
- "Want to see something cool?" opener
- Cost: $0

**After-Party Mentions:**
- Attend unofficial networking events
- Natural conversation about what you're building
- Cost: Event drinks

**Budget:** ~$500 total per conference

---

### 5. The "Open Source Trojan Horse"

**Concept:** Contribute to related open source projects, becoming known in the community before promoting Wormhole.

**Target Projects:**
| Project | Contribution | Visibility |
|---------|--------------|------------|
| fuser (Rust FUSE) | Bug fixes, docs | Rust community |
| quinn (QUIC) | Examples, tests | Networking community |
| Tauri | Plugins, tutorials | Desktop app community |
| DaVinci Resolve forums | Workflow tips | Video editors |
| Godot forums | Asset pipeline tips | Game devs |

**Execution:**
1. Genuinely contribute (not just for promotion)
2. Build reputation over 2-3 months
3. When relevant, mention: "I'm also building Wormhole, which uses [project]"
4. Community members become early advocates

**Rules:**
- Never spam or self-promote inappropriately
- Contribute real value first
- Be patient - this is a 6-12 month play

---

### 6. The "Micro-Case Study Blitz"

**Concept:** Create 20 mini case studies (100-200 words each) from early users, optimized for different niches.

**Format:**
```
┌─────────────────────────────────────────────────────┐
│  🎬 "I edit for 3 YouTubers remotely"              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Before Wormhole:                                   │
│  "Each creator uploaded 50-100GB to Google Drive.  │
│  I'd wait 2+ hours for everything to sync before   │
│  I could start editing. 6+ hours/week wasted."     │
│                                                     │
│  After Wormhole:                                    │
│  "Now I just mount their Renders folder directly.  │
│  I can start editing while they're still exporting.│
│  Saved 6 hours/week = 300 hours/year."             │
│                                                     │
│  — Marcus, Freelance Video Editor, LA              │
│                                                     │
│  [ Try Wormhole Free → ]                           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Niches to Cover:**
1. Freelance video editor (YouTube)
2. Freelance video editor (corporate)
3. Wedding videographer
4. Solo game developer
5. Indie game studio (2-5 people)
6. VFX freelancer
7. Motion graphics artist
8. Colorist
9. Sound designer
10. Podcast producer
11. Photographer (large RAW files)
12. 3D artist (Blender)
13. Architecture visualization
14. Remote developer team
15. Data scientist (large datasets)
16. Machine learning (model files)
17. Music producer (stems/sessions)
18. Documentary filmmaker
19. Live streaming (VOD backup)
20. Academic researcher (data sharing)

**Distribution:**
- Dedicated landing page per niche: `/for/video-editors`
- Reddit posts to niche subreddits
- SEO for "[niche] file sharing"
- Twitter threads for each niche

---

### 7. The "Competitor Migration Guide"

**Concept:** Create detailed guides for switching from each competitor to Wormhole.

**Pages to Create:**
- `/migrate/from-dropbox`
- `/migrate/from-google-drive`
- `/migrate/from-syncthing`
- `/migrate/from-resilio`
- `/migrate/from-frame-io`

**Content Structure:**
```
# Switching from [Competitor] to Wormhole

## Why People Switch
- [Pain point 1]
- [Pain point 2]
- [Pain point 3]

## What You'll Gain
- [Benefit 1]
- [Benefit 2]
- [Benefit 3]

## What's Different
| Feature | [Competitor] | Wormhole |
|---------|--------------|----------|
| ...     | ...          | ...      |

## Step-by-Step Migration
1. Download Wormhole
2. [Steps specific to competitor workflow]
3. ...

## FAQ
Q: Can I keep using [Competitor] alongside Wormhole?
A: Yes! Many users use cloud for backup, Wormhole for active sharing.

## Success Stories
[Mini case studies from former competitor users]
```

**SEO Value:**
- Ranks for "[competitor] alternative"
- Ranks for "switch from [competitor]"
- Captures high-intent searchers

---

### 8. The "Live Build in Public"

**Concept:** Document the entire development process publicly, building audience as you build product.

**Channels:**
| Platform | Content | Frequency |
|----------|---------|-----------|
| Twitter/X | Daily/weekly updates | 3-5x/week |
| YouTube | Dev vlogs | 2x/month |
| Blog | Technical deep dives | 2x/month |
| GitHub | Open issues, discussions | Always open |

**Content Ideas:**

**Twitter Threads:**
- "How we handle NAT traversal (thread)"
- "Why we chose QUIC over TCP"
- "User feedback that changed our roadmap"
- "Revenue update: $0 but here's the plan"
- "Bug that took me 3 days to fix (embarrassing)"

**YouTube Vlogs:**
- "Building a file system in Rust - Week 1"
- "First 100 users - what we learned"
- "Why I quit my job to build this"

**Blog Posts:**
- "Technical Architecture of Wormhole"
- "How PAKE Makes Join Codes Secure"
- "Benchmarking QUIC vs TCP for File Transfer"

**Why It Works:**
- Builds trust through transparency
- Attracts technical early adopters
- Creates content library for SEO
- Generates ideas from community feedback

---

### 9. The "Anti-Cloud Manifesto"

**Concept:** Write a provocative piece that crystallizes the problem and positions Wormhole as the solution.

**Title:** "Your Files Are Hostages: A Case Against Cloud Dependency"

**Outline:**
```
1. The Convenience Trap
   - How cloud storage became default
   - The boiling frog of subscription fees

2. The Hidden Costs
   - Monthly fees add up
   - Upload/download time is stolen time
   - Privacy erosion
   - Vendor lock-in

3. The Absurdity
   - You're paying to store files you already have
   - You're waiting to access your own data
   - A stranger has a copy of everything

4. The Alternative
   - What if your files never left your control?
   - What if "sharing" didn't mean "uploading"?
   - What if collaboration was direct?

5. The Path Forward
   - P2P isn't new, but it's newly practical
   - Introduction to Wormhole
   - Join the movement
```

**Distribution:**
- Personal blog/Medium
- Submit to HackerNews
- Share on relevant subreddits
- Cross-post to dev.to

**Risk:** May be seen as preachy. Balance with humor and self-awareness.

---

### 10. The "Creator Partnership"

**Concept:** Give creative professionals free early access + support in exchange for honest content.

**Offer:**
```
"Hey [Creator],

I'm building a tool for video editors and would love your brutal
honest feedback.

Wormhole lets you mount remote folders directly - no cloud uploads.
For example, you could mount your render machine's output and start
editing while files are still rendering.

I'll give you:
- Early access to all features
- Direct support (you text me, I fix it)
- Credit as early advisor if you like it

You give me:
- Honest feedback (public or private)
- Permission to quote you if you say nice things
- Nothing if you don't like it

No strings. If it sucks, tell me and I'll make it better.

Interested?
```

**Target Creators:**
- YouTubers who complain about file management
- Indie devs who discuss tooling
- Podcast hosts who do video too
- Streamers who edit VODs

**Why It Works:**
- Creators love being "first" to discover tools
- Authentic feedback improves product
- Genuine testimonials are gold
- Some will make content about it organically

---

## Physical Guerrilla Tactics

### 1. Strategic Sticker Placement

**Locations:**
- Coffee shops near studios/agencies
- Co-working spaces (desks, bathrooms)
- Tech meetup venues
- University computer labs (media departments)
- Apple Store areas (guerrilla, not on products)

**Sticker Designs:**

**Design 1: Curiosity Hook**
```
┌───────────────────┐
│                   │
│  Why upload       │
│  when you can     │
│  connect?         │
│                   │
│  wormhole.app     │
│                   │
└───────────────────┘
```

**Design 2: Logo Only**
```
┌───────────────────┐
│                   │
│    [Wormhole      │
│     Logo]         │
│                   │
│  wormhole.app     │
│                   │
└───────────────────┘
```

**Design 3: QR Mystery**
```
┌───────────────────┐
│                   │
│     [QR Code]     │
│                   │
│        ?          │
│                   │
└───────────────────┘
```

**Budget:** $100-300 for 500-1000 stickers

---

### 2. Local Meetup Sponsorship

**Target Meetups:**
- Video editing groups
- Game dev meetups
- Rust/programming meetups
- Creative professional networking

**Sponsorship Offer:**
```
"Hey [Organizer],

I'd love to sponsor pizza/drinks for your next meetup.

In exchange, I'd just ask for:
- 60 seconds to demo Wormhole
- Flyers on the tables
- Mention in the event description

Budget: $100-200

Let me know if that works!
```

**Why It Works:**
- Meetup organizers always need sponsors
- Captive, relevant audience
- In-person demos are powerful
- Low cost per impression

---

### 3. Hackathon Presence

**Strategy:**
- Sponsor small prizes at hackathons ($100-500)
- Mentor teams, help with file sharing challenges
- Distribute stickers/swag
- Connect with technical early adopters

**Prize Ideas:**
- "Best Use of P2P Technology" - $500
- "Most Creative File Sharing Hack" - $250
- General swag for everyone

**Target Hackathons:**
- University hackathons (MLH events)
- Game jams (Global Game Jam, Ludum Dare)
- Local tech hackathons

---

### 4. Campus Ambassador Program (Future)

**Concept:** Recruit students at film schools and game dev programs to spread word.

**Ambassador Responsibilities:**
- Post in school Discord/Slack
- Demo to classmates
- Collect feedback
- Create content

**Ambassador Benefits:**
- Early access to features
- Direct line to founders
- Resume/portfolio credit
- Potential for paid internship

**Target Schools:**
- USC School of Cinematic Arts
- NYU Tisch
- UCLA Film
- DigiPen
- Full Sail
- Ringling

---

## Measurement

### Guerrilla Metrics

| Tactic | Primary Metric | How to Track |
|--------|---------------|--------------|
| Pain Point Validator | Conversations started | Manual count |
| Savings Calculator | Tool usage | Analytics |
| Speed Race Videos | Views, shares | Platform analytics |
| Conference Presence | Stickers distributed, leads | Manual count |
| Open Source Trojan | GitHub stars from mentions | GitHub referrers |
| Case Study Blitz | Page views per niche | Analytics |
| Migration Guides | SEO rankings | Search console |
| Build in Public | Followers gained | Social analytics |
| Anti-Cloud Manifesto | Reads, shares | Platform analytics |
| Creator Partnerships | Content created | Manual tracking |

### ROI Estimation

| Tactic | Time Investment | Cash Investment | Expected Downloads |
|--------|-----------------|-----------------|-------------------|
| Pain Point Validator | 5 hrs/week | $0 | 10-20/month |
| Savings Calculator | 20 hrs (once) | $0 | 50-100/month |
| Speed Race Videos | 10 hrs/video | $0 | 100-500/video |
| Conference Presence | 3 days | $500-1000 | 50-200/conference |
| Open Source Trojan | 5 hrs/week | $0 | Long-term |
| Case Study Blitz | 40 hrs (once) | $0 | 100-500/month |
| Migration Guides | 20 hrs (once) | $0 | 200-1000/month |
| Build in Public | 5 hrs/week | $0 | Ongoing |
| Anti-Cloud Manifesto | 10 hrs (once) | $0 | 500-5000 (spike) |
| Creator Partnerships | 5 hrs/partner | $0-500 | 100-1000/partner |

---

## Calendar Template

### Week 1-4: Foundation

| Week | Focus | Tactics |
|------|-------|---------|
| 1 | Setup | Create monitoring, sticker designs, calculator |
| 2 | Content | Speed race video, first case studies |
| 3 | Distribution | Reddit posts, Twitter launch |
| 4 | Iteration | Analyze results, double down on winners |

### Ongoing Monthly Calendar

| Week | Monday | Tuesday | Wednesday | Thursday | Friday |
|------|--------|---------|-----------|----------|--------|
| 1 | Pain point monitoring | Twitter content | Reddit post | Case study | Review metrics |
| 2 | Build in public update | YouTube content | Community engagement | Partnership outreach | Analyze & adjust |
| 3 | Pain point monitoring | Twitter content | Reddit post | Migration guide | Review metrics |
| 4 | Build in public update | YouTube content | Community engagement | Open source contribution | Monthly review |

---

## Guerrilla Mindset

### Do's
- Be genuinely helpful first
- Embrace creativity over cash
- Test small, scale what works
- Be consistent (show up daily)
- Document everything for learning

### Don'ts
- Spam or astroturf (it always backfires)
- Promise what you can't deliver
- Neglect product for marketing
- Expect overnight results
- Copy tactics without adapting

### The Long Game

Guerrilla marketing compounds:
- Month 1: 100 people hear about Wormhole
- Month 3: 1,000 people, 50 passionate users
- Month 6: 5,000 people, 200 advocates
- Month 12: 20,000 people, word-of-mouth takes over

**The goal isn't viral fame. It's building a tribe of true believers who do the marketing for you.**

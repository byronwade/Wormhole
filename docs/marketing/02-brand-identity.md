# Wormhole Brand Identity Guidelines

## Brand Essence

### Core Identity

**Brand Name:** Wormhole

**Why "Wormhole":**
- In physics, a wormhole is a theoretical passage through spacetime that creates shortcuts for long journeys
- Perfect metaphor: Files traverse "instantly" between machines, bypassing the cloud
- Memorable, single word, easy to spell
- Available as domain: wormhole.app, getwormhole.com, usewormhole.io
- Evokes: Speed, Science, Innovation, Direct Connection

**Brand Personality:**
| Trait | Expression |
|-------|------------|
| **Technical** | We're built by engineers for creators who appreciate precision |
| **Approachable** | Complex tech made simple - no jargon, no friction |
| **Rebellious** | Against the cloud monopoly, subscription fatigue, privacy erosion |
| **Trustworthy** | Open source, E2E encrypted, no data collection |
| **Empowering** | Your files, your network, your control |

**Brand Voice:**
- **Confident but not arrogant:** "It just works" not "We're the best"
- **Technical but accessible:** Explain concepts simply without dumbing down
- **Direct:** Short sentences, no corporate speak
- **Slightly irreverent:** Question the status quo (cloud pricing, complexity)

---

## Visual Identity

### Logo Concept

**Primary Mark: The Portal**

```
    ╭──────────╮
   ╱            ╲
  │   ◉──────▶   │
  │              │
   ╲            ╱
    ╰──────────╯
```

**Design Principles:**
1. **Circular form** - Represents the wormhole/portal
2. **Arrow or flow element** - Shows data moving through
3. **Negative space** - Creates depth, suggests "going through"
4. **Geometric** - Clean, technical, trustworthy
5. **Scalable** - Works at 16px favicon to billboard

**Logo Variations:**
| Version | Use Case |
|---------|----------|
| Full Logo (Icon + Wordmark) | Marketing materials, website header |
| Icon Only | App icon, favicon, system tray |
| Wordmark Only | Product UI, minimalist contexts |
| Monochrome | Single-color printing, low-contrast |
| Inverted | Dark backgrounds |

**Logo Don'ts:**
- Don't stretch or distort
- Don't change colors outside brand palette
- Don't add effects (shadows, gradients, 3D)
- Don't place on busy backgrounds without container
- Minimum clear space: Height of "o" in wordmark on all sides

### Color Palette

**Primary Colors**

| Color | Hex | RGB | Usage |
|-------|-----|-----|-------|
| **Wormhole Purple** | `#7C3AED` | 124, 58, 237 | Primary brand color, CTAs, links |
| **Void Black** | `#0F0F0F` | 15, 15, 15 | Backgrounds, text |
| **Signal White** | `#FAFAFA` | 250, 250, 250 | Backgrounds, text on dark |

**Why Purple?**
- **Differentiation:** Most dev tools use blue (Dropbox, GitHub) or green (Syncthing)
- **Association:** Creativity, innovation, premium (perfect for creative professionals)
- **Psychology:** Inspires imagination, suggests futuristic technology
- **Visibility:** High contrast, works on light and dark backgrounds

**Secondary Colors**

| Color | Hex | RGB | Usage |
|-------|-----|-----|-------|
| **Nebula Pink** | `#EC4899` | 236, 72, 153 | Accents, hover states, gradients |
| **Quantum Blue** | `#3B82F6` | 59, 130, 246 | Information, secondary actions |
| **Portal Teal** | `#14B8A6` | 20, 184, 166 | Success states, positive actions |

**Status Colors**

| Color | Hex | Usage |
|-------|-----|-------|
| **Success Green** | `#22C55E` | Connected, synced, complete |
| **Warning Amber** | `#F59E0B` | Syncing, attention needed |
| **Error Red** | `#EF4444` | Disconnected, error states |
| **Neutral Gray** | `#6B7280` | Disabled, secondary text |

**Gradient (Hero/Marketing)**
```css
background: linear-gradient(135deg, #7C3AED 0%, #EC4899 50%, #3B82F6 100%);
```

### Typography

**Primary Typeface: Inter**
- **Why:** Open source, highly legible, excellent for UI and marketing
- **Weights:** 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold)
- **Fallback:** -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif

**Monospace: JetBrains Mono**
- **Why:** Technical audience, code snippets, join codes
- **Weights:** 400, 500
- **Fallback:** "SF Mono", "Consolas", monospace

**Type Scale**

| Name | Size | Weight | Line Height | Use |
|------|------|--------|-------------|-----|
| Hero | 72px | 700 | 1.1 | Landing page hero |
| H1 | 48px | 700 | 1.2 | Page titles |
| H2 | 36px | 600 | 1.25 | Section headers |
| H3 | 24px | 600 | 1.3 | Subsections |
| H4 | 20px | 500 | 1.4 | Card titles |
| Body | 16px | 400 | 1.6 | Paragraphs |
| Small | 14px | 400 | 1.5 | Captions, labels |
| Tiny | 12px | 500 | 1.4 | Badges, metadata |

**Join Code Display**
```css
.join-code {
  font-family: "JetBrains Mono", monospace;
  font-size: 48px;
  font-weight: 500;
  letter-spacing: 0.1em;
  color: #7C3AED;
}
```

### Iconography

**Style:** Outlined, 2px stroke, rounded caps/joins
**Library:** Lucide Icons (MIT licensed, consistent with Inter)
**Size Grid:** 16px, 20px, 24px, 32px

**Core Icons:**
| Concept | Icon | Lucide Name |
|---------|------|-------------|
| Share/Host | Folder with arrow up | `folder-up` |
| Connect | Link | `link-2` |
| Sync | Refresh | `refresh-cw` |
| Encrypted | Lock | `lock` |
| Settings | Gear | `settings` |
| Connected | Check circle | `check-circle` |
| Disconnected | X circle | `x-circle` |
| Peer/User | User | `user` |

---

## Messaging Framework

### Taglines

**Primary Tagline:**
> **"Mount Any Folder. Any Computer. No Setup."**

**Alternative Taglines:**
| Context | Tagline |
|---------|---------|
| Technical | "P2P file sharing that actually mounts as a drive" |
| Anti-Cloud | "Your files. Your network. No middleman." |
| Simplicity | "Share a code. That's it." |
| Cost | "Stop paying rent on your own files" |
| Speed | "Why upload when you can connect?" |
| Creative Pro | "Stop waiting for renders to upload" |
| Privacy | "End-to-end encrypted. Zero-knowledge." |

### Value Propositions

**For Creative Professionals:**
```
BEFORE: Upload 50GB to cloud (30 min) → Wait for sync → Download to collaborator (30 min)
AFTER:  Share code → Mount instantly → Work directly on files
```

**For Developers:**
```
BEFORE: SSH + rsync scripts, VPN config, Syncthing 15-step setup
AFTER:  One command: `wormhole share ./project`
```

**For Privacy-Conscious:**
```
BEFORE: Trust Dropbox with your files, pay $12/month for the privilege
AFTER:  Direct peer-to-peer, E2E encrypted, open source, free
```

### Elevator Pitches

**10-Second Pitch:**
> "Wormhole lets you mount any folder from any computer as if it were local. Share a code, connect, done. No cloud, no accounts, no monthly fees."

**30-Second Pitch:**
> "Imagine if you could take any folder on your computer and make it appear on someone else's machine - not as a sync, but as a live mount. That's Wormhole. A video editor can mount their render farm's output folder and edit files as they finish rendering. A game dev can mount their build server's output for instant testing. No cloud uploads, no waiting, no monthly bills. Just share a code, connect, and your files are there. End-to-end encrypted, open source, free forever."

**Founder Story Pitch:**
> "I spent 2 hours every day waiting for files to sync. Uploading renders to the cloud, waiting for Dropbox to sync to collaborators, downloading builds from remote servers. I built Wormhole because that wait is unnecessary. If I can see a file on one machine, I should be able to access it from another - instantly, securely, without paying a cloud provider to store what I already have."

---

## Messaging Don'ts

| Don't Say | Why | Say Instead |
|-----------|-----|-------------|
| "Disrupting the cloud" | Cliché | "Direct peer-to-peer" |
| "Revolutionary" | Overused | "Simple" or "Fast" |
| "Seamless" | Meaningless | Be specific: "One-click" |
| "Leverage" | Corporate speak | "Use" |
| "End-user" | Dehumanizing | "You" or specific persona |
| "Utilize" | Pretentious | "Use" |
| "Best-in-class" | Unverifiable | Cite specific metric |

---

## Brand Applications

### Website

**Hero Section:**
```
[Gradient background: Purple → Pink → Blue]

Mount Any Folder.
Any Computer.
No Setup.

Share a code. Connect. Done.
No cloud, no accounts, no fees.

[Download for Mac]  [Download for Windows]  [View on GitHub]

[ASCII demo of join code being shared]
```

**Social Proof Section:**
```
"If this actually mounts the folder live, I'll never use WeTransfer again."
— Alex, Freelance Video Editor

"Syncthing would be perfect if it didn't take 2 hours to set up."
— Sam, Indie Game Developer

"If it's free and actually works, we'll switch tomorrow."
— Jordan, VFX Studio Lead
```

### App Store Listing

**Title:** Wormhole - P2P File Sharing

**Subtitle:** Mount remote folders locally

**Description:**
```
Share any folder from your computer with just a code. Others can mount it like a local drive.

- No cloud uploads or downloads
- No accounts or sign-ups
- No monthly fees
- End-to-end encrypted
- Works on Mac, Windows, and Linux

Perfect for:
• Video editors sharing renders
• Game developers distributing builds
• VFX artists collaborating remotely
• Anyone tired of cloud sync delays

Open source and free forever.
```

**Keywords:** file sharing, p2p, sync, mount, fuse, nas, remote, transfer, cloud alternative, airdrop alternative

### GitHub README

```markdown
# Wormhole

**Mount any folder from any computer. No setup.**

```bash
# On your machine
wormhole share ./my-renders
# Output: Share code: 7KJM-XBCD-QRST-VWYZ

# On any other machine
wormhole mount 7KJM-XBCD-QRST-VWYZ ./renders
# Files appear instantly
```

## Why Wormhole?

| Problem | Cloud Solution | Wormhole |
|---------|---------------|----------|
| Share 50GB folder | Upload 30+ min | Instant mount |
| Monthly cost | $12-50/mo | Free |
| Privacy | Trust provider | E2E encrypted |
| Setup | Create account, install, configure | Share code |

## Install

[Download for Mac](link) | [Download for Windows](link) | [Build from source](#build)
```

### Email Signature

```
[Name]
[Title] at Wormhole

wormhole.app | @wormholeapp | GitHub
"Mount any folder. Any computer. No setup."
```

---

## Brand Assets Checklist

### Required Assets

- [ ] Logo (SVG, PNG @1x, @2x, @3x)
- [ ] Icon (ICO, ICNS, PNG 16/32/64/128/256/512/1024)
- [ ] Favicon (favicon.ico, apple-touch-icon.png)
- [ ] Social cards (Open Graph 1200x630, Twitter 1200x600)
- [ ] App Store screenshots (6.5" iPhone, 12.9" iPad, Mac)
- [ ] GitHub social preview (1280x640)
- [ ] Banner for ProductHunt (240x240 logo, 1270x760 gallery)

### Nice-to-Have Assets

- [ ] Animated logo (Lottie/GIF)
- [ ] Demo video (30s, 60s, 2min)
- [ ] Presentation template (Keynote/Google Slides)
- [ ] Sticker designs (die-cut)
- [ ] T-shirt design
- [ ] Conference booth banner

---

## Competitive Visual Differentiation

| Competitor | Visual Style | Wormhole Differentiation |
|------------|--------------|--------------------------|
| Dropbox | Blue, corporate, boxy | Purple, technical, rounded |
| Google Drive | Primary colors, playful | Monochrome + accent, serious |
| Syncthing | Green, utilitarian | Purple, polished |
| Resilio | Blue/teal, enterprise | Purple, indie/creative |
| AirDrop | Blue gradient, Apple-clean | Purple gradient, cross-platform |

**Visual Strategy:** Own purple in the file sharing space. Be more polished than open-source tools, more technical than consumer cloud, more accessible than enterprise solutions.

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2024-01-01 | 1.0 | Initial brand guidelines |

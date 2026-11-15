# Baazi: Growth & Revenue Plan (draft for review)

> Status: **plan only, no development yet.** Written 15 Nov 2026 for review.
> Goal: **at least $200/month** (≈ PKR 56,000 at an assumed ~280 PKR/USD), starting in Pakistan.

---

## 1. Summary (read this first)

1. **$200/month is reachable, but only with roughly 10,000–20,000 monthly players.** Pakistani ad rates and spending are low, so revenue per player is small. The hard part is getting players, not adding payment buttons. Section 7 has the numbers.
2. **Running costs come out of that $200 first.** A paid app can't stay on Vercel's free Hobby plan (it's for non-commercial use only), and Supabase's free tier pauses idle projects and caps realtime connections. Expect about **$45–50/month** in hosting, so the real gross target is about **$250/month**.
3. **I recommend not removing "Play vs computer". Make "Play" quick matchmaking and keep practice as a second option.** With few players spread over six games, most queues will be empty for months. Without a practice mode, new players wait and then mostly get bots anyway. Details in Section 5.
4. **Wait 20–30 seconds in the queue, not 2 minutes.** Casual players leave long before 2 minutes. Fill the empty seats with bots after a short wait, and show bots as bots.
5. **3 Patti plus coins you can buy is the biggest risk.** Pakistan bans betting (Prevention of Gambling Act 1977), and the PTA blocked 184 gambling sites and apps in 2025. A game that "bets coins" and sells coins could be reported and blocked, and it would undercut the chai-hotel pitch. **Recommendation:** money buys **only cosmetics and ad removal, never coins**. Coins are earned only and can never be cashed out. 3 Patti stays as a just-for-fun game.
6. **Your best growth idea is the chai-hotel one: a QR code that drops friends at the same table.** Every phone becomes a hand of cards. Joining by code and the local "nearby" tables already exist. The QR code just needs to open straight into a table, and sharing over WhatsApp should be one tap.
7. **Suggested order:** make it work well (deploy, desktop fixes, online tested) → measure (analytics) → growth loop (QR, WhatsApp invite, quick match) → retention → money (ad-free + cosmetics) → ads.

---

## 2. Market: Pakistan

| Fact | Figure | Source quality |
|---|---|---|
| Mobile broadband subscriptions (2024) | ~134.8M, about 57% of the population | Dawn (PTA data), good |
| Average mobile data use | ~8.4 GB per user per month | Dawn, good |
| Mobile gamers | ~34M (2025), projected 45–51M by 2026 | Tenjin / industry estimates, rough |
| Pakistan-specific ad rates | **No reliable public figure found** | Treated as an assumption below |

**Who we're targeting**

- **Primary:** men aged 16–35 in cities who already play Rung/Court Piece, Bhabhi or 3 Patti with friends, at chai dhabas, hostels, offices and in family gatherings.
- **Secondary:** overseas Pakistanis (UAE, KSA, UK) who want to play with friends back home. They're few, but they're worth far more per head for ads and purchases.
- **Device reality:** mostly low and mid-range Android phones on 4G, often low on storage. A **web app with no install is an advantage** here. Our 3D scene is a risk on cheap phones, so the "lite" 2D path has to stay fast.

**Why people would come to us:** the culture already exists (Rung is very popular in Pakistan). The gap is in the occasion: no cards at hand, cards not allowed, or friends far away. We sell **"cards in your pocket, play together"**, not "another card app".

---

## 3. Competitors

| App | What it is | What it means for us |
|---|---|---|
| Rung King Live (Joywalking) | Rung/Hokm with live multiplayer and tournaments; markets itself to Pakistan | Proves demand; last updated 2023, so it looks stale |
| Court Piece – Rang, Hokm, Coat (Artoon) | Offline/AI Court Piece, ~5.5K ratings, updated 2025 | Strong in solo play; weak on playing with friends |
| Courtpiece Multiplayer (OENGINES) | Online 4-player | Small (third-party estimate ~680 installs per 4 weeks) |
| Double Sur: Court Piece Rang (iOS) | Room-code play with friends plus AI | Closest to our idea, iOS only |
| CardzMania (web) | Browser Rung, many games | Our web rival: generic, not Pakistani in look or feel |
| Teen Patti Gold and similar | Big, coin-gambling style | We should **not** compete on gambling mechanics (see Section 6 risk) |

**How we're different:** (1) six Pakistani home games in one place, (2) **no install**: a link or QR code opens it, (3) **made for playing in the same room** (local tables, a phone as your hand), (4) a desi look and feel: Urdu/Roman-Urdu labels and local stickers.

I couldn't get reliable download totals for these apps. Before launch, check Sensor Tower or AppMagic, or just read their Play Store review counts and the complaints in their reviews (for example, "can't find players" or "too many ads").

---

## 4. Marketing (low cost first)

### 4.1 Chai hotels (your idea, refined)
- **Joker card with a QR code:** the QR should open `baazi…/t/<table>` or a **"Start a table here"** page, not just the home page. Print a short line: *"Cards nahi? Phone nikaalo."* (No cards? Take out your phone.)
- **Wall poster / table tent:** one QR per hotel with its own code (`?src=hotel-xyz`), so we can **measure which hotels bring players**.
- **Hotel partnership:** a free "hotel table" with the hotel's name shown in the lobby. Later this can become a paid sponsored table (Section 6).
- **Police and restriction angle:** position it as **"no money, just fun"**. Don't show coin betting in any print material.
- **Cost:** get quotes. A first test of ~500 cards and ~20 posters in one city (Lahore *or* Karachi) is the right size. Measure scans before printing more.

### 4.2 WhatsApp (the most important channel)
- "Invite to table" opens WhatsApp with a ready message, the code and a link. In Pakistan, WhatsApp is where groups decide to play.
- Reward: give coins to both people when an invited friend finishes their first game. Coins only, never cash.

### 4.3 Universities and hostels
- Society or campus "Rung tournaments" with a leaderboard and a small prize (sponsored, or a free premium card back).
- Recruit student ambassadors who get a personal QR code and an exclusive cosmetic once 25 friends play.

### 4.4 Online communities
- Reddit: r/pakistan, r/lahore, r/karachi, r/islamabad. Post as the developer ("I made this, feedback?"), not as an ad.
- Facebook groups, TikTok and Instagram Reels: 15-second clips of funny Bluff calls or "Thulla!" moments. Short video is the cheapest way to reach this audience.
- Overseas Pakistani groups (Gulf and UK).

### 4.5 Measure everything
Add privacy-friendly analytics (for example PostHog or Plausible free tier) **before** marketing, tracking: QR source → first game → came back on day 1 and day 7 → invited a friend. Without this we can't tell which idea works.

---

## 5. Gameplay: matchmaking, bots and retention

### 5.1 Your proposal vs. my recommendation

| | Your proposal | Recommended |
|---|---|---|
| Main button per game | Play → queue | **Play → quick match** (same) |
| Queue wait | 2 minutes | **20–30 s**, then bots fill the empty seats |
| Play vs computer | Removed | **Kept, smaller, as "Practice"** (works offline and needs no other players) |
| Bots | Fill seats | Fill seats, **marked as bots**, and they **leave when a human joins** between rounds |
| Friends | – | Host and join by code / QR stays exactly as it is |

**Why keep practice:** with, say, 50 people online spread over 6 games and several seat counts, most queues will be empty most of the time. Matchmaking guides for small player bases all say the same thing: start partly filled rather than make people wait, and combine queues. Practice also covers bad internet, which is common.

**Why mark bots:** players who find out they were fooled leave and post about it. Once coins are involved, hidden bots can also feel like cheating. A small "BOT" tag is enough.

### 5.2 How matchmaking would work (fits our current Supabase + rooms design)
1. Pressing Play adds a `queue` row: `{game, seats, wallet, joined_at}`.
2. The phone checks `/api/match` every ~2 s, or listens through the existing events stream.
3. The matcher runs **inside that request** as one database function: take the oldest waiting players for that game (`FOR UPDATE SKIP LOCKED`, so two requests never grab the same players), and once there are enough **or** the oldest has waited about 25 s, create a room using the existing `rooms.ts`, put the bots in, and start it.
4. Ways to make it faster:
   - **Combine queues:** Bhabhi and G Patta accept 3–6 seats, so start with whoever is waiting.
   - **Show who's playing:** "12 playing Rung now" on each game card, so people pick the busy game.
   - **Peak hours:** push one game per evening ("Rung night, 9–11 pm") so players gather in one place.
   - **Bot leaves, human sits:** between rounds a waiting human takes a bot's seat.
5. No new servers are needed. The Vercel functions plus Postgres approach we already use is enough at this scale.

### 5.3 Retention (players coming back) – ranked by value for effort
1. **Rematch with the same table** in one tap (missing for the new games today).
2. **Daily coins and a 3-day streak.**
3. **Friends list / recent players**, so you can invite them again.
4. **Weekly leaderboard per game**, optionally per city, which gives you something to boast about in WhatsApp groups.
5. **Desi stickers and emotes in chat** (Urdu and Punjabi). These also become a paid item later.
6. **Urdu / Roman-Urdu UI toggle.**
7. **Low-data and low-end mode** (2D only). This is critical in Pakistan.

---

## 6. Money

### 6.1 Rules (to stay legal and keep trust)
- ✅ Sell **cosmetics** and **ad removal**.
- ❌ **Never sell coins**, never cash coins out, and never give prizes worth money for coin wins. That is the line between a social game and gambling under Pakistani law and in app-store policies.
- ❌ No loot boxes. If we ever add random items, app stores require the odds to be shown.

> Today the shop's "+" button suggests coins can be bought. **I recommend changing that** before any marketing push. Coins should come from play, daily rewards and invites.

### 6.2 Revenue options, in order

| # | Item | Price (PKR) | Notes |
|---|---|---|---|
| 1 | **Remove ads forever** | 200 (your idea; good) | Simple, one-time, easy to understand. Only makes sense once ads exist |
| 2 | **Card-back / table felt packs** | 100–250 each | Cheap to make, shown to everyone at the table |
| 3 | **Sticker / emote packs** | 100–150 | Funny desi packs sell best |
| 4 | **Custom table everyone sees in the lobby** | 300–500 per month | For hotels, societies and friend groups: "Ali's Dhaba Table" |
| 5 | **Sponsored hotel tables** | Negotiated, e.g. PKR 2,000–5,000 per month | Hotel name and logo on a public table plus a QR poster. Could pay for hosting by itself |
| 6 | **Rewarded ads** ("watch an ad for 100 coins") | – | Opt-in only. Players like it more than forced ads |
| 7 | **Interstitial ads** between games | – | At most 1 every ~3 games. Never during a hand |
| 8 | Subscription ("Baazi Pro") | ~PKR 300 per month | **Later.** Only once retention data shows players stay for months |

### 6.3 How to collect money in Pakistan
- **Web (now):** JazzCash and Easypaisa through an aggregator (for example Safepay, PayFast or Simpaisa: compare quotes). It's much less paperwork than integrating each wallet separately. Expect a few percent per transaction plus withholding tax (0.25–2% since July 2025). **Needs a registered business / NTN** for merchant accounts.
- **Play Store later (as a wrapped app):** digital items sold in the app **must** go through Google Play Billing (15% fee). It supports local options, but the price has to cover that cut.
- **Ads on the web:** Google's **H5 Games Ads** (AdSense for HTML5 games, with interstitial and rewarded ads) is a **closed beta you apply for**, and approval isn't guaranteed. **Apply early.** The fallback is ordinary display ads on menu screens only.

---

## 7. Revenue estimate to $200/month

### Assumptions (marked so you can change them)
- PKR/USD ≈ 280 (check the current rate).
- Pakistani web ad earnings: **$0.30–$1.00 per 1,000 interstitials** and **$1–$3 per 1,000 rewarded ads**. Global rates are about $2.5–5 and $8–18; tier-2 markets run 30–60% lower, and Pakistan is lower still. **This is an assumption.** I found no Pakistan-specific figure.
- Daily players (DAU) ≈ 20% of monthly players (MAU).
- Each daily player sees about 2 interstitials and 1 rewarded ad.
- 1.5% of monthly players buy something, spending PKR 250 on average. Ad-free is bought once, so that stream shrinks as early buyers drop out.
- Payment fees and tax take about 5%.

### Scenarios

| | Small | Medium | Target |
|---|---|---|---|
| Monthly players (MAU) | 3,000 | 10,000 | 20,000 |
| Daily players (DAU) | 600 | 2,000 | 4,000 |
| Ads per month | ~$12–40 | ~$40–130 | ~$80–260 |
| Purchases (1.5% × PKR 250) | ~$40 | ~$130 | ~$270 |
| Sponsored hotel tables | 0–2 → ~$0–35 | ~5 → ~$70 | ~10 → ~$140 |
| **Gross** | **~$50–115** | **~$240–330** | **~$490–670** |
| Hosting (Vercel Pro $20 + Supabase Pro $25 + domain) | −$47 | −$47 | −$50 to −$80 |
| **Net** | **~$0–70** | **~$190–280** ✅ | **~$400–590** |

**What the table says:** about **10,000 monthly players** gets you to roughly $200 net. Purchases and hotel sponsorships matter more than ads in Pakistan. A realistic timeline is **6–12 months** of steady marketing. Six months is likely only if the QR and WhatsApp loop really works, meaning each player brings in more than about 0.3 new players.

---

## 8. Technical work and costs

### Hosting (monthly)
| Item | Free tier OK for | Paid when |
|---|---|---|
| Vercel | Testing only (Hobby = non-commercial) | **Pro $20 per month** as soon as ads or payments go live |
| Supabase | Up to ~200 realtime connections; pauses after inactivity | **Pro $25 per month** at launch, so it never pauses and gets backups |
| Domain | – | ~$10–15 per year |
| Analytics | PostHog / Plausible free tier | – |
| Printing (QR cards and posters) | – | One-off, get local quotes |

### Build list (rough effort, for one developer with AI help)
| Work | Effort |
|---|---|
| **Before launch:** rotate the Supabase key, deploy, finish the desktop fixes, test online tables on two phones | 1–2 days |
| Analytics events + `?src=` tracking | 0.5 day |
| QR → straight into a table + WhatsApp "invite" button | 1–2 days |
| Quick-match queue + bot backfill + "N playing now" | 3–5 days |
| Rematch for all games, daily coins, streak | 2–3 days |
| Remove coin buying; rewarded "watch ad → coins" | 1–2 days (after ads approval) |
| Cosmetics shop (card backs, felts, stickers) + JazzCash/Easypaisa via aggregator | 4–7 days, plus business paperwork |
| Custom / sponsored lobby tables | 2–3 days |
| Urdu / Roman-Urdu toggle | 2–3 days |
| Low-end / low-data mode check on a cheap Android phone | 1–2 days |

---

## 9. Priorities

1. **Make it solid:** launch checklist, desktop layout, online tables tested, cheap-phone check.
2. **Measure:** analytics plus source tracking.
3. **Growth loop:** QR into a table, WhatsApp invite, quick match with bots, "N playing now". Then a **single-city pilot** (10 chai hotels, one university).
4. **Retention:** rematch, daily coins, friends list, leaderboard.
5. **Money:** remove coin buying → cosmetics + JazzCash/Easypaisa → sponsored hotel tables.
6. **Ads:** apply for H5 Games Ads now (approval takes time), then add rewarded ads and capped interstitials. Then sell PKR 200 ad-free.
7. **Later:** subscription, Play Store wrapper, tournaments.

**Success check after the pilot (4–6 weeks):** QR scan → first game above 40%; next-day return above 25%; at least 0.3 invited friends per new player. If these miss, fix the product before spending more on printing.

---

## 10. Decisions for you

1. Keep **Practice vs computer** as a smaller option (recommended), or remove it entirely as you proposed?
2. Queue wait before bots: **25 s** (recommended) or your 2 minutes?
3. Show bots as **BOT** (recommended) or hide them?
4. **Stop selling coins** and sell cosmetics only (recommended), given the gambling risk?
5. Pilot city: **Lahore or Karachi**?
6. Will you register a business / NTN? It's needed for JazzCash/Easypaisa merchant accounts.
7. Are you OK with ~$45–50 per month in hosting from launch?

---

## Sources
- Dawn, mobile broadband and data use: https://www.dawn.com/news/1948416
- Tenjin, mobile gaming in Pakistan 2025: https://tenjin.com/?p=12437 · TechJuice gamer projection: https://www.techjuice.pk/?p=171680
- iGaming Today, Pakistan gamer estimates: https://www.igamingtoday.com/pakistan-igaming-market-research-report/
- Competitors: Rung King Live https://www.gameloop.com/ph/game/card/rung-king-live-hokm-courtpiece-on-pc · Artoon Court Piece https://appgoblin.info/apps/com.artoon.courtpieceoffline · Courtpiece Multiplayer https://appgoblin.info/apps/com.oengines.courtpiece.multiplayer · Double Sur https://apps.apple.com/app/id6775272788 · CardzMania https://www.cardzmania.com/Rung
- AdMob rate benchmarks: https://www.playwire.com/blog/admob-ecpm-benchmarks-what-publishers-should-expect · tier-2 discount: https://appfollow.io/blog/mobile-game-ads-formats-monetization · ProPakistani on AdSense: https://propakistani.pk/2025/02/10/why-publishers-are-leaving-money-on-the-table-with-basic-adsense-implementation/
- H5 Games Ads (beta): https://developers.google.com/ad-placement/docs/beta · https://adsense.google.com/start/h5-games-ads/
- Pakistani payment gateways and withholding tax: https://plisio.net/id/crypto/payment-gateway-in-pakistan · https://simpaisa-website.pages.dev/blogs/how-to-add-easypaisa-payments-to-your-website-2026-complete-guide
- Gambling law and PTA blocks: https://propakistani.pk/2025/09/05/gambling-apps-in-pakistan-could-face-complete-ban-after-latest-court-case/amp/ · https://arynews.tv/pta-blocks-184-gambling-websites-apps-in-pakistan/ · https://tribune.com.pk/story/2562373/pakistan-issues-list-of-illegal-apps-for-betting-forex-and-binary-trading
- Google Play gambling and payments policy: https://support.google.com/googleplay/android-developer/answer/9877032 · https://play.google.com/about/monetization-ads/payments
- Supabase realtime limits: https://supabase.com/docs/guides/realtime/limits.md
- Matchmaking with few players: https://bugnet.io/blog/how-to-run-matchmaking-with-a-low-player-population · https://edgegap.com/blog/how-to-optimize-session-fill-rate-in-your-matchmaker · https://bloodhunt.com/news/upcoming-changes-to-the-trios-matchmaker

**Not verified / gaps:** Pakistan-specific ad rates, exact JazzCash/Easypaisa merchant fees, and competitor download totals. Get these from AdSense reporting, aggregator quotes and Sensor Tower before relying on the numbers above.

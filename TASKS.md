# Baazi: build checklist

Tasks are listed in the order you gave them.
Business and marketing research is in `PLAN.md`.

Legend: `[ ]` to do · `[~]` in progress · `[x]` done

---

## 0. Carry-overs
- [x] Dev server running again (it was stopped when the PC ran low on memory)
- [x] "How to play" footer no longer says solo costs coins

## 1. Matchmaking: "Play" on every game
- [x] "Play vs computer" replaced by **Play**: join a queue for that game
- [x] Real players searching for the same game (and seat count) land at the same table
- [x] Short search (seats fill one by one over ~5–20 s); empty seats are filled by bots so a game always starts
- [x] If the server can't be reached (offline / bad signal), it falls back to a local game with the same kind of opponents, so the player is never stuck
- [x] Coins: a quick match charges the table fee and pays winners like a hosted table; a player who can't afford the fee still gets a free game with no payout
- [x] Host a table / join by code unchanged

## 2. Bots that feel like people
- [x] Bots get Pakistani names and desi avatars (no "Bot" label, as you asked)
- [x] Human-like timing: varied thinking time, sometimes quick, sometimes slow
- [x] Bots chat: short Roman-Urdu/English lines and stickers at natural moments (greeting, good move, losing, win), not spammy (Bhabhi and G Patta tables have no chat box yet, so it isn't shown there)
- [x] Bots use emotes / react to the table
- [x] Bots in quick match "join" one at a time during the search, so the table fills like real people arriving

## 3. Card styles you can buy
- [x] Card style sheet: preview of A♠ K♥ Q♦ J♣, **Suit colours** (Classic red/black · Four colour), **Card back** choices
- [x] Card backs: several original designs (e.g. wine, navy, forest, noir, plus a desi/chai one), shown with a coin price and a lock
- [x] Buy with coins (earned in game); owned styles are saved on the server per wallet; the chosen style shows everywhere cards appear (hand, table, piles, game list art)
- [x] Four-colour suits are free (accessibility)
- [ ] Real-money purchase (JazzCash/Easypaisa) is **not** built yet. It needs a registered business; see PLAN.md §6

## 4. Desi characters and a chai theme
- [x] New original desi character set (illustrated, flat vector, our own designs) for players and bots, e.g. Chaudhry, Ustad, Baba, Nani, Cricketer, Student, Rickshaw-wala, Dhaba owner…
- [x] Profile sheet: your name + pick a character + your stats
- [x] Seats, lobby, name tags, chat and result screens use the new avatars
- [x] Chai theme: chai glass by your seat at the table and a "Chai break" pause menu (the room's drinks are baked into its pictures)
- [ ] **Limit:** the 3D figures (the bear) and the baked room images can't be re-modelled as desi characters here. That needs a 3D artist/Blender. The plan is 2D illustrated characters around the table; the 3D room stays as the backdrop

## 5. Fonts and "How to play"
- [x] App font changed from thin condensed Oswald/monospace to a bold, rounded, friendly font everywhere
- [x] "How to play" rewritten per game as a full numbered guide with **bold** step titles and highlighted key words, scrollable, in the new font

## 6. Polish round (from your notes, Document 2.pdf)
- [x] "Tap to start" moved a little higher
- [x] Settings: clean, simple layout with sections/navigation; card style removed from it
- [x] Play button: heavier, better-looking label
- [x] Card style: simpler screen, clear suit-colour choice, more premium card faces and backs (researched online)
- [x] Card store in the shop, styled like the coin store (clean, minimal)
- [x] Custom tables: buyable table themes, owned per wallet, used at every table
- [x] Profile opens a full character-selection screen (not a modal)
- [x] 3D bear and the old figure pictures removed everywhere; the new 2D desi characters used instead
- [x] Loader while a room is being created (no black screen)
- [x] Fix "create room" failing after leaving a room
- [x] Rejoin: closing the app or losing connection lets you return to the same game
- [x] Project skill: turn a reference (image/link) into code for cards, tables, characters, sounds; tested on a sample

## 6b. Polish round 2 (Document 2 (1).pdf)
- [x] Game list rows: cleaner type and alignment; player count as plain coloured text, no pill
- [x] How to play: the shop's tab buttons, 4–5 one-line steps per game, 14px text
- [x] Rung score bubbles: no "Us" label, smaller
- [x] Pause ("Chai break") sheet redone cleanly
- [x] Host settings: "Computer fills empty seats" removed; bold labels on every gold button app-wide
- [x] "Host a game" icon removed
- [x] Quick match waits up to ~30 s and uses the lobby's seat/VS look
- [x] 3 Patti: across player's cards moved back, opponents' cards smaller
- [x] 3 Patti result sheet redone in the app theme
- [x] Taller table; the player across sits further back with their face visible
- [x] Seat tags in all games: less text, count badge on the avatar
- [x] Error screen ("The lamp went out") restyled to match the app

## 6c. Polish round 3 (screenshots)
- [x] Shop: centred prices, buy confirmation, fixed height with scrolling list, card backs in card shape, banner + four-colour switch removed, tables tab matches
- [x] How to play: bigger tab buttons, no player-count line, bigger rule text
- [x] Profile: title visible, glow to the top, dark name field, 3-column character grid, rank/matches/wins/win %, Character/Stats tabs
- [x] Play skips "Who's playing?" once a character is saved

## 7. Wrap-up
- [ ] Summary of what changed + anything still open

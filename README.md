# 🎣 Reverse Honeypot

**You are the phisherman now.** A multiplayer party game where players craft phishing lures against AI victims — and Jev judges who hooks them.

## How it plays

1. **Target acquired** — Jev briefs the crew on a victim: psych profile, current situation, comms habits, known weak spots, armor.
2. **Craft your lure** — pass the device around; each player secretly writes the exact message (Email / SMS / WhatsApp / call script) they'd send the victim.
3. **Jev judges** — every lure is scored 1–10 with named psychological triggers (Authority, Urgency, Curiosity, Reward, Helpfulness, Fear, Social Proof, Compassion) and sharp reasoning. Winner takes the round.
4. **The bite** — Jev roleplays the victim taking the bait, in character.
5. **Defense lesson** — every round ends with what the victim should have done. Think like the phisher to beat the phish.

Scoring: round winner **+3**, runner-up **+1**. Most points after all rounds becomes the **Master Manipulator**.

## Jev's visible decisions

The 🧠 **Jev's mind** panel shows every AI decision: victim draws, lure judging (latency, confidence, fallback state).

Set `TYPESAFE_API_KEY` to let the real Jev judge. Without it, a local heuristic judge scores lures against each victim's weak spots and armor.

## Run it

```bash
npm install
TYPESAFE_API_KEY=your-key node server.js   # or without the key for local judging
```

Open http://localhost:3000. 3–6 players, pass-and-play on one screen.

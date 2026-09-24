// Reverse Honeypot — you are the attacker. Jev roleplays the victim and judges your lures.
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PERSONAS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'personas.json'), 'utf8')
).personas;

const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
const JEV_MODEL = 'jev-latest';
const JEV_KEY = process.env.TYPESAFE_API_KEY || '';

const sessions = new Map();
const uid = () => crypto.randomBytes(8).toString('hex');

// ---------------------------------------------------------------- Jev client
async function jevJson(systemPrompt, userPrompt, timeoutMs = 60000) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(JEV_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${JEV_KEY}` },
      body: JSON.stringify({
        model: JEV_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });
    if (!res.ok) throw new Error(`Jev HTTP ${res.status}`);
    const data = await res.json();
    const text =
      data?.choices?.[0]?.message?.content ||
      data?.output_text ||
      data?.text ||
      '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON in Jev reply');
    return { result: JSON.parse(text.slice(start, end + 1)), latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------- Fallback judge brain
const TRIGGER_KEYWORDS = {
  Authority: ['ceo', 'boss', 'director', 'founder', 'board', 'management', 'chairman', 'managing director', 'police', 'rbi', 'income tax', 'cbi', 'court order', 'auditor', 'vp ', 'vice president', 'head of', 'from it', 'it support', 'it department', 'from hr', 'hr team', 'hr department'],
  Urgency: ['urgent', 'immediately', 'asap', 'deadline', 'today only', 'within ', 'expire', 'hurry', 'act now', 'last chance', 'right now', 'at once', 'time-sensitive', 'running out', 'final notice', 'before 5', 'by eod'],
  Curiosity: ['secret', 'exclusive', 'leaked', 'confidential', 'you won\u2019t believe', 'you wont believe', 'salary sheet', 'appraisal list', 'layoff', 'merger', 'unseen', 'private', 'scandal', 'revealed'],
  Reward: ['bonus', 'prize', 'won ', 'winner', 'cashback', 'incentive', 'reward', 'free ', 'gift', 'lottery', 'refund', 'you have been selected', 'claim your'],
  Helpfulness: ['need your help', 'quick favor', 'could you please', 'help me', 'a favor', 'assist me', 'do me a favor'],
  Fear: ['suspended', 'blocked', 'frozen', 'legal action', 'complaint', 'terminated', 'virus', 'hacked', 'breach', 'penalty', 'fine ', 'account will be'],
  'Social Proof': ['everyone', 'all employees', 'team has', 'colleagues', 'nobody else', 'most people', 'all new joiners', 'rest of the team'],
  Compassion: ['emergency', 'hospital', 'accident', 'struggling', 'family emergency', 'please help', 'critical condition', 'distress'],
};

const hashJitter = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 100) / 100 - 0.5; // -0.5..0.5
};

function detectTriggers(text) {
  const lower = ` ${text.toLowerCase()} `;
  return Object.entries(TRIGGER_KEYWORDS)
    .filter(([, kws]) => kws.some((k) => lower.includes(k)))
    .map(([t]) => t);
}

const REPLY_TEMPLATES = {
  Authority: 'Understood — actioning this right away. Confirming once done.',
  Urgency: 'Oh no — doing it NOW, before the deadline hits.',
  Curiosity: 'Wait, what?! Opening it right now…',
  Reward: 'No way — claiming this immediately!',
  Helpfulness: 'Of course, happy to help — sending it over.',
  Fear: 'Please don\u2019t block it — I\u2019m fixing this right now.',
  'Social Proof': 'If everyone\u2019s done it, I\u2019ll do it too — submitting now.',
  Compassion: 'That\u2019s terrible — I\u2019m helping right away.',
};

function fallbackJudge(persona, lures) {
  const weak = new Map(persona.intel.map((i) => [i.trigger, i.detail]));
  const armor = new Map(persona.armor.map((a) => [a.trigger, a.detail]));
  const scored = lures.map((lure) => {
    const triggers = detectTriggers(lure.text);
    let score = 3;
    const landed = [];
    for (const t of triggers) {
      if (weak.has(t)) { score += 2; landed.push(t); }
      else if (armor.has(t)) { score -= 2; }
    }
    const lower = lure.text.toLowerCase();
    const firstName = persona.name.split(' ')[0].toLowerCase();
    if (lower.includes(firstName) || lower.includes(persona.role.toLowerCase().split(',')[0])) score += 1;
    const skims = /skim|glance|never reads|2\.5 seconds/i.test(persona.comms);
    if (skims && lure.text.length < 350) score += 1;
    if (skims && lure.text.length > 800) score -= 1;
    score = Math.max(1, Math.min(10, score + hashJitter(lure.player + lure.text) * 0.8));
    score = Math.round(score * 10) / 10;
    const top = landed.length ? landed : triggers.slice(0, 2);
    const why = landed.length
      ? landed.map((t) => weak.get(t)).join(' ')
      : 'It doesn\u2019t press any of their known weak spots — a generic cast into the void.';
    return {
      player: lure.player,
      score,
      triggers: top,
      reasoning: top.length
        ? `${top.join(' + ')} lands: ${why}`
        : why,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0];
  const topTrigger = winner.triggers[0] || 'Urgency';
  return {
    scores: scored,
    winner: winner.player,
    victimReply: REPLY_TEMPLATES[topTrigger] || REPLY_TEMPLATES.Urgency,
    lesson: persona.lesson,
  };
}

// ------------------------------------------------------------------ Sessions
function publicState(s) {
  return {
    id: s.id,
    players: s.players,
    rounds: s.rounds,
    round: s.history.length + (s.current && !s.current.judged ? 1 : 0),
    phase: s.current
      ? (s.judging ? 'judging' : s.current.judged ? 'results' : 'lures')
      : (s.done ? 'done' : 'victim'),
    current: s.current
      ? {
          persona: s.current.persona,
          lures: s.current.lures.map((l) => ({ player: l.player, channel: l.channel })),
          judged: s.current.judged || null,
        }
      : null,
    history: s.history,
    jevLog: s.jevLog.slice(-12),
    champion: s.done ? [...s.players].sort((a, b) => b.score - a.score)[0] : null,
  };
}

app.post('/api/session', (req, res) => {
  const { players, rounds } = req.body || {};
  const names = Array.isArray(players) ? players.map((p) => String(p).trim()).filter(Boolean) : [];
  if (names.length < 3 || names.length > 6)
    return res.status(400).json({ error: 'Need 3–6 players.' });
  if (new Set(names).size !== names.length)
    return res.status(400).json({ error: 'Player names must be unique.' });
  const n = Math.max(3, Math.min(8, parseInt(rounds, 10) || 5));
  const s = {
    id: uid(),
    players: names.map((name) => ({ name, score: 0, wins: 0 })),
    rounds: n,
    current: null,
    history: [],
    usedPersonas: [],
    jevLog: [],
    judging: false,
    done: false,
    createdAt: Date.now(),
  };
  sessions.set(s.id, s);
  res.json({ sessionId: s.id, state: publicState(s) });
});

app.get('/api/session/:id', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Session not found.' });
  res.json({ state: publicState(s) });
});

app.post('/api/session/:id/victim', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Session not found.' });
  if (s.done) return res.status(400).json({ error: 'Game over.' });
  if (s.current && !s.current.judged) return res.status(400).json({ error: 'Finish the current round first.' });
  const pool = PERSONAS.filter((p) => !s.usedPersonas.includes(p.id));
  const persona = pool[Math.floor(Math.random() * pool.length)] || PERSONAS[0];
  s.usedPersonas.push(persona.id);
  s.current = { persona, lures: [], judged: null, order: [...s.players.map((p) => p.name)] };
  s.jevLog.push({
    type: 'victim_draw', label: `Target acquired: ${persona.name} (${persona.role})`,
    latencyMs: 0, fallback: true, confidence: 1, at: Date.now(),
  });
  res.json({ state: publicState(s) });
});

app.post('/api/session/:id/lure', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s || !s.current) return res.status(400).json({ error: 'No active round.' });
  if (s.current.judged) return res.status(400).json({ error: 'Round already judged.' });
  const { player, channel, text } = req.body || {};
  if (!s.current.order.includes(player)) return res.status(400).json({ error: 'Unknown player.' });
  if (s.current.lures.some((l) => l.player === player))
    return res.status(400).json({ error: `${player} already submitted.` });
  const clean = String(text || '').trim();
  if (clean.length < 20) return res.status(400).json({ error: 'Lure too short — make it convincing (20+ chars).' });
  if (clean.length > 1200) return res.status(400).json({ error: 'Keep it under 1200 characters.' });
  const channels = ['Email', 'SMS', 'WhatsApp', 'Call script'];
  s.current.lures.push({ player, channel: channels.includes(channel) ? channel : 'Email', text: clean });
  res.json({ state: publicState(s) });
});

app.post('/api/session/:id/judge', async (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s || !s.current) return res.status(400).json({ error: 'No active round.' });
  if (s.current.judged) return res.status(400).json({ error: 'Round already judged.' });
  if (s.current.lures.length < s.players.length)
    return res.status(400).json({ error: 'Waiting for all players to submit their lures.' });
  s.judging = true;

  const persona = s.current.persona;
  const lures = s.current.lures;
  let verdict, fallback = false, latencyMs = 0, confidence = 0.9;

  if (JEV_KEY) {
    try {
      const weak = persona.intel.map((i) => `${i.trigger}: ${i.detail}`).join('; ');
      const armor = persona.armor.map((a) => `${a.trigger}: ${a.detail}`).join('; ') || 'none';
      const lureText = lures
        .map((l, i) => `${i + 1}. Player "${l.player}" via ${l.channel}:\n${l.text}`)
        .join('\n\n');
      const out = await jevJson(
        'You are Jev, the judge of REVERSE HONEYPOT, a security-awareness party game. Players craft phishing lures to hook a victim persona. Reply with ONLY valid JSON, no markdown fences, no commentary.',
        `VICTIM DOSSIER\nName: ${persona.name}\nRole: ${persona.role}\nPersonality: ${persona.personality}\nSituation: ${persona.situation}\nComms habits: ${persona.comms}\nKnown weak spots: ${weak}\nKnown armor: ${armor}\nTypical reply style: ${persona.replyStyle}\n\nLURES\n${lureText}\n\nTASKS\n1. Score each lure 1-10 for how likely THIS victim falls for it.\n2. Name the psychological triggers used (choose from: Authority, Urgency, Curiosity, Reward, Helpfulness, Fear, Social Proof, Compassion).\n3. One sharp sentence of reasoning per lure, referencing the victim's traits.\n4. Pick the winner (exact player name).\n5. Write the victim's in-character first-person reply to the WINNING lure (1-2 sentences, they took the bait).\n6. One-line defense lesson: what the victim should have done.\n\nJSON SHAPE (exact keys):\n{"scores":[{"player":"...","score":8.5,"triggers":["Authority","Urgency"],"reasoning":"..."}],"winner":"...","victimReply":"...","lesson":"..."}\n\nScore decisively — avoid ties.`
      );
      verdict = out.result;
      latencyMs = out.latencyMs;
      if (!verdict || !Array.isArray(verdict.scores) || !verdict.winner) throw new Error('Bad Jev verdict');
    } catch (e) {
      fallback = true;
      verdict = fallbackJudge(persona, lures);
    }
  } else {
    fallback = true;
    verdict = fallbackJudge(persona, lures);
  }

  // Normalize + score the game
  const byPlayer = new Map(verdict.scores.map((sc) => [sc.player, sc]));
  const ranked = lures
    .map((l) => ({ player: l.player, channel: l.channel, ...(byPlayer.get(l.player) || { score: 5, triggers: [], reasoning: 'No verdict.' }) }))
    .sort((a, b) => b.score - a.score);
  ranked.forEach((r, i) => {
    const p = s.players.find((x) => x.name === r.player);
    if (i === 0) { p.score += 3; p.wins += 1; }
    else if (i === 1 && ranked.length > 2) { p.score += 1; }
  });

  s.current.judged = {
    ranking: ranked,
    winner: verdict.winner,
    victimReply: verdict.victimReply,
    lesson: verdict.lesson,
    round: s.history.length + 1,
  };
  s.history.push({
    round: s.history.length + 1,
    persona: { name: persona.name, role: persona.role, icon: persona.icon },
    judged: s.current.judged,
  });
  s.jevLog.push({
    type: 'judge',
    label: `Judged ${lures.length} lures — winner: ${verdict.winner}`,
    latencyMs, fallback, confidence, at: Date.now(),
  });
  s.judging = false;
  if (s.history.length >= s.rounds) s.done = true;
  res.json({ state: publicState(s) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Reverse Honeypot on :${PORT} (jev ${JEV_KEY ? 'on' : 'fallback'})`));

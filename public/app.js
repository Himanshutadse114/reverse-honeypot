let sessionId = null;
let state = null;
let lureChannel = 'Email';
let lurePlayerIdx = 0;
let wantFinal = false;

const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showError(msg) {
  app.insertAdjacentHTML('afterbegin', `<div class="err">⚠️ ${esc(msg)}</div>`);
  setTimeout(() => { const e = app.querySelector('.err'); if (e) e.remove(); }, 4000);
}

function renderJevLog() {
  const body = document.getElementById('jev-body');
  const panel = document.getElementById('jev-panel');
  if (!state || !state.jevLog.length) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  body.innerHTML = state.jevLog.slice().reverse().map((e) => `
    <div class="jev-entry">
      <b>${esc(e.type)}</b> · ${e.latencyMs ? e.latencyMs + 'ms' : '—'}
      ${e.fallback ? '<span class="fb">[local fallback]</span>' : '<span style="color:var(--green)">[jev]</span>'}<br>
      ${esc(e.label)}
    </div>`).join('');
}

function render() {
  renderJevLog();
  if (!state) return renderSetup();
  if (wantFinal && state.history.length >= state.rounds) return renderFinal();
  const ph = state.phase;
  if (ph === 'lures') return renderLureEntry();
  if (ph === 'judging') return renderJudging();
  if (ph === 'results') return renderResults();
  if (ph === 'done') return renderFinal();
  if (ph === 'victim') return renderVictim();
  return renderSetup();
}

// ------------------------------------------------------------- setup screen
function renderSetup() {
  const rows = [0, 1, 2].map((i) => nameRow(i)).join('');
  app.innerHTML = `
    <div class="card">
      <h2>🎣 Assemble your crew of phishermen</h2>
      <p class="sub">3–6 players. Each round Jev briefs you on a victim — then everyone secretly crafts the perfect lure. Jev judges which one hooks them.</p>
      <div id="names">${rows}</div>
      <div class="btnrow">
        <button class="btn ghost" onclick="addName()">+ add phisherman</button>
      </div>
      <div class="field" style="margin-top:16px">
        <label>ROUNDS</label>
        <select id="rounds">
          <option>3</option><option selected>5</option><option>8</option>
        </select>
      </div>
      <div class="btnrow"><button class="btn" onclick="startGame()">Start the hunt 🎯</button></div>
    </div>
    <div class="card">
      <h2>📜 How it plays</h2>
      <p class="sub" style="margin:0;line-height:1.8">
        ① Read the victim dossier — personality, situation, weak spots.<br>
        ② Pass the device around — each player secretly writes one lure.<br>
        ③ Jev scores every lure, crowns the round winner, and roleplays the victim taking the bait.<br>
        ④ Winner +3 pts, runner-up +1. Most points after all rounds becomes the <b>Master Manipulator</b>.<br><br>
        The twist: every lure teaches a real defense lesson. To beat the phish, think like the phisher.
      </p>
    </div>`;
}

function nameRow(i, val = '') {
  return `<div class="name-row" data-i="${i}"><div class="n">${i + 1}</div>
    <input type="text" maxlength="16" placeholder="Player ${i + 1} name" value="${esc(val)}"></div>`;
}

function currentNames() {
  return [...document.querySelectorAll('#names input')].map((el) => el.value.trim()).filter(Boolean);
}

function addName() {
  const box = document.getElementById('names');
  const vals = currentNames();
  if (box.children.length >= 6) return showError('Max 6 players.');
  box.insertAdjacentHTML('beforeend', nameRow(box.children.length));
  [...box.querySelectorAll('input')].forEach((el, i) => { el.value = vals[i] || ''; });
}

async function startGame() {
  const players = currentNames();
  if (players.length < 3) return showError('Need at least 3 players.');
  const rounds = parseInt(document.getElementById('rounds').value, 10);
  try {
    const { sessionId: id, state: st } = await api('POST', '/api/session', { players, rounds });
    sessionId = id; state = st;
    await nextVictim();
  } catch (e) { showError(e.message); }
}

async function refresh() {
  const { state: st } = await api('GET', `/api/session/${sessionId}`);
  state = st;
  render();
}

async function nextVictim() {
  try {
    const { state: st } = await api('POST', `/api/session/${sessionId}/victim`);
    state = st; lurePlayerIdx = 0; wantFinal = false;
    renderVictim();
  } catch (e) { showError(e.message); }
}

// ------------------------------------------------------------ victim dossier
function renderVictim() {
  const p = state.current.persona;
  app.innerHTML = `
    <div class="card dossier">
      <div class="target-banner">🎯 TARGET ACQUIRED — ROUND ${state.round} OF ${state.rounds}</div>
      <div class="dossier-head">
        <div class="avatar">${p.icon}</div>
        <div><h2>${esc(p.name)}</h2><div class="role">${esc(p.role)}</div></div>
      </div>
      <div class="lbl">PSYCH PROFILE</div>
      <p>${esc(p.personality)}</p>
      <div class="lbl">CURRENT SITUATION</div>
      <p>${esc(p.situation)}</p>
      <div class="lbl">COMMS HABITS</div>
      <p>${esc(p.comms)}</p>
      <div class="lbl">🔓 KNOWN WEAK SPOTS <span style="color:var(--dim)">(your intel — exploit these)</span></div>
      ${p.intel.map((i) => `<div class="intel"><span class="chip">${esc(i.trigger).toUpperCase()}</span><p>${esc(i.detail)}</p></div>`).join('')}
      ${p.armor.length ? `<div class="lbl">🛡️ ARMOR <span style="color:var(--dim)">(don't bother with these)</span></div>
      ${p.armor.map((a) => `<div class="intel armor"><span class="chip">${esc(a.trigger).toUpperCase()}</span><p>${esc(a.detail)}</p></div>`).join('')}` : ''}
      <div class="btnrow"><button class="btn" onclick="renderLureEntry()">Start crafting 🎣</button></div>
    </div>`;
}

// -------------------------------------------------------------- lure entry
function renderLureEntry() {
  const submitted = state.current.lures.length;
  const total = state.players.length;
  if (submitted >= total) { judgeRound(); return; }
  const doneNames = new Set(state.current.lures.map((l) => l.player));
  while (doneNames.has(state.players[lurePlayerIdx].name)) {
    lurePlayerIdx = (lurePlayerIdx + 1) % total;
  }
  const name = state.players[lurePlayerIdx].name;
  const p = state.current.persona;
  app.innerHTML = `
    <div class="pass-banner">
      <div style="font-family:var(--mono);font-size:12px;letter-spacing:2px;color:var(--dim)">PASS THE DEVICE — NO PEEKING</div>
      <div class="who">${esc(name)}</div>
      <div style="font-size:13px;color:var(--dim)">craft your lure for ${esc(p.name)} (${esc(p.role)})</div>
    </div>
    <div class="progress"><i style="width:${(submitted / total) * 100}%"></i></div>
    <div class="card">
      <div class="field"><label>CHANNEL</label>
        <div class="channels" id="channels">
          ${['Email', 'SMS', 'WhatsApp', 'Call script'].map((c) =>
            `<div class="ch${c === lureChannel ? ' on' : ''}" onclick="setChannel('${c}')">${c}</div>`).join('')}
        </div>
      </div>
      <div class="field"><label>YOUR LURE — write the exact message ${esc(p.name.split(' ')[0])} will receive</label>
        <textarea id="lure-text" maxlength="1200" placeholder="Write it exactly as the victim would see it..."></textarea>
        <div class="counter"><span id="ccount">0</span>/1200</div>
      </div>
      <div class="btnrow"><button class="btn" id="send-lure" onclick="submitLure()">Cast it 🎣</button></div>
    </div>`;
  const ta = document.getElementById('lure-text');
  ta.addEventListener('input', () => { document.getElementById('ccount').textContent = ta.value.length; });
  ta.focus();
}

function setChannel(c) {
  lureChannel = c;
  document.querySelectorAll('#channels .ch').forEach((el) =>
    el.classList.toggle('on', el.textContent === c));
}

async function submitLure() {
  const text = document.getElementById('lure-text').value.trim();
  const btn = document.getElementById('send-lure');
  if (text.length < 20) return showError('Too short — make it convincing (20+ characters).');
  btn.disabled = true;
  try {
    const player = state.players[lurePlayerIdx].name;
    const { state: st } = await api('POST', `/api/session/${sessionId}/lure`, { player, channel: lureChannel, text });
    state = st;
    lurePlayerIdx = (lurePlayerIdx + 1) % state.players.length;
    lureChannel = 'Email';
    if (state.current.lures.length >= state.players.length) judgeRound();
    else render();
  } catch (e) { showError(e.message); btn.disabled = false; }
}

// ------------------------------------------------------------------ judging
const JUDGE_LINES = [
  'Reading lure 1… checking the hook…',
  'Profiling the victim\u2019s weak spots…',
  'Comparing psychological triggers…',
  'Measuring urgency vs. authority…',
  'The victim is reaching for their phone…',
  'Final verdict incoming…',
];

function renderJudging() {
  app.innerHTML = `
    <div class="card" style="text-align:center">
      <h2>🧠 Jev is judging ${state.current.lures.length} lures…</h2>
      <div class="spinner"></div>
      <div class="judge-log" id="jlog"></div>
    </div>`;
  const box = document.getElementById('jlog');
  JUDGE_LINES.forEach((l, i) => setTimeout(() => {
    if (document.getElementById('jlog')) box.innerHTML += `<div class="ok">▸</div> ${esc(l)}<br>`;
  }, i * 900));
}

async function judgeRound() {
  renderJudging();
  try {
    const { state: st } = await api('POST', `/api/session/${sessionId}/judge`);
    state = st;
    render();
  } catch (e) { showError(e.message); refresh(); }
}

// ------------------------------------------------------------------ results
function renderResults() {
  const j = state.current.judged;
  const p = state.current.persona;
  const medal = ['🥇', '🥈', '🥉'];
  app.innerHTML = `
    <div class="winner-banner">
      <div class="crown">👑</div>
      <h2>${esc(j.winner)} hooks ${esc(p.name.split(' ')[0])}!</h2>
      <div class="sub">round ${j.round} of ${state.rounds} · +3 pts</div>
    </div>
    <div class="card">
      <h2>🧠 Jev's verdict</h2>
      <p class="sub">ranked by how likely ${esc(p.name.split(' ')[0])} falls for each lure</p>
      ${j.ranking.map((r, i) => `
        <div class="rank${i === 0 ? ' first' : ''}">
          <div class="pos">${medal[i] || (i + 1)}</div>
          <div class="body">
            <div class="hd">
              <span class="nm">${esc(r.player)}</span>
              <span><span class="chan">${esc(r.channel)}</span> <span class="pts">${r.score.toFixed(1)}/10</span></span>
            </div>
            <div class="scorebar"><i style="width:${r.score * 10}%"></i></div>
            <div>${(r.triggers || []).map((t) => `<span class="tchip">${esc(t).toUpperCase()}</span>`).join('')}</div>
            <div class="reason">"${esc(r.reasoning)}"</div>
          </div>
        </div>`).join('')}
    </div>
    <div class="victim-reply">
      <div class="who">${p.icon} ${esc(p.name)} · moments later…</div>
      <div class="msg">"${esc(j.victimReply)}"</div>
    </div>
    <div class="lesson">
      <div class="lbl">🛡️ DEFENSE LESSON</div>
      <p>${esc(j.lesson)}</p>
    </div>
    <div class="card">
      <h2>🏆 Standings</h2>
      ${[...state.players].sort((a, b) => b.score - a.score).map((pl, i) =>
        `<div class="leader${i === 0 ? ' champ' : ''}"><span>${medal[i] || (i + 1)}</span><span class="nm">${esc(pl.name)}</span><span class="sc">${pl.score} pts</span></div>`).join('')}
      <div class="btnrow">
        ${state.history.length >= state.rounds
          ? `<button class="btn" onclick="wantFinal=true;render()">Final results 👑</button>`
          : `<button class="btn" onclick="nextVictim()">Next victim 🎯</button>`}
      </div>
    </div>`;
}

// -------------------------------------------------------------------- final
function renderFinal() {
  const board = [...state.players].sort((a, b) => b.score - a.score);
  const champ = board[0];
  const medal = ['🥇', '🥈', '🥉'];
  app.innerHTML = `
    <div class="winner-banner">
      <div class="crown">👑</div>
      <h2>${esc(champ.name)} is the MASTER MANIPULATOR</h2>
      <div class="sub">${champ.score} pts · ${champ.wins} round wins</div>
    </div>
    <div class="card">
      <h2>🏆 Final leaderboard</h2>
      ${board.map((pl, i) =>
        `<div class="leader${i === 0 ? ' champ' : ''}"><span>${medal[i] || (i + 1)}</span><span class="nm">${esc(pl.name)}</span><span class="sc">${pl.score} pts · ${pl.wins} wins</span></div>`).join('')}
      <div class="btnrow"><button class="btn" onclick="location.reload()">Play again 🎣</button></div>
    </div>
    <div class="card">
      <h2>📼 Round replay</h2>
      ${state.history.map((h) => `
        <div class="rank${''}">
          <div class="pos">${h.persona.icon}</div>
          <div class="body">
            <div class="hd"><span class="nm">Round ${h.round}: ${esc(h.persona.name)}</span><span class="pts">👑 ${esc(h.judged.winner)}</span></div>
            <div class="reason">"${esc(h.judged.victimReply)}"</div>
          </div>
        </div>`).join('')}
    </div>`;
}

renderSetup();

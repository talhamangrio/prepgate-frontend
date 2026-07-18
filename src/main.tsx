import './index.css';

// ==========================================
// CONFIG
// ==========================================
const API = 'https://prepgate-backend.vercel.app';

// ==========================================
// STATE
// ==========================================
let currentUser: any = null;
let currentToken: string | null = localStorage.getItem('pg_token');
let currentTest: any = null;
let activeSubjectFilter: string = 'All';
let questions: any[] = [];
let currentQuestionIndex = 0;
let userAnswers: Record<string, string> = {};
let examTimer: any = null;
let remainingTime = 3000;
let examStartedAt: string | null = null;
let lastResult: any = null;
let lastRankingTestId: string | null = null;
let allTests: any[] = [];
let authMode: 'login' | 'register' = 'login';
let countdownTimer: any = null;

// ==========================================
// UTILITIES
// ==========================================
const $ = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

const $$ = <T extends HTMLElement = HTMLElement>(sel: string): T[] =>
  Array.from(document.querySelectorAll<T>(sel));

function escapeHtml(s: any): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatCountdown(target: string | Date | null | undefined): string {
  if (!target) return 'Date TBA';
  const dt = new Date(target);
  if (isNaN(dt.getTime())) return 'Date TBA';
  const diff = dt.getTime() - Date.now();
  if (diff <= 0) return 'Starting soon';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function getToken(): string | null {
  if (currentToken) return currentToken;
  currentToken = localStorage.getItem('pg_token');
  return currentToken;
}

function setToken(t: string | null) {
  currentToken = t;
  if (t) localStorage.setItem('pg_token', t);
  else localStorage.removeItem('pg_token');
}

function setUser(u: any) {
  currentUser = u;
  if (u) localStorage.setItem('pg_user', JSON.stringify(u));
  else localStorage.removeItem('pg_user');
}

function getStoredUser(): any {
  try { return JSON.parse(localStorage.getItem('pg_user') || 'null'); }
  catch { return null; }
}

async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> || {})
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data;
  }
  if (ct.includes('text/csv')) {
    return await res.text();
  }
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return text;
}

// ==========================================
// VIEW ROUTER
// ==========================================
function showView(id: string) {
  $$('.view').forEach(v => {
    v.classList.remove('visible', 'active-flex', 'active-grid');
  });
  const el = $(id);
  if (el) {
    el.classList.add('visible');
    if (id === 'view-0') el.classList.add('active-flex');
  }
  window.scrollTo(0, 0);
}

function navigateTo(target: string) {
  switch (target) {
    case 'dashboard':
      if (currentUser?.isAdmin) { showView('view-9'); switchAdminTab('dashboard'); return; }
      showView('view-1'); loadDashboard();
      break;
    case 'tests':
      showView('view-2'); loadTestsList();
      break;
    case 'announcements':
      showView('view-8'); loadAnnouncements();
      break;
    case 'profile':
      showView('view-7'); loadProfile();
      break;
    case 'logout':
      setToken(null); setUser(null);
      showView('view-0');
      break;
  }
}

// ==========================================
// AUTH
// ==========================================
function setAuthMode(mode: 'login' | 'register') {
  authMode = mode;
  $('auth-tab-login')?.classList.toggle('active', mode === 'login');
  $('auth-tab-register')?.classList.toggle('active', mode === 'register');
  $('register-name-group')?.classList.toggle('hidden', mode === 'login');
  ($('auth-submit') as HTMLButtonElement)!.textContent = mode === 'login' ? 'Login' : 'Register';
  $('auth-error')?.classList.add('hidden');
}

async function handleAuthSubmit(e: Event) {
  e.preventDefault();
  const email = ($('auth-email') as HTMLInputElement)?.value?.trim();
  const password = ($('auth-password') as HTMLInputElement)?.value;
  const name = ($('auth-name') as HTMLInputElement)?.value?.trim();
  const errEl = $('auth-error');
  if (errEl) errEl.classList.add('hidden');

  if (!email || !password) {
    if (errEl) { errEl.textContent = 'Email and password are required.'; errEl.classList.remove('hidden'); }
    return;
  }

  try {
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const body: any = { email, password };
    if (authMode === 'register') {
      if (!name) throw new Error('Name is required');
      body.name = name;
    }
    const data = await api(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    setToken(data.token);
    setUser(data.user);
    if (data.user?.isAdmin) {
      showView('view-9');
      switchAdminTab('dashboard');
      loadAdminDashboard();
    } else {
      showView('view-1');
      loadDashboard();
    }
  } catch (err: any) {
    if (errEl) { errEl.textContent = err.message || 'Authentication failed.'; errEl.classList.remove('hidden'); }
  }
}

// ==========================================
// DASHBOARD
// ==========================================
async function loadDashboard() {
  if (!currentUser) {
    showView('view-0');
    return;
  }
  const nameEl = $('dash-name');
  if (nameEl) nameEl.textContent = currentUser.name || 'Student';
  try {
    const profile = await api('/api/exam/profile');
    const attempts = profile.attempts || [];
    const testsCount = new Set(attempts.map((a: any) => String(a.test?._id))).size;
    const bestScore = attempts.reduce((max: number, a: any) => {
      const pct = a.totalQuestions ? (a.correctCount / a.totalQuestions) * 100 : 0;
      return Math.max(max, pct);
    }, 0);
    const avgPct = attempts.length ? attempts.reduce((s: number, a: any) => {
      const pct = a.totalQuestions ? (a.correctCount / a.totalQuestions) * 100 : 0;
      return s + pct;
    }, 0) / attempts.length : 0;
    renderStats('dash-stats', [
      { label: 'Tests Attempted', value: String(testsCount) },
      { label: 'Total Submissions', value: String(attempts.length) },
      { label: 'Best Score', value: `${Math.round(bestScore)}%` },
      { label: 'Average Score', value: `${Math.round(avgPct)}%` }
    ]);
  } catch {
    renderStats('dash-stats', [
      { label: 'Tests Attempted', value: '0' },
      { label: 'Total Submissions', value: '0' },
      { label: 'Best Score', value: '—' },
      { label: 'Average Score', value: '—' }
    ]);
  }
}

function renderStats(containerId: string, stats: {label: string, value: string}[]) {
  const c = $(containerId);
  if (!c) return;
  c.innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="stat-label">${escapeHtml(s.label)}</div>
      <div class="stat-value">${escapeHtml(s.value)}</div>
    </div>
  `).join('');
}

// ==========================================
// TESTS LIST
// ==========================================
async function loadTestsList() {
  const grid = $('tests-grid');
  const empty = $('tests-empty');
  if (grid) grid.innerHTML = '<div class="empty-state"><div class="emoji">⏳</div><h3>Loading…</h3></div>';
  try {
    const tests = await api('/api/exam/tests');
    allTests = tests || [];
    renderSubjectPills();
    renderTestsGrid();
  } catch (err: any) {
    if (grid) grid.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div><h3>Failed to load</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function renderSubjectPills() {
  const pills = $('subject-pills');
  if (!pills) return;
  const subjects = Array.from(new Set(allTests.map((t: any) => t.subject).filter(Boolean))) as string[];
  const all = ['All', ...subjects];
  pills.innerHTML = all.map(s => `
    <button class="pill ${s === activeSubjectFilter ? 'active' : ''}" data-subject="${escapeHtml(s)}">${escapeHtml(s)}</button>
  `).join('');
  pills.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      activeSubjectFilter = (b as HTMLElement).dataset.subject || 'All';
      renderSubjectPills();
      renderTestsGrid();
    });
  });
}

function renderTestsGrid() {
  const grid = $('tests-grid');
  const empty = $('tests-empty');
  if (!grid) return;
  const filtered = activeSubjectFilter === 'All'
    ? allTests
    : allTests.filter((t: any) => t.subject === activeSubjectFilter);
  if (!filtered.length) {
    grid.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  grid.innerHTML = filtered.map((t: any) => testCardHtml(t)).join('');
  grid.querySelectorAll('[data-test-card]').forEach(el => {
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const id = (el as HTMLElement).dataset.testCard;
      if (id) { currentTest = filtered.find((t:any) => String(t._id) === id); showView('view-3'); loadTestDetail(); }
    });
  });
  grid.querySelectorAll('[data-action="start"]').forEach(b => {
    b.addEventListener('click', () => {
      const id = (b as HTMLElement).dataset.testId;
      const t = filtered.find((x:any) => String(x._id) === id);
      if (t) { currentTest = t; showView('view-3'); loadTestDetail(); }
    });
  });
  grid.querySelectorAll('[data-action="ranking"]').forEach(b => {
    b.addEventListener('click', () => {
      const id = (b as HTMLElement).dataset.testId;
      if (id) { lastRankingTestId = id; showView('view-6'); loadTestRanking(); }
    });
  });
}

function testCardHtml(t: any): string {
  const status = t.status || 'live';
  if (status === 'coming_soon') {
    return `
      <div class="test-card status-coming_soon" data-test-card="${escapeHtml(t._id)}">
        <div class="test-card-header">
          <span class="test-subject">${escapeHtml(t.subject || 'Test')}</span>
          <span class="status-badge coming-soon"><span class="dot"></span>Coming Soon</span>
        </div>
        <div class="test-name">${escapeHtml(t.name)}</div>
        <div class="test-meta">
          <span>⏱ ${formatDuration(t.durationSec)}</span>
          <span>📝 ${t.totalQuestions || 0} Q</span>
        </div>
        <div class="test-countdown">
          <span class="countdown-label">Starts in</span>
          <span class="countdown-value" data-countdown="${escapeHtml(t.scheduledAt || '')}">${formatCountdown(t.scheduledAt)}</span>
          <div style="font-size:11px;opacity:0.7;margin-top:2px;">on ${formatDate(t.scheduledAt)}</div>
        </div>
      </div>`;
  }
  // live
  return `
    <div class="test-card status-live" data-test-card="${escapeHtml(t._id)}">
      <div class="test-card-header">
        <span class="test-subject">${escapeHtml(t.subject || 'Test')}</span>
        <span class="status-badge live"><span class="dot"></span>Live</span>
      </div>
      <div class="test-name">${escapeHtml(t.name)}</div>
      <div class="test-meta">
        <span>⏱ ${formatDuration(t.durationSec)}</span>
        <span>📝 ${t.totalQuestions || 0} Q</span>
      </div>
      <div class="test-actions">
        <button class="btn btn-gold btn-sm" data-action="start" data-test-id="${escapeHtml(t._id)}">Start Test →</button>
        <button class="btn btn-ghost btn-sm" data-action="ranking" data-test-id="${escapeHtml(t._id)}">Ranking</button>
      </div>
    </div>`;
}

// Live countdown ticker (updates every second)
function startCountdownTicker() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    $$('[data-countdown]').forEach(el => {
      const target = (el as HTMLElement).dataset.countdown;
      el.textContent = formatCountdown(target);
    });
  }, 1000);
}

// ==========================================
// TEST DETAIL
// ==========================================
async function loadTestDetail() {
  if (!currentTest) return;
  const c = $('test-detail-card');
  if (!c) return;
  const t = currentTest;
  const status = t.status || 'live';
  let resumeBlock = '';
  try {
    const session = await api(`/api/exam/session/${t._id}`);
    if (session) {
      resumeBlock = `
        <div class="alert alert-info mt-16">
          You have an in-progress session (${session.currentIndex + 1} answered, ${formatDuration(session.remainingTime)} left).
          <button class="btn btn-ghost btn-sm mt-8" id="resume-btn">Resume</button>
          <button class="btn btn-danger btn-sm mt-8" id="restart-btn" style="margin-left:8px;">Start Over</button>
        </div>`;
    }
  } catch {}

  c.innerHTML = `
    <span class="test-subject">${escapeHtml(t.subject)}</span>
    <h1 class="page-title mt-8" style="margin-top:12px;">${escapeHtml(t.name)}</h1>
    <div class="status-badge ${status === 'live' ? 'live' : 'coming-soon'}" style="margin:8px 0;">
      <span class="dot"></span>${status === 'live' ? 'Live' : 'Coming Soon'}
    </div>
    <div class="stats-row mt-16">
      <div class="stat-card"><div class="stat-label">Duration</div><div class="stat-value">${formatDuration(t.durationSec)}</div></div>
      <div class="stat-card"><div class="stat-label">Questions</div><div class="stat-value">${t.totalQuestions || 0}</div></div>
    </div>
    ${status === 'coming_soon' ? `
      <div class="test-countdown mt-16">
        <span class="countdown-label">Starts in</span>
        <span class="countdown-value" data-countdown="${escapeHtml(t.scheduledAt || '')}">${formatCountdown(t.scheduledAt)}</span>
        <div style="font-size:11px;opacity:0.7;margin-top:2px;">on ${formatDateTime(t.scheduledAt)}</div>
      </div>
      <p class="text-mut mt-16">This test isn't live yet. Check back soon!</p>
    ` : ''}
    ${status === 'live' ? `
      <div class="row mt-24">
        <button class="btn btn-gold btn-lg" id="start-test-btn">Start Test →</button>
        <button class="btn btn-ghost" id="view-ranking-btn">View Ranking</button>
      </div>
    ` : ''}
    ${resumeBlock}
  `;

  $('start-test-btn')?.addEventListener('click', () => { showView('view-4'); startExam(); });
  $('view-ranking-btn')?.addEventListener('click', () => {
    lastRankingTestId = t._id;
    showView('view-6');
    loadTestRanking();
  });
  $('resume-btn')?.addEventListener('click', () => { showView('view-4'); startExam(true); });
  $('restart-btn')?.addEventListener('click', async () => {
    try { await api(`/api/exam/session/${t._id}`, { method: 'DELETE' }); } catch {}
    showView('view-4'); startExam();
  });
  startCountdownTicker();
}

// ==========================================
// EXAM ENGINE
// ==========================================
async function startExam(resume = false) {
  if (!currentTest) return;
  const t = currentTest;
  const nameEl = $('exam-test-name');
  if (nameEl) nameEl.textContent = t.name;

  try {
    const data = await api(`/api/exam/tests/${t._id}/questions`);
    questions = data.questions || [];
    userAnswers = {};
    currentQuestionIndex = 0;
    remainingTime = t.durationSec || 3000;
    examStartedAt = new Date().toISOString();

    if (resume) {
      try {
        const s = await api(`/api/exam/session/${t._id}`);
        if (s) {
          currentQuestionIndex = s.currentIndex || 0;
          userAnswers = s.answers ? Object.fromEntries(s.answers instanceof Map ? s.answers : Object.entries(s.answers)) : {};
          remainingTime = s.remainingTime || t.durationSec;
          if (s.startedAt) examStartedAt = s.startedAt;
        }
      } catch {}
    }

    renderQuestion();
    startExamTimer();
    startAutoSave();
  } catch (err: any) {
    alert('Failed to load questions: ' + err.message);
    showView('view-3');
  }
}

function renderQuestion() {
  if (!questions.length) return;
  const q = questions[currentQuestionIndex];
  const qNum = $('exam-q-num');
  if (qNum) qNum.textContent = `Q ${currentQuestionIndex + 1}`;
  const prog = $('exam-progress-text');
  if (prog) prog.textContent = `Question ${currentQuestionIndex + 1} of ${questions.length}`;
  const fill = $('exam-progress-fill');
  if (fill) fill.style.width = `${((currentQuestionIndex + 1) / questions.length) * 100}%`;

  const passage = $('exam-passage');
  if (passage) {
    if (q.passage) {
      passage.innerHTML = `<span class="passage-label">Passage</span>${escapeHtml(q.passage)}`;
      passage.classList.remove('hidden');
    } else {
      passage.classList.add('hidden');
      passage.innerHTML = '';
    }
  }

  const qt = $('exam-question-text');
  if (qt) qt.textContent = q.question;

  const opts = $('exam-options');
  if (!opts) return;
  const letters = ['A', 'B', 'C', 'D'] as const;
  opts.innerHTML = letters.map(L => {
    const text = q.options?.[L] || '';
    const selected = userAnswers[q._id] === L ? 'selected' : '';
    return `
      <button class="exam-option ${selected}" data-letter="${L}">
        <span class="exam-option-letter">${L}</span>
        <span class="exam-option-text">${escapeHtml(text)}</span>
      </button>`;
  }).join('');
  opts.querySelectorAll('.exam-option').forEach(b => {
    b.addEventListener('click', () => {
      const L = (b as HTMLElement).dataset.letter!;
      userAnswers[q._id] = L;
      opts.querySelectorAll('.exam-option').forEach(o => o.classList.remove('selected'));
      b.classList.add('selected');
    });
  });
}

function startExamTimer() {
  if (examTimer) clearInterval(examTimer);
  updateTimerDisplay();
  examTimer = setInterval(() => {
    remainingTime = Math.max(0, remainingTime - 1);
    updateTimerDisplay();
    if (remainingTime <= 0) {
      clearInterval(examTimer);
      submitExam(true);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const el = $('exam-timer');
  if (!el) return;
  const h = Math.floor(remainingTime / 3600);
  const m = Math.floor((remainingTime % 3600) / 60);
  const s = remainingTime % 60;
  el.textContent = h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  el.classList.toggle('warning', remainingTime <= 300 && remainingTime > 60);
  el.classList.toggle('danger', remainingTime <= 60);
}

let autoSaveTimer: any = null;
function startAutoSave() {
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  autoSaveTimer = setInterval(saveSession, 30000);
}

async function saveSession() {
  if (!currentTest) return;
  try {
    await api('/api/exam/session/save', {
      method: 'POST',
      body: JSON.stringify({
        testId: currentTest._id,
        currentIndex: currentQuestionIndex,
        answers: userAnswers,
        remainingTime,
        startedAt: examStartedAt
      })
    });
  } catch {}
}

async function submitExam(auto = false) {
  if (examTimer) clearInterval(examTimer);
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  if (!currentTest) return;
  try {
    if (!auto) await saveSession();
    const result = await api('/api/exam/submit', {
      method: 'POST',
      body: JSON.stringify({
        testId: currentTest._id,
        answers: userAnswers,
        startedAt: examStartedAt
      })
    });
    lastResult = result;
    lastRankingTestId = currentTest._id;
    showView('view-5');
    renderResult();
  } catch (err: any) {
    alert('Submit failed: ' + err.message);
    showView('view-3');
  }
}

function renderResult() {
  const el = $('result-hero');
  if (!el || !lastResult) return;
  const r = lastResult;
  const test = r.test || {};
  let rank: number | null = null;
  // Try to compute rank from /ranking
  api(`/api/exam/tests/${test._id || lastRankingTestId}/ranking`)
    .then(data => {
      const me = data.ranking?.find((row:any) => String(row.userId) === String(currentUser?.id));
      if (me) {
        const rankEl = $('result-rank');
        if (rankEl) rankEl.textContent = `#${me.rank}`;
      }
    })
    .catch(() => {});

  el.innerHTML = `
    <div class="result-score">${r.correctCount}<span class="total"> / ${r.totalQuestions}</span></div>
    <div class="result-meta">
      <div class="meta-item">
        <span class="meta-value">${r.percentage}%</span>
        <span class="meta-label">Score</span>
      </div>
      <div class="meta-item">
        <span class="meta-value">${formatDuration(r.timeTakenSeconds)}</span>
        <span class="meta-label">Time Taken</span>
      </div>
      <div class="meta-item">
        <span class="meta-value" id="result-rank">—</span>
        <span class="meta-label">Your Rank</span>
      </div>
    </div>
    <p style="margin-top:20px; opacity:0.85;">${escapeHtml(test.name || 'Test')} • ${escapeHtml(test.subject || '')}</p>
  `;
}

// ==========================================
// RANKING (per-test)
// ==========================================
async function loadTestRanking() {
  if (!lastRankingTestId) return;
  const podium = $('ranking-podium');
  const list = $('ranking-list');
  const title = $('ranking-title');
  const tag = $('ranking-test-tag');
  if (podium) podium.innerHTML = '<div class="empty-state"><div class="emoji">⏳</div></div>';
  if (list) list.innerHTML = '';
  try {
    const data = await api(`/api/exam/tests/${lastRankingTestId}/ranking`);
    const test = data.test || {};
    if (title) title.textContent = test.name || 'Ranking';
    if (tag) tag.textContent = test.subject || 'Ranking';
    const ranking = data.ranking || [];
    if (!ranking.length) {
      if (podium) podium.innerHTML = '';
      if (list) list.innerHTML = '<div class="empty-state"><div class="emoji">🏆</div><h3>No attempts yet</h3><p>Be the first to take this test!</p></div>';
      return;
    }
    // Podium (top 3)
    const top3 = ranking.slice(0, 3);
    const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean); // 2nd, 1st, 3rd
    if (podium) {
      podium.innerHTML = podiumOrder.map((r:any) => {
        const rank = r.rank;
        const cls = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : 'rank-3';
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
        const me = String(r.userId) === String(currentUser?.id) ? ' (You)' : '';
        return `
          <div class="podium-card ${cls}">
            <div class="podium-rank">${medal}</div>
            <div class="podium-name">${escapeHtml(r.name)}${me}</div>
            <div class="podium-score">${r.correctCount} / ${r.totalQuestions} • ${formatDuration(r.timeTakenSeconds)}</div>
          </div>`;
      }).join('');
    }
    if (list) {
      list.innerHTML = ranking.map((r:any) => {
        const me = String(r.userId) === String(currentUser?.id) ? 'me' : '';
        return `
          <div class="rank-row ${me}">
            <div class="rank-num">#${r.rank}</div>
            <div>
              <div class="rank-name">${escapeHtml(r.name)}${me ? ' (You)' : ''}</div>
              <div class="rank-detail">${formatDuration(r.timeTakenSeconds)} • ${formatDateTime(r.submittedAt)}</div>
            </div>
            <div class="rank-score">${r.correctCount} / ${r.totalQuestions}</div>
          </div>`;
      }).join('');
    }
  } catch (err:any) {
    if (podium) podium.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div><h3>Failed to load</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

// ==========================================
// PROFILE
// ==========================================
async function loadProfile() {
  if (!currentUser) { showView('view-0'); return; }
  const card = $('profile-card');
  const hist = $('profile-history');
  if (card) {
    const initials = (currentUser.name || 'U').split(' ').map((s:string) => s[0]).slice(0,2).join('').toUpperCase();
    card.innerHTML = `
      <div class="profile-header">
        <div class="avatar">${escapeHtml(initials)}</div>
        <div>
          <h2 style="margin-bottom:4px;">${escapeHtml(currentUser.name)}</h2>
          <p class="text-mut">${escapeHtml(currentUser.email)}</p>
        </div>
      </div>`;
  }
  try {
    const profile = await api('/api/exam/profile');
    const attempts = profile.attempts || [];
    if (hist) {
      if (!attempts.length) {
        hist.innerHTML = '<div class="empty-state"><div class="emoji">📚</div><h3>No attempts yet</h3><p>Take your first test to see history here.</p></div>';
      } else {
        hist.innerHTML = `
          <div class="card">
            <div style="overflow-x:auto;">
              <table class="history-table">
                <thead><tr><th>Test</th><th>Subject</th><th>Score</th><th>Time</th><th>Date</th></tr></thead>
                <tbody>
                  ${attempts.map((a:any) => `
                    <tr>
                      <td>${escapeHtml(a.test?.name || '—')}</td>
                      <td>${escapeHtml(a.test?.subject || '—')}</td>
                      <td><strong>${a.correctCount} / ${a.totalQuestions}</strong> (${a.percentage || 0}%)</td>
                      <td>${formatDuration(a.timeTakenSeconds)}</td>
                      <td>${formatDateTime(a.submittedAt || a.completedAt)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>`;
      }
    }
  } catch (err:any) {
    if (hist) hist.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div><h3>Failed to load</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

// ==========================================
// ANNOUNCEMENTS
// ==========================================
async function loadAnnouncements() {
  const list = $('announcements-list');
  if (list) list.innerHTML = '<div class="empty-state"><div class="emoji">⏳</div></div>';
  try {
    const anns = await api('/api/exam/announcements');
    if (list) {
      if (!anns.length) {
        list.innerHTML = '<div class="empty-state"><div class="emoji">📭</div><h3>No announcements</h3></div>';
      } else {
        list.innerHTML = anns.map((a:any) => `
          <div class="card">
            <div class="row between">
              <h3>${escapeHtml(a.emoji || '📢')} ${escapeHtml(a.title)}</h3>
              <span class="text-mut text-sm">${formatDateTime(a.createdAt)}</span>
            </div>
            <p class="text-mut mt-8">${escapeHtml(a.description || '')}</p>
          </div>
        `).join('');
      }
    }
  } catch (err:any) {
    if (list) list.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div><h3>Failed to load</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

// ==========================================
// ADMIN PANEL
// ==========================================
function switchAdminTab(tab: string) {
  $$('.admin-nav-item').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.adminTab === tab));
  $$('.admin-mobile-nav-item').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.adminTab === tab));
  $$('.admin-tab-content').forEach(c => c.classList.add('hidden'));
  const el = $(`admin-tab-${tab}`);
  if (el) el.classList.remove('hidden');
  if (tab === 'dashboard') loadAdminDashboard();
  if (tab === 'tests') loadAdminTests();
  if (tab === 'users') loadAdminUsers();
  if (tab === 'announcements') loadAdminAnnouncements();
  if (tab === 'logout') navigateTo('logout');
}

async function loadAdminDashboard() {
  try {
    const stats = await api('/api/admin/stats');
    renderStats('admin-stats', [
      { label: 'Total Users', value: String(stats.totalUsers || 0) },
      { label: 'Total Tests', value: String(stats.totalTests || 0) },
      { label: 'Total Attempts', value: String(stats.totalAttempts || 0) },
      { label: 'Total Questions', value: String(stats.totalQuestions || 0) }
    ]);
  } catch {}
}

async function loadAdminTests() {
  try {
    const tests = await api('/api/admin/tests');
    const tbody = $('admin-tests-tbody');
    if (tbody) {
      if (!tests.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-light);">No tests yet. Click "+ New Test" to create one.</td></tr>';
      } else {
        tbody.innerHTML = tests.map((t:any) => {
          const status = t.status || 'live';
          const statusCls = !t.active ? 'hidden' : status;
          const statusLabel = !t.active ? 'Hidden' : (status === 'live' ? 'Live' : 'Coming Soon');
          return `
            <tr>
              <td><strong>${escapeHtml(t.name)}</strong><br><span class="text-mut text-sm">${formatDateTime(t.scheduledAt) === '—' ? '' : '📅 ' + formatDateTime(t.scheduledAt)}</span></td>
              <td><span class="mini-status ${statusCls}">${statusLabel}</span></td>
              <td>${formatDuration(t.durationSec)}</td>
              <td>${t.totalQuestions || 0}</td>
              <td>
                <button class="icon-btn edit" data-edit="${escapeHtml(t._id)}">Edit</button>
                <button class="icon-btn ${t.active ? 'warn' : 'success'}" data-toggle="${escapeHtml(t._id)}">${t.active ? 'Hide' : 'Show'}</button>
                <button class="icon-btn danger" data-delete="${escapeHtml(t._id)}">Delete</button>
              </td>
            </tr>`;
        }).join('');
      }
      tbody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editTest((b as HTMLElement).dataset.edit!)));
      tbody.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => toggleTestActive((b as HTMLElement).dataset.toggle!)));
      tbody.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => deleteTest((b as HTMLElement).dataset.delete!)));
    }
    // Populate test selectors
    const opts = tests.map((t:any) => `<option value="${escapeHtml(t._id)}">${escapeHtml(t.name)}</option>`).join('');
    const csvSel = $('csv-test-id'); if (csvSel) csvSel.innerHTML = opts;
    const dlSel = $('dl-test-id'); if (dlSel) dlSel.innerHTML = opts;
  } catch (err:any) {
    const tbody = $('admin-tests-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--red);">${escapeHtml(err.message)}</td></tr>`;
  }
}

let editingTestId: string | null = null;
function newTestForm() {
  editingTestId = null;
  ($('tf-name') as HTMLInputElement).value = '';
  ($('tf-duration') as HTMLInputElement).value = '3600';
  ($('tf-status') as HTMLSelectElement).value = 'live';
  ($('tf-scheduled') as HTMLInputElement).value = '';
  ($('admin-test-form-title') as HTMLElement).textContent = 'Create New Test';
  $('admin-test-form-card')?.classList.remove('hidden');
}

async function editTest(id: string) {
  const t = allTests.find(x => x._id === id) || (await api('/api/admin/tests')).find((x:any) => x._id === id);
  if (!t) return;
  editingTestId = id;
  ($('tf-name') as HTMLInputElement).value = t.name || '';
  ($('tf-duration') as HTMLInputElement).value = String(t.durationSec || 3600);
  ($('tf-status') as HTMLSelectElement).value = t.status || 'live';
  if (t.scheduledAt) {
    const dt = new Date(t.scheduledAt);
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    ($('tf-scheduled') as HTMLInputElement).value = local;
  } else {
    ($('tf-scheduled') as HTMLInputElement).value = '';
  }
  ($('admin-test-form-title') as HTMLElement).textContent = `Edit: ${t.name}`;
  $('admin-test-form-card')?.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveTest() {
  const name = ($('tf-name') as HTMLInputElement).value.trim();
  const durationSec = parseInt(($('tf-duration') as HTMLInputElement).value, 10);
  const status = ($('tf-status') as HTMLSelectElement).value as 'live' | 'coming_soon';
  const scheduled = ($('tf-scheduled') as HTMLInputElement).value;
  if (!name) { alert('Test name is required.'); return; }
  if (!durationSec || durationSec < 60) { alert('Duration must be at least 60 seconds.'); return; }
  const body: any = {
    name, durationSec, status,
    scheduledAt: scheduled ? new Date(scheduled).toISOString() : null
  };
  try {
    if (editingTestId) {
      await api(`/api/admin/tests/${editingTestId}`, { method: 'PATCH', body: JSON.stringify(body) });
    } else {
      await api('/api/admin/tests', { method: 'POST', body: JSON.stringify(body) });
    }
    $('admin-test-form-card')?.classList.add('hidden');
    loadAdminTests();
  } catch (err:any) {
    alert('Save failed: ' + err.message);
  }
}

async function toggleTestActive(id: string) {
  const t = allTests.find(x => x._id === id);
  try {
    await api(`/api/admin/tests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: !(t?.active ?? true) })
    });
    loadAdminTests();
  } catch (err:any) { alert(err.message); }
}

async function deleteTest(id: string) {
  if (!confirm('Delete this test AND all its questions, attempts, sessions? This cannot be undone.')) return;
  try {
    await api(`/api/admin/tests/${id}`, { method: 'DELETE' });
    loadAdminTests();
  } catch (err:any) { alert(err.message); }
}

async function uploadCsv() {
  const testId = ($('csv-test-id') as HTMLSelectElement).value;
  const csv = ($('csv-text') as HTMLTextAreaElement).value;
  const msg = $('csv-upload-msg');
  if (!testId) { if (msg) { msg.textContent = 'Select a test first.'; msg.style.color = 'var(--red)'; } return; }
  if (!csv.trim()) { if (msg) { msg.textContent = 'Paste CSV or pick a file first.'; msg.style.color = 'var(--red)'; } return; }
  if (msg) { msg.textContent = 'Uploading…'; msg.style.color = 'var(--blue-deep)'; }
  try {
    const r = await api(`/api/admin/tests/${testId}/questions/bulk`, {
      method: 'POST',
      body: JSON.stringify({ csv })
    });
    if (msg) { msg.textContent = `✅ ${r.message}`; msg.style.color = 'var(--green)'; }
    loadAdminTests();
  } catch (err:any) {
    if (msg) { msg.textContent = `❌ ${err.message}`; msg.style.color = 'var(--red)'; }
  }
}

async function downloadRankingsCsv() {
  const testId = ($('dl-test-id') as HTMLSelectElement).value;
  if (!testId) { alert('Select a test first.'); return; }
  try {
    const token = getToken();
    const res = await fetch(`${API}/api/admin/tests/${testId}/rankings.csv`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rankings-${testId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err:any) { alert(err.message); }
}

async function loadAdminUsers() {
  try {
    const users = await api('/api/admin/users');
    const tbody = $('admin-users-tbody');
    if (tbody) {
      tbody.innerHTML = users.map((u:any) => `
        <tr>
          <td>${escapeHtml(u.name)}</td>
          <td>${escapeHtml(u.email)}</td>
          <td>${formatDate(u.createdAt)}</td>
          <td>${u.totalAttempts || 0}</td>
          <td><button class="icon-btn danger" data-del-user="${escapeHtml(u._id)}">Delete</button></td>
        </tr>
      `).join('') || '<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-light);">No users yet.</td></tr>';
      tbody.querySelectorAll('[data-del-user]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Delete this user and all their attempts?')) return;
        try { await api(`/api/admin/users/${(b as HTMLElement).dataset.delUser}`, { method: 'DELETE' }); loadAdminUsers(); }
        catch (e:any) { alert(e.message); }
      }));
    }
  } catch (err:any) { alert(err.message); }
}

async function loadAdminAnnouncements() {
  try {
    const anns = await api('/api/admin/announcements');
    const list = $('admin-ann-list');
    if (list) {
      list.innerHTML = anns.length ? anns.map((a:any) => `
        <div class="card card-tight row between">
          <div>
            <strong>${escapeHtml(a.emoji || '📢')} ${escapeHtml(a.title)}</strong>
            <p class="text-mut text-sm">${escapeHtml(a.description || '')}</p>
          </div>
          <button class="icon-btn danger" data-del-ann="${escapeHtml(a._id)}">Delete</button>
        </div>
      `).join('') : '<p class="text-mut">No announcements yet.</p>';
      list.querySelectorAll('[data-del-ann]').forEach(b => b.addEventListener('click', async () => {
        try { await api(`/api/admin/announcements/${(b as HTMLElement).dataset.delAnn}`, { method: 'DELETE' }); loadAdminAnnouncements(); }
        catch (e:any) { alert(e.message); }
      }));
    }
  } catch (err:any) { alert(err.message); }
}

async function createAnnouncement() {
  const title = ($('ann-title') as HTMLInputElement).value.trim();
  const description = ($('ann-desc') as HTMLTextAreaElement).value.trim();
  const emoji = ($('ann-emoji') as HTMLInputElement).value.trim() || '📢';
  if (!title) { alert('Title required.'); return; }
  try {
    await api('/api/admin/announcements', { method: 'POST', body: JSON.stringify({ title, description, emoji }) });
    ($('ann-title') as HTMLInputElement).value = '';
    ($('ann-desc') as HTMLTextAreaElement).value = '';
    loadAdminAnnouncements();
  } catch (err:any) { alert(err.message); }
}

// ==========================================
// EVENT WIRING
// ==========================================
function wireEvents() {
  // Auth tabs
  $('auth-tab-login')?.addEventListener('click', () => setAuthMode('login'));
  $('auth-tab-register')?.addEventListener('click', () => setAuthMode('register'));
  $('auth-form')?.addEventListener('submit', handleAuthSubmit);

  // Global nav buttons (data-nav attribute)
  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('[data-nav]') as HTMLElement | null;
    if (target) {
      e.preventDefault();
      navigateTo(target.dataset.nav!);
    }
  });

  // Admin nav (data-admin-tab)
  document.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('[data-admin-tab]') as HTMLElement | null;
    if (t) { e.preventDefault(); switchAdminTab(t.dataset.adminTab!); }
  });

  // Exam buttons
  $('exam-prev')?.addEventListener('click', () => {
    if (currentQuestionIndex > 0) { currentQuestionIndex--; renderQuestion(); }
  });
  $('exam-next')?.addEventListener('click', () => {
    if (currentQuestionIndex < questions.length - 1) { currentQuestionIndex++; renderQuestion(); }
    else if (confirm('This is the last question. Submit?')) submitExam(false);
  });
  $('exam-quit')?.addEventListener('click', async () => {
    if (!confirm('Save & quit? You can resume this test later.')) return;
    await saveSession();
    if (examTimer) clearInterval(examTimer);
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    showView('view-3');
    loadTestDetail();
  });

  // Result buttons
  $('result-view-ranking')?.addEventListener('click', () => {
    showView('view-6'); loadTestRanking();
  });

  // Admin tests tab buttons
  $('admin-new-test-btn')?.addEventListener('click', newTestForm);
  $('admin-test-save')?.addEventListener('click', saveTest);
  $('admin-test-cancel')?.addEventListener('click', () => $('admin-test-form-card')?.classList.add('hidden'));
  $('csv-upload-btn')?.addEventListener('click', uploadCsv);
  $('dl-csv-btn')?.addEventListener('click', downloadRankingsCsv);
  $('ann-create')?.addEventListener('click', createAnnouncement);

  // CSV file picker auto-fill
  $('csv-file')?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ta = $('csv-text') as HTMLTextAreaElement | null;
      if (ta) ta.value = String(reader.result || '');
    };
    reader.readAsText(file);
  });
}

// ==========================================
// INIT
// ==========================================
function init() {
  wireEvents();
  startCountdownTicker();
  const stored = getStoredUser();
  const token = getToken();
  if (stored && token) {
    currentUser = stored;
    if (stored.isAdmin) {
      showView('view-9');
      switchAdminTab('dashboard');
    } else {
      showView('view-1');
      loadDashboard();
    }
  } else {
    setAuthMode('login');
    showView('view-0');
  }
}

init();

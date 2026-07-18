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
      if (currentUser?.isAdmin || currentUser?.isModerator) { showView('view-9'); switchAdminTab('dashboard'); return; }
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
    case 'developers':
      showView('view-10'); loadDevelopers();
      break;
    case 'contact':
      showView('view-11'); resetContactForm();
      break;
    case 'logout':
      setToken(null); setUser(null);
      showView('view-0');
      break;
  }
}

// ==========================================
// 3-DOTS NAV MENU (dropdown open/close + outside-click dismiss)
// ==========================================
function closeAllNavMenus() {
  $$('.nav-menu.open').forEach(m => {
    m.classList.remove('open');
    const btn = m.querySelector('.nav-menu-btn') as HTMLButtonElement | null;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
}

function toggleNavMenu(menu: HTMLElement) {
  const isOpen = menu.classList.contains('open');
  closeAllNavMenus();
  if (!isOpen) {
    menu.classList.add('open');
    const btn = menu.querySelector('.nav-menu-btn') as HTMLButtonElement | null;
    if (btn) btn.setAttribute('aria-expanded', 'true');
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
      refreshAdminNavVisibility();
      switchAdminTab('dashboard');
      loadAdminDashboard();
    } else if (data.user?.isModerator) {
      // Moderator lands on the admin panel too, but only sees the tabs
      // their permissions allow. They default to the first permitted tab.
      showView('view-9');
      refreshAdminNavVisibility();
      const firstTab = firstPermittedTab(data.user.permissions);
      switchAdminTab(firstTab);
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

  // Reset submit guard + button state for a fresh attempt
  submitting = false;
  const submitBtn = $('exam-submit') as HTMLButtonElement | null;
  const nextBtn = $('exam-next') as HTMLButtonElement | null;
  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '✓ Submit Test'; }
  if (nextBtn) { nextBtn.disabled = false; }

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

  // Last-question UX: hide Next, show Submit. Vice-versa on non-last questions.
  const isLast = currentQuestionIndex >= questions.length - 1;
  const nextBtn = $('exam-next');
  const submitBtn = $('exam-submit');
  if (nextBtn) nextBtn.classList.toggle('hidden', isLast);
  if (submitBtn) submitBtn.classList.toggle('hidden', !isLast);

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

// Double-submit guard — prevents the "Alice clicked Submit twice and got
// two result records" bug. Set synchronously before any await; cleared only
// on view transition (so a stuck request can't accidentally re-enable).
let submitting = false;

async function submitExam(auto = false) {
  // Double-submit protection: ignore any click that arrives while a submit
  // is already in flight. This handles double-clicks, browser autofill
  // re-fires, and the case where the user clicks Submit then Enter.
  if (submitting) return;
  if (!currentTest) return;
  submitting = true;

  // Disable both possible submit triggers immediately (visual feedback)
  const submitBtn = $('exam-submit') as HTMLButtonElement | null;
  const nextBtn = $('exam-next') as HTMLButtonElement | null;
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }
  if (nextBtn) { nextBtn.disabled = true; }

  if (examTimer) clearInterval(examTimer);
  if (autoSaveTimer) clearInterval(autoSaveTimer);

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
    // submitting stays true — we're done, the exam view is gone.
  } catch (err: any) {
    // Re-enable on error so the user can retry
    submitting = false;
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '✓ Submit Test'; }
    if (nextBtn) { nextBtn.disabled = false; }
    alert('Submit failed: ' + err.message);
    showView('view-3');
  }
}

function renderResult() {
  const el = $('result-hero');
  if (!el || !lastResult) return;
  const r = lastResult;
  const test = r.test || {};

  // "This attempt" vs "your stored best" hint.
  // - isNewBest === true  → this attempt IS the new best (saved)
  // - isNewBest === false → this attempt was worse than a previous best;
  //                         we discarded it; show their stored best side-by-side
  // - isNewBest === undefined → old backend without the field; no hint
  let bestHint = '';
  if (r.isNewBest === false && r.bestCorrectCount !== undefined) {
    bestHint = `
      <div class="result-best-hint" style="margin-top:16px; padding:12px 16px; background:rgba(255,209,102,0.12); border:1px solid rgba(255,209,102,0.4); border-radius:8px; font-size:13px; color:var(--blue-deep);">
        <strong>⭐ Your best score for this test: ${r.bestCorrectCount}/${r.totalQuestions}</strong>
        ${r.bestTimeTakenSeconds != null ? ` in ${formatDuration(r.bestTimeTakenSeconds)}` : ''}
        — this attempt (${r.correctCount}/${r.totalQuestions}) was not better, so we kept your previous best on the ranking.
      </div>`;
  } else if (r.isNewBest === true && r.bestCorrectCount !== undefined && r.bestCorrectCount === r.correctCount) {
    bestHint = `
      <div class="result-best-hint" style="margin-top:16px; padding:12px 16px; background:rgba(76,175,80,0.12); border:1px solid rgba(76,175,80,0.4); border-radius:8px; font-size:13px; color:var(--blue-deep);">
        <strong>🎉 New personal best!</strong> Your previous attempts (if any) have been replaced by this one.
      </div>`;
  }

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
    ${bestHint}
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

// The canonical order of admin tabs — used to pick a moderator's first
// permitted tab and to keep nav ordering predictable.
const ADMIN_TAB_ORDER = ['dashboard', 'tests', 'users', 'announcements', 'messages', 'moderators'] as const;
type AdminTab = typeof ADMIN_TAB_ORDER[number];

// Returns true if the current user can access a given admin tab.
// Admins can access everything; moderators only what their permissions allow.
// 'moderators' is admin-only (moderators cannot manage other moderators).
function canAccessTab(tab: string): boolean {
  if (!currentUser) return false;
  if (currentUser.isAdmin) return true;
  if (currentUser.isModerator) {
    if (tab === 'moderators') return false; // admin-only
    if (tab === 'logout') return true;
    return !!(currentUser.permissions && (currentUser.permissions as any)[tab]);
  }
  return false;
}

function firstPermittedTab(perms: any): string {
  if (!perms) return 'dashboard';
  for (const t of ADMIN_TAB_ORDER) {
    if (perms[t]) return t;
  }
  return 'dashboard'; // fallback (shouldn't happen for valid moderators)
}

// Refreshes the visibility of admin-nav items based on the current user's
// permissions. Hides tabs the user can't access so they never see them.
function refreshAdminNavVisibility() {
  $$('.admin-nav-item').forEach(b => {
    const tab = (b as HTMLElement).dataset.adminTab!;
    if (tab === 'logout') return;
    const allowed = canAccessTab(tab);
    b.style.display = allowed ? '' : 'none';
  });
  $$('.admin-mobile-nav-item').forEach(b => {
    const tab = (b as HTMLElement).dataset.adminTab!;
    if (tab === 'logout') return;
    const allowed = canAccessTab(tab);
    b.style.display = allowed ? '' : 'none';
  });
}

function switchAdminTab(tab: string) {
  // Guard: if the current user can't access this tab (e.g. a moderator
  // clicking a stale URL or a hidden nav item), bounce to their first
  // permitted tab instead.
  if (!canAccessTab(tab)) {
    const fallback = currentUser?.isModerator ? firstPermittedTab(currentUser.permissions) : 'dashboard';
    if (fallback !== tab) { switchAdminTab(fallback); return; }
  }

  $$('.admin-nav-item').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.adminTab === tab));
  $$('.admin-mobile-nav-item').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.adminTab === tab));
  $$('.admin-tab-content').forEach(c => c.classList.add('hidden'));
  const el = $(`admin-tab-${tab}`);
  if (el) el.classList.remove('hidden');
  if (tab === 'dashboard') loadAdminDashboard();
  if (tab === 'tests') loadAdminTests();
  if (tab === 'users') loadAdminUsers();
  if (tab === 'announcements') loadAdminAnnouncements();
  if (tab === 'messages') loadAdminMessages();
  if (tab === 'moderators') loadAdminModerators();
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
    const cardsEl = $('admin-tests-cards');
    if (!tests.length) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-light);">No tests yet. Click "+ New Test" to create one.</td></tr>';
      if (cardsEl) cardsEl.innerHTML = '<p style="text-align:center; padding:24px; color:var(--text-light);">No tests yet. Click "+ New Test" to create one.</p>';
    } else {
      const rows = tests.map((t:any) => {
        const status = t.status || 'live';
        const statusCls = !t.active ? 'hidden' : status;
        const statusLabel = !t.active ? 'Hidden' : (status === 'live' ? 'Live' : 'Coming Soon');
        const sched = formatDateTime(t.scheduledAt) === '—' ? '' : '📅 ' + formatDateTime(t.scheduledAt);
        return `
          <tr>
            <td><strong>${escapeHtml(t.name)}</strong><br><span class="text-mut text-sm">${sched}</span></td>
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
      if (tbody) tbody.innerHTML = rows;
      // Mobile cards (stacked, no horizontal scroll)
      if (cardsEl) {
        cardsEl.innerHTML = tests.map((t:any) => {
          const status = t.status || 'live';
          const statusCls = !t.active ? 'hidden' : status;
          const statusLabel = !t.active ? 'Hidden' : (status === 'live' ? 'Live' : 'Coming Soon');
          const sched = formatDateTime(t.scheduledAt) === '—' ? '' : formatDateTime(t.scheduledAt);
          return `
            <div class="admin-card-item">
              <div class="admin-card-row">
                <div>
                  <div class="admin-card-name">${escapeHtml(t.name)}</div>
                  ${sched ? `<div class="admin-card-sub">📅 ${sched}</div>` : ''}
                </div>
                <span class="mini-status ${statusCls}">${statusLabel}</span>
              </div>
              <div class="admin-card-row">
                <span class="admin-card-label">Duration</span>
                <span class="admin-card-value">${formatDuration(t.durationSec)}</span>
              </div>
              <div class="admin-card-row">
                <span class="admin-card-label">Questions</span>
                <span class="admin-card-value">${t.totalQuestions || 0}</span>
              </div>
              <div class="admin-card-actions">
                <button class="icon-btn edit" data-edit="${escapeHtml(t._id)}">✎ Edit</button>
                <button class="icon-btn ${t.active ? 'warn' : 'success'}" data-toggle="${escapeHtml(t._id)}">${t.active ? '⊘ Hide' : '◉ Show'}</button>
                <button class="icon-btn danger" data-delete="${escapeHtml(t._id)}">🗑 Delete</button>
              </div>
            </div>`;
        }).join('');
      }
      // Wire up both desktop + mobile buttons
      [tbody, cardsEl].forEach(scope => {
        if (!scope) return;
        scope.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editTest((b as HTMLElement).dataset.edit!)));
        scope.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => toggleTestActive((b as HTMLElement).dataset.toggle!)));
        scope.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => deleteTest((b as HTMLElement).dataset.delete!)));
      });
    }
    // Populate test selectors
    const opts = tests.map((t:any) => `<option value="${escapeHtml(t._id)}">${escapeHtml(t.name)}</option>`).join('');
    const csvSel = $('csv-test-id'); if (csvSel) csvSel.innerHTML = opts;
    const dlSel = $('dl-test-id'); if (dlSel) dlSel.innerHTML = opts;
  } catch (err:any) {
    const tbody = $('admin-tests-tbody');
    const cardsEl = $('admin-tests-cards');
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--red);">${escapeHtml(err.message)}</td></tr>`;
    if (cardsEl) cardsEl.innerHTML = `<p style="text-align:center; padding:24px; color:var(--red);">${escapeHtml(err.message)}</p>`;
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
    const cardsEl = $('admin-users-cards');

    const empty = '<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text-light);">No users yet.</td></tr>';
    const emptyCard = '<p style="text-align:center; padding:24px; color:var(--text-light);">No users yet.</p>';

    if (!users.length) {
      if (tbody) tbody.innerHTML = empty;
      if (cardsEl) cardsEl.innerHTML = emptyCard;
      return;
    }

    if (tbody) {
      tbody.innerHTML = users.map((u:any) => `
        <tr>
          <td>${escapeHtml(u.name)}</td>
          <td>${escapeHtml(u.email)}</td>
          <td>${formatDate(u.createdAt)}</td>
          <td>${u.totalAttempts || 0}</td>
          <td><button class="icon-btn danger" data-del-user="${escapeHtml(u._id)}">Delete</button></td>
        </tr>
      `).join('');
    }
    if (cardsEl) {
      cardsEl.innerHTML = users.map((u:any) => `
        <div class="admin-card-item">
          <div class="admin-card-row">
            <div>
              <div class="admin-card-name">${escapeHtml(u.name)}</div>
              <div class="admin-card-sub">${escapeHtml(u.email)}</div>
            </div>
          </div>
          <div class="admin-card-row">
            <span class="admin-card-label">Joined</span>
            <span class="admin-card-value">${formatDate(u.createdAt)}</span>
          </div>
          <div class="admin-card-row">
            <span class="admin-card-label">Attempts</span>
            <span class="admin-card-value">${u.totalAttempts || 0}</span>
          </div>
          <div class="admin-card-actions">
            <button class="icon-btn danger" data-del-user="${escapeHtml(u._id)}">🗑 Delete</button>
          </div>
        </div>
      `).join('');
    }

    // Wire up both desktop + mobile delete buttons
    [tbody, cardsEl].forEach(scope => {
      if (!scope) return;
      scope.querySelectorAll('[data-del-user]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Delete this user and all their attempts?')) return;
        try { await api(`/api/admin/users/${(b as HTMLElement).dataset.delUser}`, { method: 'DELETE' }); loadAdminUsers(); }
        catch (e:any) { alert(e.message); }
      }));
    });
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
// ADMIN: MESSAGES (Contact Us submissions)
// ==========================================
let msgFilter: 'all' | 'unread' = 'all';

async function loadAdminMessages() {
  const tbody = $('admin-msg-tbody');
  const cardsEl = $('admin-msg-cards');
  const statsEl = $('admin-msg-stats');
  try {
    const path = msgFilter === 'unread' ? '/api/admin/messages?unread=true' : '/api/admin/messages';
    const data = await api(path);
    const msgs = data.messages || [];
    const unread = data.unreadCount || 0;

    // Stats header + sidebar badge
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="stat-pill"><span class="stat-pill-num">${msgs.length}</span><span class="stat-pill-lbl">${msgFilter === 'unread' ? 'Unread' : 'Total shown'}</span></div>
        <div class="stat-pill ${unread ? 'stat-pill-warn' : ''}"><span class="stat-pill-num">${unread}</span><span class="stat-pill-lbl">Unread</span></div>
      `;
    }
    const badge = $('admin-msg-badge');
    if (badge) {
      if (unread > 0) {
        badge.textContent = String(unread);
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    // Filter button states
    $('msg-filter-all')?.classList.toggle('btn-primary', msgFilter === 'all');
    $('msg-filter-all')?.classList.toggle('btn-ghost', msgFilter !== 'all');
    $('msg-filter-unread')?.classList.toggle('btn-primary', msgFilter === 'unread');
    $('msg-filter-unread')?.classList.toggle('btn-ghost', msgFilter !== 'unread');

    if (!msgs.length) {
      const empty = msgFilter === 'unread'
        ? 'No unread messages — you are all caught up!'
        : 'No messages yet. Submissions from the Contact Us form will appear here.';
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-light);">${empty}</td></tr>`;
      if (cardsEl) cardsEl.innerHTML = `<p style="text-align:center; padding:24px; color:var(--text-light);">${empty}</p>`;
      return;
    }

    const renderRow = (m:any) => `
      <tr class="${m.read ? '' : 'unread-row'}">
        <td><strong>${escapeHtml(m.name)}</strong>${m.age ? `<br><span class="text-mut text-sm">Age ${m.age}</span>` : ''}</td>
        <td>${m.email ? `<a href="mailto:${escapeHtml(m.email)}" style="color:var(--blue-mid);">${escapeHtml(m.email)}</a>` : '<span class="text-mut">—</span>'}</td>
        <td>${m.subject ? escapeHtml(m.subject) : '<span class="text-mut">—</span>'}</td>
        <td class="msg-cell">${escapeHtml(m.message).slice(0, 200)}${m.message.length > 200 ? '…' : ''}</td>
        <td><span class="text-mut text-sm">${formatDateTime(m.createdAt)}</span></td>
        <td>
          <button class="icon-btn ${m.read ? 'warn' : 'success'}" data-msg-toggle="${escapeHtml(m._id)}">${m.read ? 'Mark unread' : 'Mark read'}</button>
          <button class="icon-btn danger" data-msg-del="${escapeHtml(m._id)}">Delete</button>
        </td>
      </tr>`;

    const renderCard = (m:any) => `
      <div class="admin-card-item ${m.read ? '' : 'unread-card'}">
        <div class="admin-card-row">
          <div>
            <div class="admin-card-name">${escapeHtml(m.name)}${m.age ? ` <span class="text-mut text-sm">· Age ${m.age}</span>` : ''}</div>
            ${m.email ? `<div class="admin-card-sub"><a href="mailto:${escapeHtml(m.email)}" style="color:var(--blue-mid);">${escapeHtml(m.email)}</a></div>` : ''}
          </div>
          ${!m.read ? '<span class="mini-status live">New</span>' : ''}
        </div>
        ${m.subject ? `<div class="admin-card-row"><span class="admin-card-label">Subject</span><span class="admin-card-value">${escapeHtml(m.subject)}</span></div>` : ''}
        <div class="admin-card-row"><span class="admin-card-label">Message</span><span class="admin-card-value" style="text-align:left;">${escapeHtml(m.message)}</span></div>
        <div class="admin-card-row"><span class="admin-card-label">Received</span><span class="admin-card-value">${formatDateTime(m.createdAt)}</span></div>
        <div class="admin-card-actions">
          <button class="icon-btn ${m.read ? 'warn' : 'success'}" data-msg-toggle="${escapeHtml(m._id)}">${m.read ? '⊘ Mark unread' : '◉ Mark read'}</button>
          <button class="icon-btn danger" data-msg-del="${escapeHtml(m._id)}">🗑 Delete</button>
        </div>
      </div>`;

    if (tbody) tbody.innerHTML = msgs.map(renderRow).join('');
    if (cardsEl) cardsEl.innerHTML = msgs.map(renderCard).join('');

    [tbody, cardsEl].forEach(scope => {
      if (!scope) return;
      scope.querySelectorAll('[data-msg-toggle]').forEach(b => b.addEventListener('click', async () => {
        const id = (b as HTMLElement).dataset.msgToggle!;
        const m = msgs.find((x:any) => String(x._id) === id);
        try {
          await api(`/api/admin/messages/${id}`, { method: 'PATCH', body: JSON.stringify({ read: !m?.read }) });
          loadAdminMessages();
        } catch (e:any) { alert(e.message); }
      }));
      scope.querySelectorAll('[data-msg-del]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Delete this message? This cannot be undone.')) return;
        const id = (b as HTMLElement).dataset.msgDel!;
        try {
          await api(`/api/admin/messages/${id}`, { method: 'DELETE' });
          loadAdminMessages();
        } catch (e:any) { alert(e.message); }
      }));
    });
  } catch (err:any) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--red);">${escapeHtml(err.message)}</td></tr>`;
    if (cardsEl) cardsEl.innerHTML = `<p style="text-align:center; padding:24px; color:var(--red);">${escapeHtml(err.message)}</p>`;
  }
}

async function markAllMessagesRead() {
  try {
    const data = await api('/api/admin/messages?unread=true');
    const unread = data.messages || [];
    for (const m of unread) {
      await api(`/api/admin/messages/${m._id}`, { method: 'PATCH', body: JSON.stringify({ read: true }) });
    }
    loadAdminMessages();
  } catch (e:any) { alert(e.message); }
}

// ==========================================
// ADMIN: MODERATORS (admin-only CRUD)
// ==========================================
let editingModId: string | null = null;

function newModeratorForm() {
  editingModId = null;
  ($('mf-name') as HTMLInputElement).value = '';
  ($('mf-email') as HTMLInputElement).value = '';
  ($('mf-password') as HTMLInputElement).value = '';
  ($('mf-active') as HTMLSelectElement).value = 'true';
  ['mf-perm-dashboard', 'mf-perm-tests', 'mf-perm-users', 'mf-perm-announcements', 'mf-perm-messages']
    .forEach(id => { const el = $(id) as HTMLInputElement | null; if (el) el.checked = false; });
  ($('admin-mod-form-title') as HTMLElement).textContent = 'Create New Moderator';
  $('admin-mod-form-card')?.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelModeratorForm() {
  editingModId = null;
  $('admin-mod-form-card')?.classList.add('hidden');
}

async function editModerator(id: string) {
  try {
    const mods = await api('/api/admin/moderators');
    const m = mods.find((x:any) => String(x._id) === id);
    if (!m) return;
    editingModId = id;
    ($('mf-name') as HTMLInputElement).value = m.name || '';
    ($('mf-email') as HTMLInputElement).value = m.email || '';
    ($('mf-password') as HTMLInputElement).value = ''; // never pre-fill password
    ($('mf-active') as HTMLSelectElement).value = m.active ? 'true' : 'false';
    ($('mf-perm-dashboard') as HTMLInputElement).checked = !!m.permissions?.dashboard;
    ($('mf-perm-tests') as HTMLInputElement).checked = !!m.permissions?.tests;
    ($('mf-perm-users') as HTMLInputElement).checked = !!m.permissions?.users;
    ($('mf-perm-announcements') as HTMLInputElement).checked = !!m.permissions?.announcements;
    ($('mf-perm-messages') as HTMLInputElement).checked = !!m.permissions?.messages;
    ($('admin-mod-form-title') as HTMLElement).textContent = `Edit: ${m.name}`;
    $('admin-mod-form-card')?.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err:any) { alert(err.message); }
}

async function saveModerator() {
  const name = ($('mf-name') as HTMLInputElement).value.trim();
  const email = ($('mf-email') as HTMLInputElement).value.trim();
  const password = ($('mf-password') as HTMLInputElement).value;
  const active = ($('mf-active') as HTMLSelectElement).value === 'true';
  const permissions = {
    dashboard:     ($('mf-perm-dashboard') as HTMLInputElement).checked,
    tests:         ($('mf-perm-tests') as HTMLInputElement).checked,
    users:         ($('mf-perm-users') as HTMLInputElement).checked,
    announcements: ($('mf-perm-announcements') as HTMLInputElement).checked,
    messages:      ($('mf-perm-messages') as HTMLInputElement).checked
  };

  if (!name || !email) { alert('Name and email are required.'); return; }
  if (!editingModId && !password) { alert('Password is required for new moderators.'); return; }
  if (password && password.length < 6) { alert('Password must be at least 6 characters.'); return; }
  if (!Object.values(permissions).some(Boolean)) {
    if (!confirm('No permissions selected — this moderator will not be able to access any tab. Save anyway?')) return;
  }

  const body: any = { name, email, permissions, active };
  if (password) body.password = password;

  try {
    if (editingModId) {
      await api(`/api/admin/moderators/${editingModId}`, { method: 'PATCH', body: JSON.stringify(body) });
    } else {
      await api('/api/admin/moderators', { method: 'POST', body: JSON.stringify(body) });
    }
    cancelModeratorForm();
    loadAdminModerators();
  } catch (err:any) { alert('Save failed: ' + err.message); }
}

async function toggleModeratorActive(id: string, currentlyActive: boolean) {
  try {
    await api(`/api/admin/moderators/${id}`, { method: 'PATCH', body: JSON.stringify({ active: !currentlyActive }) });
    loadAdminModerators();
  } catch (err:any) { alert(err.message); }
}

async function deleteModerator(id: string) {
  if (!confirm('Delete this moderator account? They will no longer be able to log in.')) return;
  try {
    await api(`/api/admin/moderators/${id}`, { method: 'DELETE' });
    loadAdminModerators();
  } catch (err:any) { alert(err.message); }
}

async function loadAdminModerators() {
  // Moderator-tab is admin-only. If a moderator somehow lands here, show a
  // notice instead of attempting the (admin-only) API call.
  if (currentUser?.isModerator && !currentUser?.isAdmin) {
    const notice = $('admin-mod-notice');
    if (notice) {
      notice.textContent = 'You do not have permission to manage moderators. Only the admin can create or edit moderator accounts.';
      notice.classList.remove('hidden');
    }
    return;
  }

  const tbody = $('admin-mod-tbody');
  const cardsEl = $('admin-mod-cards');
  try {
    const mods = await api('/api/admin/moderators');
    if (!mods.length) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-light);">No moderators yet. Click "+ New Moderator" to create one.</td></tr>';
      if (cardsEl) cardsEl.innerHTML = '<p style="text-align:center; padding:24px; color:var(--text-light);">No moderators yet.</p>';
      return;
    }

    const permBadges = (p:any) => {
      const list = [
        p.dashboard && '📊',
        p.tests && '📝',
        p.users && '👥',
        p.announcements && '📢',
        p.messages && '💬'
      ].filter(Boolean);
      return list.length
        ? `<div class="perm-badges">${list.map(b => `<span class="perm-badge">${b}</span>`).join('')}</div>`
        : '<span class="text-mut text-sm">No permissions</span>';
    };

    if (tbody) {
      tbody.innerHTML = mods.map((m:any) => `
        <tr>
          <td><strong>${escapeHtml(m.name)}</strong></td>
          <td>${escapeHtml(m.email)}</td>
          <td>${permBadges(m.permissions)}</td>
          <td><span class="mini-status ${m.active ? 'live' : 'hidden'}">${m.active ? 'Active' : 'Disabled'}</span></td>
          <td><span class="text-mut text-sm">${formatDate(m.createdAt)}</span></td>
          <td>
            <button class="icon-btn edit" data-mod-edit="${escapeHtml(m._id)}">Edit</button>
            <button class="icon-btn ${m.active ? 'warn' : 'success'}" data-mod-toggle="${escapeHtml(m._id)}" data-active="${m.active}">${m.active ? 'Disable' : 'Enable'}</button>
            <button class="icon-btn danger" data-mod-del="${escapeHtml(m._id)}">Delete</button>
          </td>
        </tr>
      `).join('');
    }
    if (cardsEl) {
      cardsEl.innerHTML = mods.map((m:any) => `
        <div class="admin-card-item">
          <div class="admin-card-row">
            <div>
              <div class="admin-card-name">${escapeHtml(m.name)}</div>
              <div class="admin-card-sub">${escapeHtml(m.email)}</div>
            </div>
            <span class="mini-status ${m.active ? 'live' : 'hidden'}">${m.active ? 'Active' : 'Disabled'}</span>
          </div>
          <div class="admin-card-row">
            <span class="admin-card-label">Permissions</span>
            <span class="admin-card-value" style="text-align:left;">${permBadges(m.permissions)}</span>
          </div>
          <div class="admin-card-row">
            <span class="admin-card-label">Created</span>
            <span class="admin-card-value">${formatDate(m.createdAt)}</span>
          </div>
          <div class="admin-card-actions">
            <button class="icon-btn edit" data-mod-edit="${escapeHtml(m._id)}">✎ Edit</button>
            <button class="icon-btn ${m.active ? 'warn' : 'success'}" data-mod-toggle="${escapeHtml(m._id)}" data-active="${m.active}">${m.active ? '⊘ Disable' : '◉ Enable'}</button>
            <button class="icon-btn danger" data-mod-del="${escapeHtml(m._id)}">🗑 Delete</button>
          </div>
        </div>
      `).join('');
    }

    [tbody, cardsEl].forEach(scope => {
      if (!scope) return;
      scope.querySelectorAll('[data-mod-edit]').forEach(b => b.addEventListener('click', () => editModerator((b as HTMLElement).dataset.modEdit!)));
      scope.querySelectorAll('[data-mod-toggle]').forEach(b => b.addEventListener('click', () => {
        const id = (b as HTMLElement).dataset.modToggle!;
        const active = (b as HTMLElement).dataset.active === 'true';
        toggleModeratorActive(id, active);
      }));
      scope.querySelectorAll('[data-mod-del]').forEach(b => b.addEventListener('click', () => deleteModerator((b as HTMLElement).dataset.modDel!)));
    });
  } catch (err:any) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--red);">${escapeHtml(err.message)}</td></tr>`;
    if (cardsEl) cardsEl.innerHTML = `<p style="text-align:center; padding:24px; color:var(--red);">${escapeHtml(err.message)}</p>`;
  }
}

// ==========================================
// DEVELOPERS VIEW (Developed by Hack Eye)
// ==========================================
function loadDevelopers() {
  const yearEl = $('developers-year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
}

// ==========================================
// CONTACT US FORM
// ==========================================
function resetContactForm() {
  const form = $('contact-form') as HTMLFormElement | null;
  if (form) form.reset();
  const alertEl = $('contact-alert');
  if (alertEl) { alertEl.classList.add('hidden'); alertEl.textContent = ''; }
  const submit = $('contact-submit') as HTMLButtonElement | null;
  if (submit) { submit.disabled = false; submit.textContent = '✉ Send Message'; }
}

async function handleContactSubmit(e: Event) {
  e.preventDefault();
  const name = ($('cf-name') as HTMLInputElement).value.trim();
  const email = ($('cf-email') as HTMLInputElement).value.trim();
  const age = ($('cf-age') as HTMLInputElement).value;
  const subject = ($('cf-subject') as HTMLInputElement).value.trim();
  const message = ($('cf-message') as HTMLTextAreaElement).value.trim();
  const alertEl = $('contact-alert');
  const submit = $('contact-submit') as HTMLButtonElement | null;

  if (alertEl) { alertEl.classList.add('hidden'); alertEl.textContent = ''; }

  if (!name || !message) {
    if (alertEl) { alertEl.textContent = 'Name and message are required.'; alertEl.className = 'alert alert-error'; }
    return;
  }

  if (submit) { submit.disabled = true; submit.textContent = 'Sending…'; }

  try {
    const body: any = { name, message };
    if (email) body.email = email;
    if (age) body.age = parseInt(age, 10);
    if (subject) body.subject = subject;
    const res = await api('/api/contact', { method: 'POST', body: JSON.stringify(body) });
    if (alertEl) {
      alertEl.textContent = '✓ ' + (res.message || 'Thanks! Your message has been sent.');
      alertEl.className = 'alert alert-success';
    }
    const form = $('contact-form') as HTMLFormElement | null;
    if (form) form.reset();
  } catch (err:any) {
    if (alertEl) { alertEl.textContent = err.message || 'Something went wrong. Please try again.'; alertEl.className = 'alert alert-error'; }
  } finally {
    if (submit) { submit.disabled = false; submit.textContent = '✉ Send Message'; }
  }
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
      // Close any open nav menu after a nav click
      closeAllNavMenus();
      navigateTo(target.dataset.nav!);
      return;
    }

    // 3-dots nav menu button (open/close)
    const menuBtn = (e.target as HTMLElement).closest('.nav-menu-btn') as HTMLElement | null;
    if (menuBtn) {
      e.preventDefault();
      e.stopPropagation();
      const menu = menuBtn.closest('.nav-menu') as HTMLElement | null;
      if (menu) toggleNavMenu(menu);
      return;
    }

    // Outside click closes any open nav menu
    if (!(e.target as HTMLElement).closest('.nav-menu')) {
      closeAllNavMenus();
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
    // Next is hidden on the last question (Submit takes over), but guard anyway
    if (currentQuestionIndex < questions.length - 1) { currentQuestionIndex++; renderQuestion(); }
  });
  $('exam-submit')?.addEventListener('click', () => {
    // Submit button is only visible on the last question (toggled by renderQuestion).
    // submitExam() has its own double-click guard via `submitting` flag.
    submitExam(false);
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

  // Admin messages tab buttons
  $('msg-filter-all')?.addEventListener('click', () => { msgFilter = 'all'; loadAdminMessages(); });
  $('msg-filter-unread')?.addEventListener('click', () => { msgFilter = 'unread'; loadAdminMessages(); });
  $('msg-mark-all-read')?.addEventListener('click', markAllMessagesRead);

  // Admin moderators tab buttons
  $('admin-new-mod-btn')?.addEventListener('click', newModeratorForm);
  $('admin-mod-save')?.addEventListener('click', saveModerator);
  $('admin-mod-cancel')?.addEventListener('click', cancelModeratorForm);

  // Contact Us form
  $('contact-form')?.addEventListener('submit', handleContactSubmit);
  $('contact-reset')?.addEventListener('click', resetContactForm);

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
      refreshAdminNavVisibility();
      switchAdminTab('dashboard');
    } else if (stored.isModerator) {
      showView('view-9');
      refreshAdminNavVisibility();
      switchAdminTab(firstPermittedTab(stored.permissions));
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

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
let currentTest: any = null;            // the Test document selected by the user
let activeSubjectFilter: string = 'All'; // 'All' | 'Math' | 'MDCAT' | 'ECAT'
let questions: any[] = [];
let currentQuestionIndex = 0;
let userAnswers: Record<string, string> = {};
let examTimer: any = null;
let remainingTime = 3000;                // seconds; seeded from Test.durationSec
let examStartedAt: string | null = null; // ISO string sent to backend on submit
let lastResult: any = null;
let lastRankingTestId: string | null = null; // for "View Ranking" from results page

// ==========================================
// THEME TOGGLE
// ==========================================
const themeBtn = document.getElementById('theme-toggle');
const root = document.documentElement;
themeBtn?.addEventListener('click', () => {
  themeBtn.classList.toggle('dark-on');
  if (root.getAttribute('data-theme') === 'dark') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', 'dark');
  }
});

// ==========================================
// ROUTER
// ==========================================
let currentViewId = 'view-0';
let isTransitioning = false;
let viewStack: string[] = ['view-0'];

window.navigateBack = () => {
  if (viewStack.length > 1) {
    viewStack.pop();
    const target = viewStack[viewStack.length - 1];
    window.navigateTo(target, false);
  } else {
    window.navigateTo('view-1', false);
  }
};

window.navigateTo = (targetId: string, pushState = true) => {
  if (currentViewId === targetId || isTransitioning) return;
  const currentView = document.getElementById(currentViewId);
  const targetView = document.getElementById(targetId);
  if (!currentView || !targetView) return;
  isTransitioning = true;
  if (pushState) viewStack.push(targetId);
  currentView.style.opacity = '0';
  currentView.style.display = 'none';
  currentView.classList.remove('active-flex', 'active-block', 'visible');
  const displayType = targetView.getAttribute('data-display') || 'flex';
  targetView.style.opacity = '0';
  targetView.style.display = displayType;
  targetView.classList.add(`active-${displayType}`);
  void targetView.offsetWidth;
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  targetView.style.opacity = '1';
  targetView.classList.add('visible');
  currentViewId = targetId;
  onViewRendered(targetId);
  setTimeout(() => { isTransitioning = false; }, 400);
};

function onViewRendered(viewId: string) {
  if (viewId === 'view-1') loadDashboard();
  if (viewId === 'view-2') loadTestsList();
  if (viewId === 'view-3') loadTestDetail();
  if (viewId === 'view-5') showResults();
  if (viewId === 'view-7') loadProfile();
  if (viewId === 'view-8') loadTestRanking();
  if (viewId === 'view-6') loadAnnouncements();
  triggerMathRender();
}

function triggerMathRender() {
  if (typeof (window as any).renderMathInElement === 'function') {
    try {
      (window as any).renderMathInElement(document.body, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
        ]
      });
    } catch (e) { console.warn('KaTeX skipped', e); }
  }
}

window.playSound = (type: string) => {
  console.log(`🎵 Sound: [${type}]`);
};

// ==========================================
// AUTH
// ==========================================
window.login = async () => {
  const email = (document.getElementById('login-email') as HTMLInputElement).value;
  const password = (document.getElementById('login-password') as HTMLInputElement).value;
  const errEl = document.getElementById('login-error');
  errEl!.style.display = 'none';
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok) {
      currentToken = data.token;
      currentUser = data.user;
      localStorage.setItem('pg_token', data.token);
      localStorage.setItem('pg_user', JSON.stringify(data.user));
      window.navigateTo('view-1');
    } else {
      errEl!.style.display = 'block';
      errEl!.innerText = data.message || 'Invalid credentials';
    }
  } catch (e) {
    errEl!.style.display = 'block';
    errEl!.innerText = 'Server error. Try again.';
  }
};

window.register = async () => {
  const name = (document.getElementById('reg-name') as HTMLInputElement).value;
  const email = (document.getElementById('reg-email') as HTMLInputElement).value;
  const password = (document.getElementById('reg-password') as HTMLInputElement).value;
  const errEl = document.getElementById('reg-error');
  errEl!.style.display = 'none';
  try {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (res.ok) {
      currentToken = data.token;
      currentUser = data.user;
      localStorage.setItem('pg_token', data.token);
      localStorage.setItem('pg_user', JSON.stringify(data.user));
      window.navigateTo('view-1');
    } else {
      errEl!.style.display = 'block';
      errEl!.innerText = data.message || 'Registration failed';
    }
  } catch (e) {
    errEl!.style.display = 'block';
    errEl!.innerText = 'Server error. Try again.';
  }
};

window.showRegister = () => {
  document.getElementById('login-box')!.style.display = 'none';
  document.getElementById('register-box')!.style.display = 'block';
};

window.showLogin = () => {
  document.getElementById('register-box')!.style.display = 'none';
  document.getElementById('login-box')!.style.display = 'block';
};

window.logout = () => {
  localStorage.removeItem('pg_token');
  localStorage.removeItem('pg_user');
  currentToken = null;
  currentUser = null;
  window.navigateTo('view-0');
};

// Auto-login if token exists
if (currentToken) {
  const savedUser = localStorage.getItem('pg_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    window.navigateTo('view-1');
  }
}

// ==========================================
// DASHBOARD
// ==========================================
function loadDashboard() {
  if (!currentUser) return;
  const nameEl = document.getElementById('dashboard-name');
  if (nameEl) nameEl.innerText = `Welcome Back, ${currentUser.name.split(' ')[0]}.`;
}

// ==========================================
// TESTS LIST
// ==========================================
const SUBJECTS = ['Math', 'MDCAT', 'ECAT'] as const;
const SUBJECT_COLORS: Record<string, string> = {
  Math: '#3b82f6',
  MDCAT: '#10b981',
  ECAT: '#f59e0b',
};

async function loadTestsList() {
  // Render filter pills once
  renderSubjectPills();
  await fetchAndRenderTests();
}

function renderSubjectPills() {
  const container = document.getElementById('subject-filter-pills');
  if (!container) return;
  const pills = ['All', ...SUBJECTS];
  container.innerHTML = pills.map(s => {
    const isActive = s === activeSubjectFilter;
    const color = s === 'All' ? '' : `border-color:${SUBJECT_COLORS[s]};color:${SUBJECT_COLORS[s]};`;
    return `<button class="nav-pill spring-hover ${isActive ? 'pill-primary' : 'glass-panel'}"
      style="cursor:pointer;font-size:0.9rem;padding:0.45rem 1.1rem;${isActive ? '' : color}"
      onclick="window.filterTests('${s}')">${s}</button>`;
  }).join('');
}

window.filterTests = (subject: string) => {
  activeSubjectFilter = subject;
  renderSubjectPills();
  fetchAndRenderTests();
};

async function fetchAndRenderTests() {
  const grid = document.getElementById('tests-grid');
  if (!grid) return;
  grid.innerHTML = `<p style="color:var(--text-muted);text-align:center;grid-column:1/-1;">Loading tests...</p>`;

  try {
    const url = activeSubjectFilter === 'All'
      ? `${API}/api/exam/tests`
      : `${API}/api/exam/tests?subject=${encodeURIComponent(activeSubjectFilter)}`;
    const res = await fetch(url);
    const tests = await res.json();

    if (!tests.length) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--text-muted);">
        <p>No tests available${activeSubjectFilter !== 'All' ? ` for ${activeSubjectFilter}` : ''} yet.</p>
        <p style="font-size:0.85rem;margin-top:0.5rem;">Please check back later or contact the admin.</p>
      </div>`;
      return;
    }

    grid.innerHTML = tests.map((t: any) => {
      const color = SUBJECT_COLORS[t.subject] || '#888';
      const durationMin = Math.round(t.durationSec / 60);
      return `<div class="level-card glass-panel spring-hover unlocked"
        style="cursor:pointer;border-top:4px solid ${color};"
        onclick="window.openTestDetail('${t._id}')">
        <div style="display:inline-block;padding:0.3rem 0.8rem;border-radius:999px;font-size:0.7rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;background:${color};color:white;margin-bottom:0.75rem;">${t.subject}</div>
        <h3 style="margin:0 0 0.5rem;font-size:1.3rem;">${escapeHtml(t.name)}</h3>
        <p style="margin:0;color:var(--text-muted);font-size:0.9rem;">${t.totalQuestions || 0} questions · ${durationMin} min</p>
      </div>`;
    }).join('');
  } catch (e) {
    grid.innerHTML = `<p style="color:#e74c3c;text-align:center;grid-column:1/-1;">Failed to load tests. Please try again.</p>`;
  }
}

window.openTestDetail = (testId: string) => {
  currentTest = { _id: testId };
  window.navigateTo('view-3');
};

// ==========================================
// TEST DETAIL
// ==========================================
async function loadTestDetail() {
  if (!currentTest?._id) {
    window.navigateTo('view-2');
    return;
  }
  try {
    // Fetch test metadata + check for an in-progress session in parallel
    const [testRes, sessionRes] = await Promise.all([
      fetch(`${API}/api/exam/tests/${currentTest._id}`),
      currentToken
        ? fetch(`${API}/api/exam/session/${currentTest._id}`, {
          headers: { 'Authorization': `Bearer ${currentToken}` }
        }).catch(() => null)
        : Promise.resolve(null)
    ]);

    const test = await testRes.json();
    currentTest = test;

    document.getElementById('test-detail-subject')!.innerText = test.subject || '';
    document.getElementById('test-detail-name')!.innerText = test.name || 'Test';
    document.getElementById('test-detail-duration')!.innerText = `${Math.round(test.durationSec / 60)} min`;
    document.getElementById('test-detail-questions')!.innerText = String(test.totalQuestions || 0);

    // Attempt count (from ranking endpoint — public)
    try {
      const rankRes = await fetch(`${API}/api/exam/tests/${test._id}/ranking`);
      const rankData = await rankRes.json();
      document.getElementById('test-detail-attempts')!.innerText = String(rankData.ranking?.length || 0);
    } catch {
      document.getElementById('test-detail-attempts')!.innerText = '0';
    }

    // Resume-note visibility
    const noteEl = document.getElementById('test-detail-resume-note');
    if (noteEl) {
      let hasSession = false;
      if (sessionRes && (sessionRes as any).ok) {
        const session = await (sessionRes as any).json();
        hasSession = !!(session && session._id);
      }
      noteEl.style.display = hasSession ? 'block' : 'none';
    }
  } catch (e) {
    alert('Could not load test details. Please try again.');
    window.navigateTo('view-2');
  }
}

window.startTestFromDetail = async () => {
  if (!currentTest?._id) return;
  // Check for an existing in-progress session
  try {
    const res = await fetch(`${API}/api/exam/session/${currentTest._id}`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const session = await res.json();
    if (session && session._id) {
      window.showResumeModal();
      return;
    }
  } catch (e) { /* fall through to fresh start */ }
  startFreshExam();
};

window.viewTestRanking = () => {
  if (!currentTest?._id) return;
  lastRankingTestId = currentTest._id;
  window.navigateTo('view-8');
};

// ==========================================
// EXAM ENGINE
// ==========================================
async function startFreshExam() {
  if (!currentTest?._id) return;
  currentQuestionIndex = 0;
  userAnswers = {};

  try {
    const res = await fetch(`${API}/api/exam/tests/${currentTest._id}/questions`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    questions = data.questions || [];
    if (!questions.length) {
      alert('No questions found for this test. Please contact admin.');
      return;
    }
    // Seed timer from the Test document, fall back to 3000s.
    remainingTime = data.test?.durationSec || currentTest.durationSec || 3000;
    examStartedAt = new Date().toISOString();
    startTimer();
    window.navigateTo('view-4');
    renderQuestion();
  } catch (e) {
    alert('Error loading questions. Try again.');
  }
}

async function resumeExam() {
  if (!currentTest?._id) return;
  try {
    const [qRes, sRes] = await Promise.all([
      fetch(`${API}/api/exam/tests/${currentTest._id}/questions`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      }),
      fetch(`${API}/api/exam/session/${currentTest._id}`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      })
    ]);
    const qData = await qRes.json();
    questions = qData.questions || [];
    const session = await sRes.json();
    if (session) {
      currentQuestionIndex = session.currentIndex || 0;
      userAnswers = session.answers || {};
      remainingTime = session.remainingTime || qData.test?.durationSec || 3000;
      examStartedAt = session.startedAt || new Date().toISOString();
    }
    startTimer();
    window.navigateTo('view-4');
    renderQuestion();
  } catch (e) {
    startFreshExam();
  }
}

function startTimer() {
  clearInterval(examTimer);
  updateTimerDisplay();
  examTimer = setInterval(() => {
    remainingTime--;
    updateTimerDisplay();
    if (remainingTime <= 0) {
      clearInterval(examTimer);
      submitExam();
    }
    if (remainingTime % 30 === 0) autoSaveSession();
  }, 1000);
}

function updateTimerDisplay() {
  const mins = Math.floor(remainingTime / 60).toString().padStart(2, '0');
  const secs = (remainingTime % 60).toString().padStart(2, '0');
  const el = document.getElementById('countdown');
  if (el) el.innerText = `${mins}:${secs}`;
}

async function autoSaveSession() {
  if (!currentToken || !currentTest?._id) return;
  try {
    await fetch(`${API}/api/exam/session/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
      body: JSON.stringify({
        testId: currentTest._id,
        currentIndex: currentQuestionIndex,
        answers: userAnswers,
        remainingTime,
        startedAt: examStartedAt
      })
    });
  } catch (e) { }
}

function renderQuestion() {
  if (!questions.length) return;
  const q = questions[currentQuestionIndex];
  const total = questions.length;
  const answered = userAnswers[q._id];

  // Progress
  const progEl = document.getElementById('exam-progress-text');
  if (progEl) progEl.innerText = `Question ${currentQuestionIndex + 1} / ${total}`;

  // Tabs (subject + test name)
  const tabsEl = document.getElementById('exam-tabs');
  if (tabsEl && currentTest) {
    tabsEl.innerHTML = `<div class="tab active">${escapeHtml(currentTest.subject || '')} — ${escapeHtml(currentTest.name || '')}</div>`;
  }

  // Passage panel (optional)
  const passagePanel = document.getElementById('exam-passage-panel') as HTMLElement;
  const passageText = document.getElementById('passage-text');
  if (passagePanel && passageText) {
    if (q.passage && q.passage.trim()) {
      passageText.innerHTML = escapeHtml(q.passage);
      passagePanel.style.display = 'block';
    } else {
      passagePanel.style.display = 'none';
    }
  }

  // Buttons
  const btnNext = document.getElementById('btn-next-question') as HTMLButtonElement;
  const btnPrev = document.getElementById('btn-prev-question') as HTMLButtonElement;
  if (btnPrev) btnPrev.style.visibility = currentQuestionIndex > 0 ? 'visible' : 'hidden';
  if (btnNext) {
    btnNext.innerText = currentQuestionIndex === total - 1 ? 'Submit Exam' : 'Next';
  }

  // Question & Options
  const container = document.getElementById('quiz-question-container')!;
  const letters = ['A', 'B', 'C', 'D'];
  const opts = [q.options.A, q.options.B, q.options.C, q.options.D];

  let optionsHtml = opts.map((opt: string, idx: number) => {
    const letter = letters[idx];
    let extraClass = '';
    if (answered) {
      if (letter === q.correct) extraClass = 'correct'; // always green the right answer
      else if (letter === answered) extraClass = 'wrong'; // red only if user picked wrong
    }
    const disabled = answered ? 'style="pointer-events:none;"' : '';
    return `<button class="option-btn spring-hover ${extraClass}"
      onclick="window.selectAnswer(this, '${letter}')" ${disabled}>
      <span class="opt-letter">${letter}</span>
      <span class="opt-text">${escapeHtml(opt)}</span>
    </button>`;
  }).join('');

  container.innerHTML = `
    <h3 class="question-text">${escapeHtml(q.question)}</h3>
    ${q.explanation && answered ? `<div class="glass-panel" style="padding:1rem;margin-top:1rem;font-size:0.9rem;color:var(--text-muted);"><strong>Explanation:</strong> ${escapeHtml(q.explanation)}</div>` : ''}
    <div class="options-container">${optionsHtml}</div>
  `;

  triggerMathRender();
}

window.selectAnswer = (button: HTMLElement, letter: string) => {
  const q = questions[currentQuestionIndex];
  if (userAnswers[q._id]) return;
  userAnswers[q._id] = letter;
  if (letter === q.correct) {
    window.playSound('correct');
  } else {
    window.playSound('wrong');
  }
  renderQuestion();
};

window.nextQuestion = () => {
  if (currentQuestionIndex < questions.length - 1) {
    currentQuestionIndex++;
    renderQuestion();
  } else {
    submitExam();
  }
};

window.previousQuestion = () => {
  if (currentQuestionIndex > 0) {
    currentQuestionIndex--;
    renderQuestion();
  }
};

async function submitExam() {
  clearInterval(examTimer);
  await autoSaveSession();

  try {
    const res = await fetch(`${API}/api/exam/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
      body: JSON.stringify({
        testId: currentTest?._id,
        answers: userAnswers,
        startedAt: examStartedAt
      })
    });
    const data = await res.json();
    if (res.ok) {
      lastResult = data;
      lastRankingTestId = currentTest?._id;
      window.navigateTo('view-5');
    } else {
      alert(data.message || 'Submit error');
    }
  } catch (e) {
    alert('Network error during submit');
  }
}

// ==========================================
// RESUME MODAL
// ==========================================
window.showResumeModal = () => {
  const modal = document.getElementById('resume-modal');
  if (!modal) return;
  modal.classList.add('active');
  setTimeout(() => modal.classList.add('visible'), 10);
};

window.hideResumeModal = () => {
  const modal = document.getElementById('resume-modal');
  if (!modal) return;
  modal.classList.remove('visible');
  setTimeout(() => modal.classList.remove('active'), 300);
};

window.acceptResumeModal = () => {
  window.hideResumeModal();
  resumeExam();
};

window.restartExam = async () => {
  window.hideResumeModal();
  if (!currentTest?._id) return;
  try {
    await fetch(`${API}/api/exam/session/${currentTest._id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
  } catch (e) { }
  startFreshExam();
};

window.quitExam = () => {
  window.confirmAction(
    '⚠️ Quit Test?\n\nYour progress will be SAVED. You can resume later from where you left off.',
    async () => {
      await autoSaveSession();
      clearInterval(examTimer);
      viewStack = viewStack.filter(v => v !== 'view-4');
      window.navigateTo('view-3');
    },
    'Save & Quit',
    'Continue Test'
  );
};

// ==========================================
// RESULTS
// ==========================================
function showResults() {
  if (!lastResult) return;
  const { correctCount, totalQuestions, percentage, timeTakenSeconds, test } = lastResult;

  const nameEl = document.getElementById('results-test-name');
  if (nameEl) nameEl.innerText = test?.name ? `${test.subject} — ${test.name}` : 'Test';

  const correctEl = document.getElementById('results-correct');
  if (correctEl) correctEl.innerText = `${correctCount}/${totalQuestions}`;

  const timeEl = document.getElementById('results-time');
  if (timeEl) {
    timeEl.innerText = timeTakenSeconds != null ? formatDuration(timeTakenSeconds) : '—';
  }

  const scoreEl = document.getElementById('score-number');
  const circleProgress = document.querySelector('.circle-progress');
  if (circleProgress) {
    setTimeout(() => {
      circleProgress.setAttribute('stroke-dasharray', `${percentage}, 100`);
    }, 100);
  }
  if (scoreEl) {
    let cur = 0;
    const interval = setInterval(() => {
      cur++;
      scoreEl.innerText = cur.toString();
      if (cur >= percentage) clearInterval(interval);
    }, 20);
  }

  // Fetch this user's rank on the test
  fetchMyResultRank();
}

async function fetchMyResultRank() {
  const testId = lastResult?.test?._id || lastRankingTestId;
  if (!testId) return;
  const rankEl = document.getElementById('my-result-rank');
  const shiftEl = document.getElementById('shift-label');
  try {
    const res = await fetch(`${API}/api/exam/tests/${testId}/ranking`);
    const data = await res.json();
    const myId = currentUser?.id || currentUser?._id;
    const idx = data.ranking.findIndex((r: any) => String(r.userId) === String(myId));
    if (rankEl) rankEl.innerText = idx >= 0 ? `#${idx + 1}` : '#--';
    if (shiftEl && idx >= 0) {
      const total = data.ranking.length;
      shiftEl.innerText = `out of ${total} attempt${total !== 1 ? 's' : ''}`;
    }
  } catch (e) {
    if (rankEl) rankEl.innerText = '#--';
  }
}

// ==========================================
// PROFILE
// ==========================================
async function loadProfile() {
  if (!currentToken) return;
  try {
    const res = await fetch(`${API}/api/exam/profile`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    const user = data.user;
    const attempts = data.attempts || [];

    const nameEl = document.getElementById('profile-name');
    const avatarEl = document.getElementById('profile-avatar');
    const summaryEl = document.getElementById('profile-summary');
    const histEl = document.getElementById('attempt-history');

    if (nameEl) nameEl.innerText = user.name;
    if (avatarEl) avatarEl.innerText = user.name.substring(0, 2).toUpperCase();
    if (summaryEl) summaryEl.innerText = `${attempts.length} attempt${attempts.length !== 1 ? 's' : ''}`;

    if (histEl) {
      if (!attempts.length) {
        histEl.innerHTML = '<li>No attempts yet. Take a test from the Tests page.</li>';
      } else {
        histEl.innerHTML = attempts.map((a: any) => {
          const testName = a.test?.name || 'Unknown test';
          const subject = a.test?.subject || '';
          const pct = a.percentage ?? 0;
          const correct = a.correctCount ?? 0;
          const total = a.totalQuestions ?? 0;
          const date = a.submittedAt || a.completedAt;
          const dateStr = date ? new Date(date).toLocaleDateString() : '';
          const status = pct >= 60 ? 'pass' : 'fail';
          const statusLabel = pct >= 60 ? 'Passed' : 'Failed';
          const timeStr = a.timeTakenSeconds != null ? ` · ${formatDuration(a.timeTakenSeconds)}` : '';
          return `<li>
            <span class="status ${status}">${statusLabel}</span>
            ${escapeHtml(subject ? `${subject} — ` : '')}${escapeHtml(testName)} — ${correct}/${total} (${pct}%)${timeStr}
            <small style="display:block;margin-top:0.25rem;color:var(--text-muted);">${dateStr}</small>
          </li>`;
        }).join('');
      }
    }
  } catch (e) { }
}

// ==========================================
// PER-TEST RANKING
// ==========================================
async function loadTestRanking() {
  const testId = lastRankingTestId || currentTest?._id;
  if (!testId) {
    window.navigateTo('view-2');
    return;
  }

  const nameEl = document.getElementById('ranking-test-name');
  const subjectEl = document.getElementById('ranking-test-subject');
  const top3El = document.getElementById('leaderboard-top3');
  const listEl = document.getElementById('leaderboard-list');
  const myRankEl = document.getElementById('my-rank-display');
  const emptyEl = document.getElementById('ranking-empty');

  if (top3El) top3El.innerHTML = '';
  if (listEl) listEl.innerHTML = '';
  if (myRankEl) myRankEl.innerText = '#--';
  if (emptyEl) emptyEl.style.display = 'none';

  try {
    const res = await fetch(`${API}/api/exam/tests/${testId}/ranking`);
    const data = await res.json();
    const test = data.test || {};
    const ranking: any[] = data.ranking || [];

    if (nameEl) nameEl.innerText = test.name || 'Ranking';
    if (subjectEl) subjectEl.innerText = test.subject || '';

    if (!ranking.length) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    const myId = currentUser?.id || currentUser?._id;
    const myRankIdx = myId ? ranking.findIndex(r => String(r.userId) === String(myId)) : -1;
    if (myRankEl) myRankEl.innerText = myRankIdx >= 0 ? `#${myRankIdx + 1}` : 'N/A';

    // Top 3 — visual: 2nd left, 1st center (bigger), 3rd right
    const top3 = ranking.slice(0, 3);
    if (top3El) {
      const displayOrder = [
        { dataIdx: 1, glow: 'glow-silver', rank: 'silver', num: '2', big: false },
        { dataIdx: 0, glow: 'glow-gold',   rank: 'gold',   num: '1', big: true  },
        { dataIdx: 2, glow: 'glow-bronze', rank: 'bronze', num: '3', big: false },
      ];
      top3El.innerHTML = displayOrder.map(({ dataIdx, glow, rank, num, big }) => {
        const u = top3[dataIdx];
        if (!u) return '';
        const isYou = myId && String(u.userId) === String(myId);
        const score = `${u.correctCount}/${u.totalQuestions}`;
        const time = u.timeTakenSeconds != null ? ` · ${formatDuration(u.timeTakenSeconds)}` : '';
        return `<div class="lb-item glass-panel ${glow} ${big ? 'lb-first' : ''}">
          <div class="lb-rank ${rank}">${num}</div>
          <div class="lb-info">
            <h4>${escapeHtml(u.name)}${isYou ? ' (You)' : ''}</h4>
            <p>${score}${time}</p>
          </div>
        </div>`;
      }).join('');
    }

    // Remaining rows
    if (listEl) {
      listEl.innerHTML = ranking.slice(3).map((u, idx) => {
        const rank = idx + 4;
        const isYou = myId && String(u.userId) === String(myId);
        const time = u.timeTakenSeconds != null ? ` · ${formatDuration(u.timeTakenSeconds)}` : '';
        return `<div class="lb-row glass-panel spring-hover ${isYou ? 'my-row' : ''}">
          <div class="row-rank" style="${isYou ? 'color:#d4af37' : ''}">${rank}</div>
          <div class="row-name">${escapeHtml(u.name)}${isYou ? ' (You)' : ''}</div>
          <div class="row-score">${u.correctCount}/${u.totalQuestions}${time}</div>
        </div>`;
      }).join('');
    }
  } catch (e) {
    if (emptyEl) {
      emptyEl.style.display = 'block';
      emptyEl.innerText = 'Failed to load ranking. Please try again.';
    }
  }
}

// ==========================================
// ANNOUNCEMENTS
// ==========================================
async function loadAnnouncements() {
  try {
    const res = await fetch(`${API}/api/exam/announcements`);
    const data = await res.json();
    const listEl = document.getElementById('announcement-list');
    if (listEl) {
      listEl.innerHTML = data.length ? data.map((a: any) => `
        <div class="glass-panel ann-card spring-hover">
          <div class="ann-img-placeholder">${a.emoji || '📢'}</div>
          <div class="ann-content">
            <h4>${escapeHtml(a.title)}</h4>
            <p>${escapeHtml(a.description)}</p>
            <small>${new Date(a.createdAt).toLocaleDateString()}</small>
          </div>
        </div>
      `).join('') : '<p style="color:var(--text-muted);text-align:center;padding:2rem;">No announcements yet.</p>';
    }
  } catch (e) { }
}

// ==========================================
// ADMIN PORTAL
// ==========================================
const ADMIN_KEY = 'pg_admin_token';
let adminToken: string | null = localStorage.getItem(ADMIN_KEY);

window.adminLogin = async () => {
  const email = (document.getElementById('admin-email') as HTMLInputElement).value;
  const password = (document.getElementById('admin-password') as HTMLInputElement).value;
  const errEl = document.getElementById('admin-error');
  errEl!.style.display = 'none';
  try {
    const res = await fetch(`${API}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok) {
      adminToken = data.token;
      localStorage.setItem(ADMIN_KEY, data.token);
      window.navigateTo('view-admin-panel');
      loadAdminData();
    } else {
      errEl!.style.display = 'block';
      errEl!.innerText = data.message || 'Invalid admin credentials';
    }
  } catch (e) {
    errEl!.style.display = 'block';
    errEl!.innerText = 'Server error';
  }
};

window.switchAdminTab = (tabId: string) => {
  document.querySelectorAll('.admin-nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`[onclick="window.switchAdminTab('${tabId}')"]`)?.classList.add('active');
  document.querySelectorAll('.admin-tab-content').forEach(el => el.classList.remove('active'));
  document.getElementById(`admin-tab-${tabId}`)?.classList.add('active');
  // Lazy-load tab data when activated
  if (tabId === 'tests') loadAdminTests();
  if (tabId === 'users') loadAdminUsers();
  if (tabId === 'announcements') loadAdminAnnouncements();
  if (tabId === 'dashboard') loadAdminStats();
};

async function loadAdminData() {
  loadAdminStats();
  loadAdminTests();
  loadAdminUsers();
  loadAdminAnnouncements();
}

async function loadAdminStats() {
  try {
    const res = await fetch(`${API}/api/admin/stats`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
    const data = await res.json();
    document.getElementById('stat-users')!.innerText = String(data.totalUsers || 0);
    document.getElementById('stat-tests')!.innerText = String(data.totalTests || 0);
    document.getElementById('stat-attempts')!.innerText = String(data.totalAttempts || 0);
    document.getElementById('stat-questions')!.innerText = String(data.totalQuestions || 0);
  } catch (e) { }
}

// Populate a <select> with the subject list (or fetch from /admin/subjects)
async function fetchSubjects(): Promise<string[]> {
  try {
    const res = await fetch(`${API}/api/admin/subjects`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
    const data = await res.json();
    return data.subjects || [...SUBJECTS];
  } catch {
    return [...SUBJECTS];
  }
}

async function loadAdminTests() {
  const tbody = document.getElementById('admin-tests-tbody')!;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Loading...</td></tr>';

  try {
    const [testsRes, subjects] = await Promise.all([
      fetch(`${API}/api/admin/tests`, { headers: { 'Authorization': `Bearer ${adminToken}` } }),
      fetchSubjects()
    ]);
    const tests = await testsRes.json();

    // Populate the upload + download dropdowns and create-test subject select
    const uploadSelect = document.getElementById('admin-upload-test') as HTMLSelectElement | null;
    const downloadSelect = document.getElementById('admin-download-test') as HTMLSelectElement | null;
    const createSelect = document.getElementById('admin-create-subject') as HTMLSelectElement | null;
    const optsHtml = tests.length
      ? tests.map((t: any) => `<option value="${t._id}">${escapeHtml(t.subject)} — ${escapeHtml(t.name)}</option>`).join('')
      : `<option value="">(no tests yet)</option>`;
    if (uploadSelect) uploadSelect.innerHTML = optsHtml;
    if (downloadSelect) downloadSelect.innerHTML = optsHtml;
    if (createSelect) {
      createSelect.innerHTML = subjects.map((s: string) => `<option value="${s}">${s}</option>`).join('');
    }

    if (!tests.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No tests yet. Create one below.</td></tr>';
      return;
    }

    tbody.innerHTML = tests.map((t: any) => {
      const durationMin = Math.round(t.durationSec / 60);
      const status = t.active
        ? `<span style="color:#2ecc71;font-weight:700;">Active</span>`
        : `<span style="color:var(--text-muted);font-weight:700;">Hidden</span>`;
      return `<tr>
        <td><strong>${escapeHtml(t.name)}</strong></td>
        <td>${escapeHtml(t.subject)}</td>
        <td>${durationMin} min</td>
        <td>${t.totalQuestions || 0}</td>
        <td>${status}</td>
        <td style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <button class="action-btn" onclick="window.toggleTestActive('${t._id}', ${!t.active})" style="background:#3b82f6;color:white;">
            ${t.active ? 'Hide' : 'Show'}
          </button>
          <button class="action-btn" onclick="window.editTestDuration('${t._id}', ${t.durationSec})" style="background:#f39c12;color:white;">
            Duration
          </button>
          <button class="action-btn delete" onclick="window.deleteTest('${t._id}', '${escapeHtml(t.name).replace(/'/g, "\\'")}')">
            Delete
          </button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Error loading tests</td></tr>';
  }
}

window.createTest = async (form: HTMLFormElement) => {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const statusEl = document.getElementById('create-test-status')!;
  statusEl.style.display = 'block';
  statusEl.style.color = 'var(--text-muted)';
  statusEl.innerText = 'Creating...';

  try {
    const res = await fetch(`${API}/api/admin/tests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ ...payload, durationSec: Number(payload.durationSec) })
    });
    const data = await res.json();
    if (res.ok) {
      statusEl.style.color = '#2ecc71';
      statusEl.innerText = `✅ Test '${data.name}' created.`;
      form.reset();
      loadAdminTests();
      loadAdminStats();
    } else {
      statusEl.style.color = 'red';
      statusEl.innerText = data.message || 'Create failed';
    }
  } catch (e) {
    statusEl.style.color = 'red';
    statusEl.innerText = 'Server error';
  }
};

window.toggleTestActive = async (id: string, active: boolean) => {
  try {
    await fetch(`${API}/api/admin/tests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ active })
    });
    loadAdminTests();
  } catch (e) { }
};

window.editTestDuration = (id: string, currentSec: number) => {
  const input = prompt(`Enter new duration in seconds (current: ${currentSec} = ${Math.round(currentSec / 60)} min). Min 60.`, String(currentSec));
  if (input === null) return;
  const n = Number(input);
  if (!Number.isFinite(n) || n < 60) {
    alert('Duration must be a number >= 60 seconds.');
    return;
  }
  window.updateTestDuration(id, n);
};

window.updateTestDuration = async (id: string, durationSec: number) => {
  try {
    await fetch(`${API}/api/admin/tests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ durationSec })
    });
    loadAdminTests();
  } catch (e) { }
};

window.deleteTest = (id: string, name: string) => {
  window.confirmAction(
    `Delete test "${name}"?\n\nThis will permanently delete the test AND all its questions, attempts, and sessions. This cannot be undone.`,
    async () => {
      try {
        await fetch(`${API}/api/admin/tests/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        loadAdminTests();
        loadAdminStats();
      } catch (e) { }
    }
  );
};

window.loadCsvFile = (input: HTMLInputElement) => {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const ta = document.getElementById('admin-csv-textarea') as HTMLTextAreaElement | null;
    if (ta) ta.value = String(reader.result || '');
  };
  reader.readAsText(file);
};

window.uploadCsv = async (form: HTMLFormElement) => {
  const formData = new FormData(form);
  const testId = formData.get('testId');
  const csv = formData.get('csv') as string;
  const statusEl = document.getElementById('upload-status')!;
  statusEl.style.display = 'none';

  if (!testId) {
    statusEl.style.display = 'block';
    statusEl.style.color = 'red';
    statusEl.innerText = 'Please select a test first.';
    return;
  }
  if (!csv || !csv.trim()) {
    statusEl.style.display = 'block';
    statusEl.style.color = 'red';
    statusEl.innerText = 'CSV content is empty.';
    return;
  }

  statusEl.style.display = 'block';
  statusEl.style.color = 'var(--text-muted)';
  statusEl.innerText = 'Uploading...';

  try {
    const res = await fetch(`${API}/api/admin/tests/${testId}/questions/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ csv })
    });
    const data = await res.json();
    if (res.ok) {
      statusEl.style.color = '#2ecc71';
      statusEl.innerText = `✅ ${data.count} questions uploaded.`;
      form.reset();
      loadAdminTests();
      loadAdminStats();
    } else {
      statusEl.style.color = 'red';
      statusEl.innerText = data.message || 'Upload failed';
    }
  } catch (e) {
    statusEl.style.color = 'red';
    statusEl.innerText = 'Server error during upload';
  }
};

window.downloadRankingsCsv = async () => {
  const select = document.getElementById('admin-download-test') as HTMLSelectElement | null;
  const testId = select?.value;
  if (!testId) {
    alert('Please select a test first.');
    return;
  }
  try {
    const res = await fetch(`${API}/api/admin/tests/${testId}/rankings.csv`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (!res.ok) {
      alert('Download failed.');
      return;
    }
    const blob = await res.blob();
    // Pull filename from Content-Disposition if present
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="?([^";]+)"?/);
    const filename = m ? m[1] : 'rankings.csv';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('Network error during download.');
  }
};

async function loadAdminUsers() {
  const tbody = document.getElementById('admin-users-tbody')!;
  try {
    const res = await fetch(`${API}/api/admin/users`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
    const data = await res.json();
    tbody.innerHTML = data.map((u: any) => `
      <tr>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
        <td>${u.totalAttempts || 0}</td>
        <td><button class="action-btn delete" onclick="window.deleteUser('${u._id}')">Delete</button></td>
      </tr>
    `).join('') || '<tr><td colspan="5" style="text-align:center">No users yet</td></tr>';
  } catch (e) { }
}

async function loadAdminAnnouncements() {
  const tbody = document.getElementById('admin-ann-tbody')!;
  try {
    const res = await fetch(`${API}/api/admin/announcements`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
    const data = await res.json();
    tbody.innerHTML = data.map((a: any) => `
      <tr>
        <td>${new Date(a.createdAt).toLocaleDateString()}</td>
        <td>${escapeHtml(a.title)}</td>
        <td><button class="action-btn delete" onclick="window.deleteAnnouncement('${a._id}')">Delete</button></td>
      </tr>
    `).join('') || '<tr><td colspan="3" style="text-align:center">No announcements</td></tr>';
  } catch (e) { }
}

window.submitAnnouncement = async (form: HTMLFormElement) => {
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  try {
    await fetch(`${API}/api/admin/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(payload)
    });
    form.reset();
    loadAdminAnnouncements();
  } catch (e) { }
};

window.deleteUser = (id: string) => {
  window.confirmAction('Are you sure you want to permanently delete this user (and all their attempts/sessions)?', async () => {
    try {
      await fetch(`${API}/api/admin/users/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${adminToken}` } });
      loadAdminUsers();
      loadAdminStats();
    } catch (e) { }
  });
};

window.deleteAnnouncement = (id: string) => {
  window.confirmAction('Delete this announcement?', async () => {
    try {
      await fetch(`${API}/api/admin/announcements/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${adminToken}` } });
      loadAdminAnnouncements();
    } catch (e) { }
  });
};

// Confirm Modal
let pendingConfirmCallback: (() => void) | null = null;
window.confirmAction = (message: string, callback: () => void, confirmLabel = 'Confirm Delete', cancelLabel = 'Cancel') => {
  const modal = document.getElementById('custom-confirm-modal');
  const msgEl = document.getElementById('confirm-modal-message');
  const confirmBtn = document.getElementById('confirm-modal-btn')!;
  const cancelBtn = document.getElementById('cancel-modal-btn')!;
  if (!modal || !msgEl) return;
  msgEl.innerText = message;
  confirmBtn.innerText = confirmLabel;
  cancelBtn.innerText = cancelLabel;
  if (confirmLabel === 'Save & Quit') {
    confirmBtn.style.background = '#e67e22';
  } else {
    confirmBtn.style.background = '#e74c3c';
  }
  pendingConfirmCallback = callback;
  modal.classList.add('visible');
  confirmBtn.onclick = () => {
    if (pendingConfirmCallback) pendingConfirmCallback();
    window.closeConfirmModal();
  };
};
window.closeConfirmModal = () => {
  document.getElementById('custom-confirm-modal')?.classList.remove('visible');
  pendingConfirmCallback = null;
};

// ==========================================
// HELPERS
// ==========================================
function escapeHtml(s: any): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

// ==========================================
// TYPE DECLARATIONS
// ==========================================
declare global {
  interface Window {
    navigateTo: (targetId: string, pushHistory?: boolean) => void;
    navigateBack: () => void;
    login: () => void;
    register: () => void;
    showRegister: () => void;
    showLogin: () => void;
    logout: () => void;
    filterTests: (subject: string) => void;
    openTestDetail: (testId: string) => void;
    startTestFromDetail: () => void;
    viewTestRanking: () => void;
    showResumeModal: () => void;
    hideResumeModal: () => void;
    acceptResumeModal: () => void;
    restartExam: () => void;
    selectAnswer: (button: HTMLElement, letter: string) => void;
    nextQuestion: () => void;
    previousQuestion: () => void;
    playSound: (type: string) => void;
    quitExam: () => void;
    adminLogin: () => void;
    switchAdminTab: (tabId: string) => void;
    createTest: (form: HTMLFormElement) => void;
    toggleTestActive: (id: string, active: boolean) => void;
    editTestDuration: (id: string, currentSec: number) => void;
    updateTestDuration: (id: string, durationSec: number) => void;
    deleteTest: (id: string, name: string) => void;
    loadCsvFile: (input: HTMLInputElement) => void;
    uploadCsv: (form: HTMLFormElement) => void;
    downloadRankingsCsv: () => void;
    submitAnnouncement: (form: HTMLFormElement) => void;
    deleteUser: (id: string) => void;
    deleteAnnouncement: (id: string) => void;
    confirmAction: (message: string, callback: () => void, confirmLabel?: string, cancelLabel?: string) => void;
    closeConfirmModal: () => void;
  }
}

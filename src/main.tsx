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
let currentLevel = 1;
let questions: any[] = [];
let currentQuestionIndex = 0;
let userAnswers: Record<string, string> = {};
let userXP = 0;
let examTimer: any = null;
let questionTimer: any = null;
let questionTimeRemaining = 60; // seconds per question
let remainingTime = 3000;
let lastResult: any = null;
const QUESTION_TIME = 60; // max seconds per question
const MAX_PTS_PER_Q = 100; // max points per question
const MIN_PTS_PER_Q = 10;  // minimum points even for slow answer

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
  if (viewId === 'view-3') loadLevelCards();
  if (viewId === 'view-5') showResults();
  if (viewId === 'view-7') loadProfile();
  if (viewId === 'view-8') loadLeaderboard();
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
async function loadDashboard() {
  if (!currentUser) return;
  const nameEl = document.getElementById('dashboard-name');
  if (nameEl) nameEl.innerText = `Welcome Back, ${currentUser.name.split(' ')[0]}.`;

  try {
    const res = await fetch(`${API}/api/exam/leaderboard`);
    const data = await res.json();
    renderCompactLeaderboard(data);
  } catch (e) { }
}

function renderCompactLeaderboard(users: any[]) {
  const container = document.getElementById('compact-leaderboard');
  if (!container || !users.length) return;
  const top3 = users.slice(0, 3);

  // Visual order: 2nd place left, 1st place center (bigger), 3rd place right
  // But data must match: top3[0]=1st, top3[1]=2nd, top3[2]=3rd
  const displayOrder = [
    { dataIdx: 1, glow: 'glow-silver', rank: 'silver', rankNum: '2', big: false },
    { dataIdx: 0, glow: 'glow-gold',   rank: 'gold',   rankNum: '1', big: true  },
    { dataIdx: 2, glow: 'glow-bronze', rank: 'bronze', rankNum: '3', big: false },
  ];

  const myId = currentUser?.id || currentUser?._id;
  container.innerHTML = displayOrder.map(({ dataIdx, glow, rank, rankNum, big }) => {
    const u = top3[dataIdx];
    if (!u) return '';
    const isYou = myId && (u._id === myId || u.id === myId);
    return `<div class="lb-item glass-panel spring-hover ${glow} ${big ? 'lb-first' : ''}">
      <div class="lb-rank ${rank}">${rankNum}</div>
      <div class="lb-info"><h4>${u.name}${isYou ? ' (You)' : ''}</h4><p>${u.totalScore} pts</p></div>
    </div>`;
  }).join('');
}

// ==========================================
// LEVEL CARDS
// ==========================================
async function loadLevelCards() {
  if (!currentToken) return;
  try {
    const res = await fetch(`${API}/api/exam/profile`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    const user = data.user;
    currentUser = user;
    localStorage.setItem('pg_user', JSON.stringify(user));

    updateLevelCard(1, user.level1Attempts, true, true);
    updateLevelCard(2, user.level2Attempts, user.level2Unlocked, user.level2Unlocked);
    updateLevelCard(3, user.level3Attempts, user.level3Unlocked, user.level3Unlocked);
  } catch (e) { }
}

function updateLevelCard(level: number, attempts: number, unlocked: boolean, clickable: boolean) {
  const card = document.getElementById(`level-${level}-card`);
  if (!card) return;
  const badge = card.querySelector('.attempts-badge') as HTMLElement;
  const pEl = card.querySelector('p') as HTMLElement;
  const iconEl = card.querySelector('.level-icon') as HTMLElement;

  const tickSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`;
  const lockSVG = `<svg class="padlock" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path class="shackle" d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

  if (badge) {
    badge.innerText = `Attempts: ${attempts}/3`;
    badge.className = 'attempts-badge' + (attempts >= 3 ? ' error-badge' : '');
  }

  if (attempts >= 3) {
    card.className = 'level-card glass-panel locked disabled-card max-attempts';
    if (pEl) pEl.innerText = 'Max Attempts Reached';
    if (iconEl) { iconEl.innerHTML = lockSVG; iconEl.className = 'level-icon padlock-icon'; }
    card.onclick = null;
  } else if (!unlocked) {
    card.className = 'level-card glass-panel locked';
    if (pEl) pEl.innerText = level === 2 ? 'Requires 60%' : 'Requires 70%';
    if (iconEl) { iconEl.innerHTML = lockSVG; iconEl.className = 'level-icon padlock-icon'; }
    card.onclick = null;
  } else {
    card.className = 'level-card glass-panel spring-hover unlocked';
    if (pEl) pEl.innerText = 'Click to Enter';
    if (iconEl) { iconEl.innerHTML = tickSVG; iconEl.className = 'level-icon'; }
    card.onclick = () => {
      currentLevel = level;
      checkResumeSession(level);
    };
  }
}

async function checkResumeSession(level: number) {
  try {
    const res = await fetch(`${API}/api/exam/session/${level}`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const session = await res.json();
    if (session && session._id) {
      window.showResumeModal();
    } else {
      startFreshExam(level);
    }
  } catch (e) {
    startFreshExam(level);
  }
}

// ==========================================
// EXAM ENGINE
// ==========================================
async function startFreshExam(level: number) {
  currentLevel = level;
  currentQuestionIndex = 0;
  userAnswers = {};
  userXP = 0;
  questionTimeRemaining = QUESTION_TIME;
  document.getElementById('xp-counter')!.innerText = '0';

  try {
    const res = await fetch(`${API}/api/exam/questions/${level}`, {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    questions = await res.json();
    if (!questions.length) {
      alert('No questions found for this level. Please contact admin.');
      return;
    }
    remainingTime = 3000;
    startTimer();
    startQuestionTimer();
    window.navigateTo('view-4');
    renderQuestion();
  } catch (e) {
    alert('Error loading questions. Try again.');
  }
}

async function resumeExam(level: number) {
  try {
    const [qRes, sRes] = await Promise.all([
      fetch(`${API}/api/exam/questions/${level}`, { headers: { 'Authorization': `Bearer ${currentToken}` } }),
      fetch(`${API}/api/exam/session/${level}`, { headers: { 'Authorization': `Bearer ${currentToken}` } })
    ]);
    questions = await qRes.json();
    const session = await sRes.json();
    if (session) {
      currentQuestionIndex = session.currentIndex || 0;
      userAnswers = session.answers || {};
      remainingTime = session.remainingTime || 3000;
      // Restore score from saved answers using stored points
      userXP = session.score || 0;
      document.getElementById('xp-counter')!.innerText = formatScore(userXP);
    }
    questionTimeRemaining = QUESTION_TIME;
    startTimer();
    startQuestionTimer();
    window.navigateTo('view-4');
    renderQuestion();
  } catch (e) {
    startFreshExam(level);
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
      clearInterval(questionTimer);
      submitExam();
    }
    if (remainingTime % 30 === 0) autoSaveSession();
  }, 1000);
}

function startQuestionTimer() {
  clearInterval(questionTimer);
  questionTimeRemaining = QUESTION_TIME;
  updateQuestionTimerBar();
  questionTimer = setInterval(() => {
    questionTimeRemaining--;
    updateQuestionTimerBar();
    if (questionTimeRemaining <= 0) {
      clearInterval(questionTimer);
      // Auto-skip if no answer given
      const q = questions[currentQuestionIndex];
      if (q && !userAnswers[q._id]) {
        userAnswers[q._id] = 'SKIP';
        renderQuestion();
      }
    }
  }, 1000);
}

function updateQuestionTimerBar() {
  const bar = document.getElementById('question-timer-bar');
  const label = document.getElementById('question-timer-label');
  if (bar) {
    const pct = (questionTimeRemaining / QUESTION_TIME) * 100;
    bar.style.width = `${pct}%`;
    // Color changes: green → orange → red
    if (pct > 50) bar.style.background = '#2ecc71';
    else if (pct > 25) bar.style.background = '#f39c12';
    else bar.style.background = '#e74c3c';
  }
  if (label) label.innerText = `${questionTimeRemaining}s`;
}

// Format score with K notation
function formatScore(score: number): string {
  if (score >= 1000) return (score / 1000).toFixed(1).replace('.0', '') + 'k';
  return score.toString();
}

// Calculate points for correct answer based on speed
function calculatePoints(): number {
  const pts = Math.round(MAX_PTS_PER_Q * (questionTimeRemaining / QUESTION_TIME));
  return Math.max(pts, MIN_PTS_PER_Q);
}

function updateTimerDisplay() {
  const mins = Math.floor(remainingTime / 60).toString().padStart(2, '0');
  const secs = (remainingTime % 60).toString().padStart(2, '0');
  const el = document.getElementById('countdown');
  if (el) el.innerText = `${mins}:${secs}`;
}

async function autoSaveSession() {
  if (!currentToken) return;
  try {
    await fetch(`${API}/api/exam/session/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
      body: JSON.stringify({
        level: currentLevel,
        currentIndex: currentQuestionIndex,
        answers: userAnswers,
        remainingTime,
        section: 'Maths',
        score: userXP
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

  // Tabs
  const tabsEl = document.getElementById('exam-tabs');
  if (tabsEl) tabsEl.innerHTML = `<div class="tab active">Mathematics — Level ${currentLevel}</div>`;

  // Passage panel hidden for maths
  const passagePanel = document.querySelector('.passage-panel') as HTMLElement;
  if (passagePanel) passagePanel.style.display = 'none';

  // Buttons
  const btnNext = document.getElementById('btn-next-question') as HTMLButtonElement;
  const btnPrev = document.getElementById('btn-prev-question') as HTMLButtonElement;
  if (btnPrev) btnPrev.style.visibility = currentQuestionIndex > 0 ? 'visible' : 'hidden';
  if (btnNext) {
    btnNext.innerText = currentQuestionIndex === total - 1 ? 'Submit Exam' : 'Next';
    btnNext.style.display = answered ? 'inline-flex' : 'none';
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
      <span class="opt-text">${opt}</span>
    </button>`;
  }).join('');

  container.innerHTML = `
    <h3 class="question-text">${q.question}</h3>
    <div class="options-container">${optionsHtml}</div>
  `;

  triggerMathRender();
}

window.selectAnswer = (button: HTMLElement, letter: string) => {
  const q = questions[currentQuestionIndex];
  if (userAnswers[q._id]) return;
  userAnswers[q._id] = letter;

  clearInterval(questionTimer); // stop question timer on answer

  if (letter === q.correct) {
    const pts = calculatePoints();
    userXP += pts;
    const formatted = formatScore(userXP);
    document.getElementById('xp-counter')!.innerText = formatted;
    animateXP();
    window.playSound('correct');
  } else {
    window.playSound('wrong');
  }

  renderQuestion();
};

window.nextQuestion = () => {
  if (currentQuestionIndex < questions.length - 1) {
    currentQuestionIndex++;
    startQuestionTimer(); // reset 60s for new question
    renderQuestion();
  } else {
    submitExam();
  }
};

window.previousQuestion = () => {
  if (currentQuestionIndex > 0) {
    currentQuestionIndex--;
    startQuestionTimer();
    renderQuestion();
  }
};

function animateXP() {
  const flyer = document.getElementById('xp-flyer');
  if (!flyer) return;
  flyer.style.transition = 'none';
  flyer.style.transform = 'translateY(0) scale(1)';
  flyer.style.opacity = '1';
  void flyer.offsetWidth;
  flyer.style.transition = 'transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.6s ease-out';
  flyer.style.transform = 'translateY(-30px) scale(1.2)';
  flyer.style.opacity = '0';
}

async function submitExam() {
  clearInterval(examTimer);
  clearInterval(questionTimer);
  await autoSaveSession();

  try {
    const res = await fetch(`${API}/api/exam/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
      body: JSON.stringify({ level: currentLevel, answers: userAnswers, totalScore: userXP })
    });
    const data = await res.json();
    if (res.ok) {
      lastResult = { ...data, earnedScore: userXP };
      currentUser = data.user;
      localStorage.setItem('pg_user', JSON.stringify(data.user));
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
  resumeExam(currentLevel);
};

window.restartExam = async () => {
  window.hideResumeModal();
  try {
    await fetch(`${API}/api/exam/session/${currentLevel}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
  } catch (e) { }
  startFreshExam(currentLevel);
};

window.quitExam = () => {
  window.confirmAction(
    '⚠️ Quit Exam?\n\nYour progress will be SAVED. You can resume later from where you left off.',
    async () => {
      await autoSaveSession();
      clearInterval(examTimer);
      // Clear exam from view stack so Back button works correctly
      viewStack = viewStack.filter(v => v !== 'view-4');
      window.navigateTo('view-3');
    },
    'Save & Quit',
    'Continue Exam'
  );
};

// ==========================================
// RESULTS
// ==========================================
function showResults() {
  if (!lastResult) return;
  const { totalCorrect, percentage, earnedScore } = lastResult;
  const total = questions.length;

  // Show earned score
  const xpEl = document.getElementById('xp-counter');
  if (xpEl) xpEl.innerText = formatScore(earnedScore || userXP);

  // Show earned score on results page
  const earnedEl = document.getElementById('earned-score');
  if (earnedEl) earnedEl.innerText = formatScore(earnedScore || userXP);

  const mathEl = document.getElementById('math-final-score');
  if (mathEl) mathEl.innerText = `${totalCorrect}/${total}`;

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

  // Check level unlock
  const unlockMsg = document.getElementById('unlock-message');
  if (unlockMsg) {
    if (percentage >= 60 && currentLevel === 1 && lastResult.user?.level2Unlocked) {
      unlockMsg.style.display = 'block';
      unlockMsg.innerText = '🎉 Level 2 Unlocked!';
      window.playSound('unlock');
    } else if (percentage >= 70 && currentLevel === 2 && lastResult.user?.level3Unlocked) {
      unlockMsg.style.display = 'block';
      unlockMsg.innerText = '🎉 Level 3 Unlocked!';
      window.playSound('unlock');
    } else {
      unlockMsg.style.display = 'none';
    }
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
    const attempts = data.attempts;

    const nameEl = document.getElementById('profile-name');
    const avatarEl = document.getElementById('profile-avatar');
    const scoreEl = document.getElementById('profile-score');
    const l1El = document.getElementById('profile-l1');
    const l2El = document.getElementById('profile-l2');
    const l3El = document.getElementById('profile-l3');
    const histEl = document.getElementById('attempt-history');

    if (nameEl) nameEl.innerText = user.name;
    if (avatarEl) avatarEl.innerText = user.name.substring(0, 2).toUpperCase();
    if (scoreEl) scoreEl.innerText = `${user.totalScore} pts`;
    if (l1El) l1El.innerText = `${user.level1Attempts}/3 attempts`;
    if (l2El) l2El.innerText = user.level2Unlocked ? `${user.level2Attempts}/3 attempts` : 'Locked (Need 60%)';
    if (l3El) l3El.innerText = user.level3Unlocked ? `${user.level3Attempts}/3 attempts` : 'Locked (Need 70%)';

    if (histEl && attempts) {
      histEl.innerHTML = attempts.map((a: any) => `
        <li>
          <span class="status ${a.percentage >= 60 ? 'pass' : 'fail'}">${a.percentage >= 60 ? 'Passed' : 'Failed'}</span>
          Level ${a.level} — ${a.percentage}% (${new Date(a.completedAt).toLocaleDateString()})
        </li>
      `).join('') || '<li>No attempts yet</li>';
    }
  } catch (e) { }
}

// ==========================================
// LEADERBOARD
// ==========================================
async function loadLeaderboard() {
  try {
    const res = await fetch(`${API}/api/exam/leaderboard`);
    const users = await res.json();

    const top3El = document.getElementById('leaderboard-top3');
    const listEl = document.getElementById('leaderboard-list');
    const myRankEl = document.getElementById('my-rank-display');

    const myId = currentUser?.id || currentUser?._id;
    const myRankIdx = myId ? users.findIndex((u: any) => u._id === myId || u.id === myId) : -1;
    if (myRankEl) myRankEl.innerText = myRankIdx >= 0 ? `#${myRankIdx + 1}` : 'N/A';

    if (top3El) {
      const top3 = users.slice(0, 3);
      // Visual: 2nd left, 1st center (bigger), 3rd right — data stays correct
      const displayOrder = [
        { dataIdx: 1, glow: 'glow-silver', rank: 'silver', num: '2', big: false },
        { dataIdx: 0, glow: 'glow-gold',   rank: 'gold',   num: '1', big: true  },
        { dataIdx: 2, glow: 'glow-bronze', rank: 'bronze', num: '3', big: false },
      ];
      top3El.innerHTML = displayOrder.map(({ dataIdx, glow, rank, num, big }) => {
        const u = top3[dataIdx];
        if (!u) return '';
        return `<div class="lb-item glass-panel ${glow} ${big ? 'lb-first' : ''}">
          <div class="lb-rank ${rank}">${num}</div>
          <div class="lb-info"><h4>${u.name}</h4><p>${u.totalScore} pts</p></div>
        </div>`;
      }).join('');
    }

    if (listEl) {
      const myId = currentUser?.id || currentUser?._id;
      listEl.innerHTML = users.slice(3).map((u: any, idx: number) => {
        const rank = idx + 4;
        const isYou = myId && (u._id === myId || u.id === myId);
        return `<div class="lb-row glass-panel spring-hover ${isYou ? 'my-row' : ''}">
          <div class="row-rank" style="${isYou ? 'color:#d4af37' : ''}">${rank}</div>
          <div class="row-name">${u.name}${isYou ? ' (You)' : ''}</div>
          <div class="row-score">${u.totalScore} pts</div>
        </div>`;
      }).join('');
    }
  } catch (e) { }
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
            <h4>${a.title}</h4>
            <p>${a.description}</p>
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
};

async function loadAdminData() {
  loadAdminStats();
  loadAdminQuestions();
  loadAdminUsers();
  loadAdminAnnouncements();
}

async function loadAdminStats() {
  try {
    const res = await fetch(`${API}/api/admin/stats`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
    const data = await res.json();
    document.getElementById('stat-users')!.innerText = data.totalUsers || '0';
    document.getElementById('stat-attempts')!.innerText = data.totalAttempts || '0';
    document.getElementById('stat-passrate')!.innerText = (data.passRate || 0) + '%';
    document.getElementById('stat-questions')!.innerText = data.totalQuestions || '0';
  } catch (e) { }
}

async function loadAdminQuestions() {
  const tbody = document.getElementById('admin-q-tbody')!;
  try {
    const res = await fetch(`${API}/api/admin/questions`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
    const data = await res.json();

    // Group by level
    const byLevel: any = { 1: 0, 2: 0, 3: 0 };
    const byLevelIds: any = { 1: [], 2: [], 3: [] };
    data.forEach((q: any) => {
      byLevel[q.level] = (byLevel[q.level] || 0) + 1;
      byLevelIds[q.level].push(q._id);
    });

    tbody.innerHTML = [1, 2, 3].map(lvl => `
      <tr>
        <td>Level ${lvl}</td>
        <td>Mathematics Set ${lvl}</td>
        <td>${byLevel[lvl] || 0} questions</td>
        <td>
          ${byLevel[lvl] > 0
        ? `<button class="action-btn delete" onclick="window.deleteQuestion(${lvl})">Delete Set</button>`
        : `<span style="color:var(--text-muted);font-size:0.85rem;">Not uploaded</span>`
      }
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Error loading</td></tr>';
  }
}

async function loadAdminUsers() {
  const tbody = document.getElementById('admin-users-tbody')!;
  try {
    const res = await fetch(`${API}/api/admin/users`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
    const data = await res.json();
    tbody.innerHTML = data.map((u: any) => `
      <tr>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td>${(u.level1Attempts || 0) + (u.level2Attempts || 0) + (u.level3Attempts || 0)}</td>
        <td><button class="action-btn delete" onclick="window.deleteUser('${u._id}')">Delete</button></td>
      </tr>
    `).join('') || '<tr><td colspan="4" style="text-align:center">No users yet</td></tr>';
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
        <td>${a.title}</td>
        <td><button class="action-btn delete" onclick="window.deleteAnnouncement('${a._id}')">Delete</button></td>
      </tr>
    `).join('') || '<tr><td colspan="3" style="text-align:center">No announcements</td></tr>';
  } catch (e) { }
}

window.submitBulkQuestions = async (form: HTMLFormElement) => {
  const formData = new FormData(form);
  const level = formData.get('level');
  const rawText = formData.get('rawText') as string;
  const statusEl = document.getElementById('upload-status')!;
  statusEl.style.display = 'none';

  if (!rawText.trim()) {
    statusEl.style.display = 'block';
    statusEl.style.color = 'red';
    statusEl.innerText = 'Please paste question text first.';
    return;
  }

  statusEl.style.display = 'block';
  statusEl.style.color = 'var(--text-muted)';
  statusEl.innerText = 'Uploading...';

  try {
    const res = await fetch(`${API}/api/admin/questions/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ level, rawText })
    });
    const data = await res.json();
    if (res.ok) {
      statusEl.style.color = '#2ecc71';
      statusEl.innerText = `✅ ${data.count} questions uploaded for Level ${level}!`;
      form.reset();
      loadAdminQuestions();
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
  window.confirmAction('Are you sure you want to permanently delete this user?', async () => {
    try {
      await fetch(`${API}/api/admin/users/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${adminToken}` } });
      loadAdminUsers();
    } catch (e) { }
  });
};

window.deleteQuestion = (level: number) => {
  window.confirmAction(`Delete ALL Level ${level} questions? This cannot be undone.`, async () => {
    try {
      await fetch(`${API}/api/admin/questions/level/${level}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${adminToken}` } });
      loadAdminQuestions();
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
  // Style quit differently
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

window.simulateLeaderboardShift = () => { };

// Type declarations
declare global {
  interface Window {
    navigateTo: (targetId: string, pushHistory?: boolean) => void;
    navigateBack: () => void;
    login: () => void;
    register: () => void;
    showRegister: () => void;
    showLogin: () => void;
    logout: () => void;
    unlockLevel: (level: number) => void;
    showResumeModal: () => void;
    hideResumeModal: () => void;
    acceptResumeModal: () => void;
    restartExam: () => void;
    selectAnswer: (button: HTMLElement, letter: string) => void;
    nextQuestion: () => void;
    previousQuestion: () => void;
    simulateLeaderboardShift: () => void;
    playSound: (type: string) => void;
    adminLogin: () => void;
    switchAdminTab: (tabId: string) => void;
    submitBulkQuestions: (form: HTMLFormElement) => void;
    submitAnnouncement: (form: HTMLFormElement) => void;
    deleteUser: (id: string) => void;
    deleteQuestion: (level: number) => void;
    deleteAnnouncement: (id: string) => void;
    confirmAction: (message: string, callback: () => void, confirmLabel?: string, cancelLabel?: string) => void;
    closeConfirmModal: () => void;
    quitExam: () => void;
  }
}

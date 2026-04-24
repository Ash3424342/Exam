/**
 * app.js
 * Purpose: Core application logic — AuthManager, UIController, ExamEngine, ResultProcessor
 * Key exports: AuthManager, UIController, ExamEngine, ResultProcessor (all window-attached)
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// AuthManager — handles registration, login, session, and seeding
// ═══════════════════════════════════════════════════════════════════════════════

const AuthManager = (() => {
  const USERS_KEY = 'users';
  const SESSION_KEY = 'session';

  function _loadUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
    } catch {
      return [];
    }
  }

  function _saveUsers(users) {
    storageGuard(() => localStorage.setItem(USERS_KEY, JSON.stringify(users)));
  }

  /** Seeds the default admin account on first load */
  async function seedAdmin() {
    const users = _loadUsers();
    const adminExists = users.some(u => u.username === 'admin' && u.role === 'admin');
    if (!adminExists) {
      const hash = await hashPassword('admin123');
      users.push({
        id: generateId(),
        username: 'admin',
        passwordHash: hash,
        role: 'admin',
        createdAt: new Date().toISOString(),
      });
      _saveUsers(users);
    }
  }

  /**
   * Authenticates a user.
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{ success: boolean, error?: string, user?: object }>}
   */
  async function login(username, password) {
    const users = _loadUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) return { success: false, error: 'Invalid username or password.' };

    const hash = await hashPassword(password);
    if (hash !== user.passwordHash) return { success: false, error: 'Invalid username or password.' };

    const session = { userId: user.id, role: user.role, username: user.username };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { success: true, user };
  }

  /**
   * Registers a new student account.
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async function register(username, password) {
    if (!username || !username.trim()) return { success: false, error: 'Username is required.' };
    if (!password || password.length < 4) return { success: false, error: 'Password must be at least 4 characters.' };

    const users = _loadUsers();
    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      return { success: false, error: 'Username already exists.' };
    }

    const hash = await hashPassword(password);
    users.push({
      id: generateId(),
      username: username.trim(),
      passwordHash: hash,
      role: 'student',
      createdAt: new Date().toISOString(),
    });
    _saveUsers(users);
    return { success: true };
  }

  /** Clears the session and redirects to login */
  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    UIController.showView('login');
  }

  /** Returns the current session object or null */
  function getSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null;
    } catch {
      return null;
    }
  }

  /** Returns all users (for admin views) */
  function getAllUsers() {
    return _loadUsers();
  }

  /**
   * Clears all users and re-seeds admin (for app reset).
   */
  async function resetUsers() {
    storageGuard(() => localStorage.removeItem(USERS_KEY));
    await seedAdmin();
  }

  return { seedAdmin, login, register, logout, getSession, getAllUsers, resetUsers };
})();


// ═══════════════════════════════════════════════════════════════════════════════
// ExamManager — CRUD for exams in localStorage
// ═══════════════════════════════════════════════════════════════════════════════

const ExamManager = (() => {
  const STORE_KEY = 'exams';

  function _load() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function _save(exams) {
    return storageGuard(() => localStorage.setItem(STORE_KEY, JSON.stringify(exams)));
  }

  function getAll() { return _load(); }

  function getById(id) { return _load().find(e => e.id === id) || null; }

  function getActive() { return _load().filter(e => e.isActive); }

  function create(data) {
    const { title, subject, questionCount, timeLimitMinutes, isActive } = data;
    if (!title || !title.trim()) return { success: false, error: 'Title is required.' };
    if (!subject || !subject.trim()) return { success: false, error: 'Subject is required.' };
    if (!questionCount || questionCount < 1) return { success: false, error: 'Question count must be at least 1.' };
    if (!timeLimitMinutes || timeLimitMinutes < 1) return { success: false, error: 'Time limit must be at least 1 minute.' };

    const available = QuestionManager.getCountBySubject(subject);
    if (questionCount > available) {
      return { success: false, error: `Only ${available} questions available for "${subject}".` };
    }

    const exams = _load();
    const exam = {
      id: generateId(),
      title: title.trim(),
      subject: subject.trim(),
      questionCount: parseInt(questionCount, 10),
      timeLimitMinutes: parseInt(timeLimitMinutes, 10),
      isActive: Boolean(isActive),
      createdAt: new Date().toISOString(),
    };
    exams.push(exam);
    return _save(exams) ? { success: true, exam } : { success: false, error: 'Storage save failed.' };
  }

  function update(id, data) {
    const { title, subject, questionCount, timeLimitMinutes, isActive } = data;
    const exams = _load();
    const idx = exams.findIndex(e => e.id === id);
    if (idx === -1) return { success: false, error: 'Exam not found.' };

    if (!title || !title.trim()) return { success: false, error: 'Title is required.' };
    if (!subject || !subject.trim()) return { success: false, error: 'Subject is required.' };
    if (!questionCount || questionCount < 1) return { success: false, error: 'Question count must be at least 1.' };
    if (!timeLimitMinutes || timeLimitMinutes < 1) return { success: false, error: 'Time limit must be at least 1 minute.' };

    const available = QuestionManager.getCountBySubject(subject);
    if (questionCount > available) {
      return { success: false, error: `Only ${available} questions available for "${subject}".` };
    }

    exams[idx] = {
      ...exams[idx],
      title: title.trim(),
      subject: subject.trim(),
      questionCount: parseInt(questionCount, 10),
      timeLimitMinutes: parseInt(timeLimitMinutes, 10),
      isActive: Boolean(isActive),
    };
    return _save(exams) ? { success: true } : { success: false, error: 'Storage save failed.' };
  }

  function remove(id) {
    const exams = _load();
    const filtered = exams.filter(e => e.id !== id);
    if (filtered.length === exams.length) return { success: false, error: 'Exam not found.' };
    return _save(filtered) ? { success: true } : { success: false, error: 'Storage save failed.' };
  }

  function toggleActive(id) {
    const exams = _load();
    const exam = exams.find(e => e.id === id);
    if (!exam) return { success: false, error: 'Exam not found.' };
    exam.isActive = !exam.isActive;
    return _save(exams) ? { success: true, isActive: exam.isActive } : { success: false, error: 'Storage save failed.' };
  }

  function clearAll() {
    storageGuard(() => localStorage.removeItem(STORE_KEY));
  }

  return { getAll, getById, getActive, create, update, remove, toggleActive, clearAll };
})();


// ═══════════════════════════════════════════════════════════════════════════════
// ResultProcessor — save and query exam results
// ═══════════════════════════════════════════════════════════════════════════════

const ResultProcessor = (() => {
  const STORE_KEY = 'results';

  function _load() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function _save(results) {
    return storageGuard(() => localStorage.setItem(STORE_KEY, JSON.stringify(results)));
  }

  /**
   * Saves exam result to localStorage.
   * @param {{ studentId, studentUsername, examId, examTitle, responses, totalQuestions }} data
   * @returns {{ success: boolean, result?: object, error?: string }}
   */
  function saveResult(data) {
    const { studentId, studentUsername, examId, examTitle, responses, totalQuestions } = data;
    const passingPercent = parseInt(sessionStorage.getItem('passingPercent') || '50', 10);

    const score = responses.filter(r => r.isCorrect).length;
    const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
    const passed = percentage >= passingPercent;

    const result = {
      id: generateId(),
      studentId,
      studentUsername,
      examId,
      examTitle,
      score,
      totalQuestions,
      percentage,
      passed,
      dateTaken: new Date().toISOString(),
      responses,
    };

    const results = _load();
    results.push(result);
    const saved = _save(results);
    return saved ? { success: true, result } : { success: false, error: 'Failed to save result.' };
  }

  /** Returns all results for a student */
  function getStudentResults(studentId) {
    return _load().filter(r => r.studentId === studentId);
  }

  /** Returns all results for a specific exam */
  function getExamResults(examId) {
    return _load().filter(r => r.examId === examId);
  }

  /** Returns all results */
  function getAll() {
    return _load();
  }

  /**
   * Computes aggregate stats for an exam.
   * @param {string} examId
   * @returns {{ count, avg, highest, lowest, passRate }}
   */
  function getStats(examId) {
    const results = getExamResults(examId);
    if (results.length === 0) {
      return { count: 0, avg: 0, highest: 0, lowest: 0, passRate: 0 };
    }
    const percentages = results.map(r => r.percentage);
    const passed = results.filter(r => r.passed).length;
    return {
      count: results.length,
      avg: Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length),
      highest: Math.max(...percentages),
      lowest: Math.min(...percentages),
      passRate: Math.round((passed / results.length) * 100),
    };
  }

  function clearAll() {
    storageGuard(() => localStorage.removeItem(STORE_KEY));
  }

  return { saveResult, getStudentResults, getExamResults, getAll, getStats, clearAll };
})();


// ═══════════════════════════════════════════════════════════════════════════════
// ExamEngine — runs a single exam session in-memory, submits on completion
// ═══════════════════════════════════════════════════════════════════════════════

const ExamEngine = (() => {
  let _exam = null;
  let _questions = [];
  let _responses = {};   // { questionId: selectedOption }
  let _currentIndex = 0;
  let _timerInterval = null;
  let _secondsRemaining = 0;
  let _warningShown = false;

  function start(exam) {
    _exam = exam;
    const allQuestions = QuestionManager.getQuestions(exam.subject);
    _questions = randomSample(allQuestions, exam.questionCount);
    _responses = {};
    _currentIndex = 0;
    _secondsRemaining = exam.timeLimitMinutes * 60;
    _warningShown = false;
    UIController.showView('exam');
    _renderQuestion();
    _startTimer();
  }

  function _startTimer() {
    _clearTimer();
    _renderTimer();
    _timerInterval = setInterval(() => {
      _secondsRemaining--;
      _renderTimer();

      if (_secondsRemaining === 120 && !_warningShown) {
        _warningShown = true;
        UIController.showModal('timer-warning-modal');
      }

      if (_secondsRemaining <= 0) {
        _clearTimer();
        _submit(true);
      }
    }, 1000);
  }

  function _clearTimer() {
    if (_timerInterval) {
      clearInterval(_timerInterval);
      _timerInterval = null;
    }
  }

  function _renderTimer() {
    const timerEl = document.getElementById('exam-timer');
    if (!timerEl) return;
    const mins = Math.floor(_secondsRemaining / 60);
    const secs = _secondsRemaining % 60;
    timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    timerEl.classList.remove('timer--warning', 'timer--danger');
    if (_secondsRemaining <= 60) {
      timerEl.classList.add('timer--danger');
    } else if (_secondsRemaining <= 300) {
      timerEl.classList.add('timer--warning');
    }
  }

  function _renderQuestion() {
    if (!_questions.length) return;
    const q = _questions[_currentIndex];
    const total = _questions.length;
    const current = _currentIndex + 1;

    document.getElementById('exam-title-display').textContent = _exam.title;
    document.getElementById('question-counter').textContent = `Question ${current} of ${total}`;
    document.getElementById('question-text').textContent = q.questionText;

    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D'];
    q.options.forEach((optText, i) => {
      const letter = letters[i];
      const saved = _responses[q.id];
      const checked = saved === letter ? 'checked' : '';
      const li = document.createElement('li');
      li.className = 'option-item';
      li.innerHTML = `
        <label class="option-label">
          <input type="radio" name="option" value="${letter}" ${checked}>
          <span class="option-letter">${letter}</span>
          <span class="option-text">${escapeHtml(optText)}</span>
        </label>`;
      li.querySelector('input').addEventListener('change', () => {
        _responses[q.id] = letter;
      });
      optionsContainer.appendChild(li);
    });

    // Update navigation buttons
    document.getElementById('btn-prev').disabled = (_currentIndex === 0);
    const isLast = _currentIndex === total - 1;
    document.getElementById('btn-next').style.display = isLast ? 'none' : 'inline-flex';
    document.getElementById('btn-submit').style.display = isLast ? 'inline-flex' : 'none';
  }

  function navigate(direction) {
    if (direction === 'prev' && _currentIndex > 0) {
      _currentIndex--;
      _renderQuestion();
    } else if (direction === 'next' && _currentIndex < _questions.length - 1) {
      _currentIndex++;
      _renderQuestion();
    }
  }

  function confirmSubmit() {
    UIController.showModal('submit-confirm-modal');
  }

  function _submit(autoSubmit = false) {
    _clearTimer();

    const session = AuthManager.getSession();
    const responses = _questions.map(q => ({
      questionId: q.id,
      selectedOption: _responses[q.id] || null,
      correctOption: q.correctAnswer,
      isCorrect: _responses[q.id] === q.correctAnswer,
    }));

    const resultData = {
      studentId: session.userId,
      studentUsername: session.username,
      examId: _exam.id,
      examTitle: _exam.title,
      responses,
      totalQuestions: _questions.length,
    };

    const { success, result, error } = ResultProcessor.saveResult(resultData);
    if (!success) {
      showToast(error || 'Failed to save result.', 'error');
      return;
    }

    UIController.closeModal('submit-confirm-modal');
    UIController.closeModal('timer-warning-modal');
    ResultProcessor.showResultView(result, _questions);
  }

  function abort() {
    _clearTimer();
    UIController.showView('student-dashboard');
  }

  return { start, navigate, confirmSubmit, submitNow: () => _submit(false), abort };
})();


// ═══════════════════════════════════════════════════════════════════════════════
// UIController — view switching, tab management, and all render functions
// ═══════════════════════════════════════════════════════════════════════════════

const UIController = (() => {
  const VIEWS = [
    'login', 'register',
    'admin-dashboard', 'student-dashboard', 'exam', 'result',
  ];

  let _adminTab = 'questions';
  let _qPage = 1;
  let _qSubjectFilter = '__all__';
  let _editingQuestionId = null;
  let _editingExamId = null;

  function showView(name) {
    VIEWS.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.style.display = v === name ? 'block' : 'none';
    });
    if (name === 'admin-dashboard') _renderAdminDashboard();
    if (name === 'student-dashboard') _renderStudentDashboard();
  }

  function showModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('modal--open');
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('modal--open');
  }

  // ─── Auth views ─────────────────────────────────────────────────────────────

  function initLoginForm() {
    const form = document.getElementById('login-form');
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      clearFormErrors('login-form');
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      if (!username) { showFieldError('login-username', 'Username is required.'); return; }
      if (!password) { showFieldError('login-password', 'Password is required.'); return; }

      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      const { success, error, user } = await AuthManager.login(username, password);
      btn.disabled = false;

      if (!success) { showFieldError('login-password', error); return; }
      if (user.role === 'admin') showView('admin-dashboard');
      else showView('student-dashboard');
    });
  }

  function initRegisterForm() {
    const form = document.getElementById('register-form');
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      clearFormErrors('register-form');
      const username = document.getElementById('reg-username').value.trim();
      const password = document.getElementById('reg-password').value;
      const confirm = document.getElementById('reg-confirm').value;

      if (!username) { showFieldError('reg-username', 'Username is required.'); return; }
      if (!password || password.length < 4) { showFieldError('reg-password', 'Minimum 4 characters.'); return; }
      if (password !== confirm) { showFieldError('reg-confirm', 'Passwords do not match.'); return; }

      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      const { success, error } = await AuthManager.register(username, password);
      btn.disabled = false;

      if (!success) { showFieldError('reg-username', error); return; }
      showToast('Account created. Please log in.', 'success');
      showView('login');
    });
  }

  // ─── Admin dashboard ─────────────────────────────────────────────────────────

  function _renderAdminDashboard() {
    const session = AuthManager.getSession();
    if (!session || session.role !== 'admin') { showView('login'); return; }
    document.getElementById('admin-username-display').textContent = session.username;
    _switchAdminTab(_adminTab);
  }

  function _switchAdminTab(tab) {
    _adminTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('tab-btn--active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.style.display = pane.dataset.tab === tab ? 'block' : 'none';
    });
    if (tab === 'questions') _renderQuestionBank();
    if (tab === 'exams') _renderExamList();
    if (tab === 'results') _renderResultsDashboard();
    if (tab === 'settings') _renderSettings();
  }

  // ─── Question bank tab ───────────────────────────────────────────────────────

  function _renderQuestionBank() {
    _buildSubjectFilter();
    _renderQTable();
    _initQuestionForm();
    _initBulkImport();
    _initAiGenerator();
  }

  function _buildSubjectFilter() {
    const sel = document.getElementById('q-subject-filter');
    if (!sel) return;
    const subjects = QuestionManager.getSubjects();
    const current = sel.value || '__all__';
    sel.innerHTML = '<option value="__all__">All Subjects</option>' +
      subjects.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    sel.value = subjects.includes(current) ? current : '__all__';
  }

  function _renderQTable() {
    const all = QuestionManager.getQuestions(_qSubjectFilter);
    const { items, totalPages, currentPage, total } = QuestionManager.paginate(all, _qPage, 10);

    const tbody = document.getElementById('q-table-body');
    if (!tbody) return;
    tbody.innerHTML = items.length === 0
      ? '<tr><td colspan="3" class="table-empty">No questions found.</td></tr>'
      : items.map(q => `
          <tr>
            <td>${escapeHtml(q.subject)}</td>
            <td title="${escapeHtml(q.questionText)}">${escapeHtml(q.questionText.slice(0, 60))}${q.questionText.length > 60 ? '…' : ''}</td>
            <td>
              <button class="btn btn--sm btn--secondary" onclick="UIController.editQuestion('${q.id}')">Edit</button>
              <button class="btn btn--sm btn--danger" onclick="UIController.deleteQuestion('${q.id}')">Delete</button>
            </td>
          </tr>`).join('');

    document.getElementById('q-total-count').textContent = `${total} question${total !== 1 ? 's' : ''}`;

    // Pagination controls
    const paginationEl = document.getElementById('q-pagination');
    if (paginationEl) {
      paginationEl.innerHTML = '';
      if (totalPages > 1) {
        const prev = _mkBtn('‹ Prev', currentPage === 1, () => { _qPage--; _renderQTable(); });
        const pageInfo = document.createElement('span');
        pageInfo.className = 'pagination-info';
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        const next = _mkBtn('Next ›', currentPage === totalPages, () => { _qPage++; _renderQTable(); });
        paginationEl.append(prev, pageInfo, next);
      }
    }
  }

  function _mkBtn(label, disabled, onClick) {
    const btn = document.createElement('button');
    btn.className = 'btn btn--sm btn--secondary';
    btn.textContent = label;
    btn.disabled = disabled;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function _initQuestionForm() {
    const form = document.getElementById('question-form');
    if (!form || form._initialized) return;
    form._initialized = true;

    form.addEventListener('submit', e => {
      e.preventDefault();
      clearFormErrors('question-form');

      const data = {
        subject: document.getElementById('q-subject').value.trim(),
        questionText: document.getElementById('q-text').value.trim(),
        options: [
          document.getElementById('q-opt-a').value.trim(),
          document.getElementById('q-opt-b').value.trim(),
          document.getElementById('q-opt-c').value.trim(),
          document.getElementById('q-opt-d').value.trim(),
        ],
        correctAnswer: document.getElementById('q-correct').value,
      };

      if (!data.subject) { showFieldError('q-subject', 'Required.'); return; }
      if (!data.questionText) { showFieldError('q-text', 'Required.'); return; }
      if (data.options.some(o => !o)) { showToast('All four options are required.', 'error'); return; }
      if (!data.correctAnswer) { showFieldError('q-correct', 'Required.'); return; }

      let result;
      if (_editingQuestionId) {
        result = QuestionManager.updateQuestion(_editingQuestionId, data);
      } else {
        result = QuestionManager.addQuestion(data);
      }

      if (!result.success) { showToast(result.error, 'error'); return; }

      showToast(_editingQuestionId ? 'Question updated.' : 'Question added.', 'success');
      _editingQuestionId = null;
      form.reset();
      document.getElementById('q-form-title').textContent = 'Add Question';
      document.getElementById('q-cancel-edit').style.display = 'none';
      _qPage = 1;
      _renderQTable();
      _buildSubjectFilter();
    });
  }

  function editQuestion(id) {
    const q = QuestionManager.getQuestionById(id);
    if (!q) return;
    _editingQuestionId = id;
    document.getElementById('q-subject').value = q.subject;
    document.getElementById('q-text').value = q.questionText;
    document.getElementById('q-opt-a').value = q.options[0];
    document.getElementById('q-opt-b').value = q.options[1];
    document.getElementById('q-opt-c').value = q.options[2];
    document.getElementById('q-opt-d').value = q.options[3];
    document.getElementById('q-correct').value = q.correctAnswer;
    document.getElementById('q-form-title').textContent = 'Edit Question';
    document.getElementById('q-cancel-edit').style.display = 'inline-flex';
    document.getElementById('question-form').scrollIntoView({ behavior: 'smooth' });
  }

  function deleteQuestion(id) {
    if (!confirm('Delete this question?')) return;
    const { success, error } = QuestionManager.deleteQuestion(id);
    if (success) {
      showToast('Question deleted.', 'success');
      _renderQTable();
      _buildSubjectFilter();
    } else {
      showToast(error, 'error');
    }
  }

  function _initBulkImport() {
    const btn = document.getElementById('bulk-import-btn');
    if (!btn || btn._initialized) return;
    btn._initialized = true;
    btn.addEventListener('click', () => {
      const raw = document.getElementById('bulk-import-textarea').value.trim();
      if (!raw) { showToast('Paste JSON array to import.', 'warning'); return; }
      let parsed;
      try { parsed = JSON.parse(raw); } catch { showToast('Invalid JSON.', 'error'); return; }
      const { inserted, skipped, errors } = QuestionManager.bulkImport(parsed);
      let msg = `Imported: ${inserted}`;
      if (skipped) msg += `, Skipped (duplicates): ${skipped}`;
      if (errors.length) msg += `. Errors: ${errors.length}`;
      showToast(msg, inserted > 0 ? 'success' : 'warning');
      if (errors.length) console.warn('[BulkImport] Errors:', errors);
      document.getElementById('bulk-import-textarea').value = '';
      _qPage = 1;
      _renderQTable();
      _buildSubjectFilter();
    });
  }

  function _initAiGenerator() {
    const form = document.getElementById('ai-gen-form');
    if (!form || form._initialized) return;
    form._initialized = true;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const topic = document.getElementById('ai-topic').value.trim();
      const count = parseInt(document.getElementById('ai-count').value, 10);
      const subject = document.getElementById('ai-subject').value.trim() || topic;
      const model = document.getElementById('ai-model').value;
      if (!topic) { showToast('Topic is required.', 'error'); return; }
      if (!count || count < 1) { showToast('Count must be ≥ 1.', 'error'); return; }
      showSpinner('Generating questions with AI…');
      try {
        const { inserted, errors } = await generateQuestionsFromGroq(topic, count, subject, model);
        showToast(`${inserted} question${inserted !== 1 ? 's' : ''} added to the bank.`, 'success');
        if (errors.length) errors.forEach(err => console.warn('[AI]', err));
        _qPage = 1;
        _renderQTable();
        _buildSubjectFilter();
        form.reset();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        hideSpinner();
      }
    });
  }

  // ─── Exam configuration tab ──────────────────────────────────────────────────

  function _renderExamList() {
    const exams = ExamManager.getAll();
    const tbody = document.getElementById('exam-table-body');
    if (!tbody) return;
    tbody.innerHTML = exams.length === 0
      ? '<tr><td colspan="6" class="table-empty">No exams configured.</td></tr>'
      : exams.map(ex => `
          <tr>
            <td>${escapeHtml(ex.title)}</td>
            <td>${escapeHtml(ex.subject)}</td>
            <td>${ex.questionCount}</td>
            <td>${ex.timeLimitMinutes} min</td>
            <td><span class="badge badge--${ex.isActive ? 'active' : 'inactive'}">${ex.isActive ? 'Active' : 'Inactive'}</span></td>
            <td>
              <button class="btn btn--sm btn--secondary" onclick="UIController.editExam('${ex.id}')">Edit</button>
              <button class="btn btn--sm btn--${ex.isActive ? 'warning' : 'success'}" onclick="UIController.toggleExam('${ex.id}')">${ex.isActive ? 'Deactivate' : 'Activate'}</button>
              <button class="btn btn--sm btn--danger" onclick="UIController.deleteExam('${ex.id}')">Delete</button>
            </td>
          </tr>`).join('');

    _initExamForm();
    _populateExamSubjectDropdown();
  }

  function _populateExamSubjectDropdown() {
    const sel = document.getElementById('exam-subject');
    if (!sel) return;
    const subjects = QuestionManager.getSubjects();
    const current = sel.value;
    sel.innerHTML = '<option value="">Select subject…</option>' +
      subjects.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    if (subjects.includes(current)) sel.value = current;

    // Show available count on subject change
    sel.addEventListener('change', () => {
      const count = QuestionManager.getCountBySubject(sel.value);
      document.getElementById('exam-available-count').textContent =
        sel.value ? `${count} question${count !== 1 ? 's' : ''} available` : '';
    });
    sel.dispatchEvent(new Event('change'));
  }

  function _initExamForm() {
    const form = document.getElementById('exam-form');
    if (!form || form._initialized) return;
    form._initialized = true;

    form.addEventListener('submit', e => {
      e.preventDefault();
      clearFormErrors('exam-form');
      const data = {
        title: document.getElementById('exam-title').value.trim(),
        subject: document.getElementById('exam-subject').value,
        questionCount: parseInt(document.getElementById('exam-q-count').value, 10),
        timeLimitMinutes: parseInt(document.getElementById('exam-time').value, 10),
        isActive: document.getElementById('exam-active').checked,
      };

      if (!data.title) { showFieldError('exam-title', 'Required.'); return; }
      if (!data.subject) { showFieldError('exam-subject', 'Required.'); return; }
      if (!data.questionCount || data.questionCount < 1) { showFieldError('exam-q-count', 'Must be ≥ 1.'); return; }
      if (!data.timeLimitMinutes || data.timeLimitMinutes < 1) { showFieldError('exam-time', 'Must be ≥ 1.'); return; }

      let result;
      if (_editingExamId) {
        result = ExamManager.update(_editingExamId, data);
      } else {
        result = ExamManager.create(data);
      }

      if (!result.success) { showToast(result.error, 'error'); return; }
      showToast(_editingExamId ? 'Exam updated.' : 'Exam created.', 'success');
      _editingExamId = null;
      form.reset();
      document.getElementById('exam-form-title').textContent = 'Create Exam';
      document.getElementById('exam-cancel-edit').style.display = 'none';
      document.getElementById('exam-available-count').textContent = '';
      _renderExamList();
    });
  }

  function editExam(id) {
    const ex = ExamManager.getById(id);
    if (!ex) return;
    _editingExamId = id;
    document.getElementById('exam-title').value = ex.title;
    document.getElementById('exam-subject').value = ex.subject;
    document.getElementById('exam-q-count').value = ex.questionCount;
    document.getElementById('exam-time').value = ex.timeLimitMinutes;
    document.getElementById('exam-active').checked = ex.isActive;
    document.getElementById('exam-form-title').textContent = 'Edit Exam';
    document.getElementById('exam-cancel-edit').style.display = 'inline-flex';
    document.getElementById('exam-subject').dispatchEvent(new Event('change'));
    document.getElementById('exam-form').scrollIntoView({ behavior: 'smooth' });
  }

  function deleteExam(id) {
    if (!confirm('Delete this exam?')) return;
    const { success, error } = ExamManager.remove(id);
    if (success) { showToast('Exam deleted.', 'success'); _renderExamList(); }
    else showToast(error, 'error');
  }

  function toggleExam(id) {
    const { success, isActive, error } = ExamManager.toggleActive(id);
    if (success) { showToast(`Exam ${isActive ? 'activated' : 'deactivated'}.`, 'success'); _renderExamList(); }
    else showToast(error, 'error');
  }

  // ─── Results dashboard tab ───────────────────────────────────────────────────

  function _renderResultsDashboard() {
    const sel = document.getElementById('results-exam-select');
    if (!sel) return;
    const exams = ExamManager.getAll();
    const current = sel.value;
    sel.innerHTML = '<option value="">— Select an exam —</option>' +
      exams.map(e => `<option value="${e.id}">${escapeHtml(e.title)}</option>`).join('');
    if (current) sel.value = current;
    sel.dispatchEvent(new Event('change'));

    if (!sel._initialized) {
      sel._initialized = true;
      sel.addEventListener('change', () => _renderExamResults(sel.value));
    }
  }

  function _renderExamResults(examId) {
    const statsEl = document.getElementById('results-stats');
    const tableEl = document.getElementById('results-table-body');
    if (!statsEl || !tableEl) return;

    if (!examId) {
      statsEl.style.display = 'none';
      tableEl.innerHTML = '<tr><td colspan="5" class="table-empty">Select an exam to view results.</td></tr>';
      return;
    }

    statsEl.style.display = 'grid';
    const stats = ResultProcessor.getStats(examId);
    document.getElementById('stats-count').textContent = stats.count;
    document.getElementById('stats-avg').textContent = `${stats.avg}%`;
    document.getElementById('stats-highest').textContent = `${stats.highest}%`;
    document.getElementById('stats-lowest').textContent = `${stats.lowest}%`;
    document.getElementById('stats-passrate').textContent = `${stats.passRate}%`;

    const results = ResultProcessor.getExamResults(examId);
    tableEl.innerHTML = results.length === 0
      ? '<tr><td colspan="5" class="table-empty">No results for this exam yet.</td></tr>'
      : results.map(r => `
          <tr class="${r.passed ? 'row--pass' : 'row--fail'}">
            <td>${escapeHtml(r.studentUsername)}</td>
            <td>${r.score} / ${r.totalQuestions}</td>
            <td>${r.percentage}%</td>
            <td><span class="badge badge--${r.passed ? 'active' : 'inactive'}">${r.passed ? 'Pass' : 'Fail'}</span></td>
            <td>${formatDate(r.dateTaken)}</td>
          </tr>`).join('');
  }

  // ─── Settings tab ────────────────────────────────────────────────────────────

  function _renderSettings() {
    const keyInput = document.getElementById('groq-api-key');
    if (keyInput) keyInput.value = sessionStorage.getItem('groqApiKey') || '';

    const modelSel = document.getElementById('settings-model');
    if (modelSel) modelSel.value = sessionStorage.getItem('groqModel') || 'llama-3.3-70b-versatile';

    const passingEl = document.getElementById('passing-percent');
    if (passingEl) passingEl.value = sessionStorage.getItem('passingPercent') || '50';

    _updateStorageBar();

    const saveBtn = document.getElementById('settings-save-btn');
    if (saveBtn && !saveBtn._initialized) {
      saveBtn._initialized = true;
      saveBtn.addEventListener('click', () => {
        const key = document.getElementById('groq-api-key').value.trim();
        const model = document.getElementById('settings-model').value;
        const passing = parseInt(document.getElementById('passing-percent').value, 10);

        // API key goes to sessionStorage only — never localStorage
        if (key) sessionStorage.setItem('groqApiKey', key);
        else sessionStorage.removeItem('groqApiKey');

        sessionStorage.setItem('groqModel', model);

        if (!isNaN(passing) && passing >= 1 && passing <= 100) {
          sessionStorage.setItem('passingPercent', String(passing));
        }

        showToast('Settings saved.', 'success');
        _updateStorageBar();
      });
    }

    const resetBtn = document.getElementById('reset-data-btn');
    if (resetBtn && !resetBtn._initialized) {
      resetBtn._initialized = true;
      resetBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to reset ALL application data? This cannot be undone.')) return;
        if (!confirm('Second confirmation: This will delete all questions, exams, and results.')) return;
        QuestionManager.clearAll();
        ExamManager.clearAll();
        ResultProcessor.clearAll();
        await AuthManager.resetUsers();
        showToast('Application data has been reset.', 'success');
        _updateStorageBar();
      });
    }
  }

  function _updateStorageBar() {
    const { usedKB, maxKB, percent } = getStorageUsage();
    const bar = document.getElementById('storage-bar-fill');
    const label = document.getElementById('storage-bar-label');
    if (bar) bar.style.width = `${percent}%`;
    if (label) label.textContent = `${usedKB} KB / ${maxKB} KB used`;
    if (bar) {
      bar.classList.toggle('storage-bar--warning', percent > 80);
      bar.classList.toggle('storage-bar--danger', percent > 95);
    }
  }

  // ─── Student dashboard ───────────────────────────────────────────────────────

  function _renderStudentDashboard() {
    const session = AuthManager.getSession();
    if (!session || session.role !== 'student') { showView('login'); return; }

    document.getElementById('student-username-display').textContent = session.username;
    const welcomeEl = document.getElementById('student-welcome-name');
    if (welcomeEl) welcomeEl.textContent = session.username;

    const exams = ExamManager.getActive();
    const container = document.getElementById('exam-cards-container');
    if (!container) return;

    if (exams.length === 0) {
      container.innerHTML = '<p class="empty-state">No active exams available at this time.</p>';
      return;
    }

    container.innerHTML = exams.map(ex => `
      <div class="card exam-card">
        <h3 class="exam-card__title">${escapeHtml(ex.title)}</h3>
        <dl class="exam-card__meta">
          <dt>Subject</dt><dd>${escapeHtml(ex.subject)}</dd>
          <dt>Questions</dt><dd>${ex.questionCount}</dd>
          <dt>Duration</dt><dd>${ex.timeLimitMinutes} min</dd>
        </dl>
        <button class="btn btn--primary" onclick="ExamEngine.start(${JSON.stringify(ex).replace(/"/g, '&quot;')})">
          Start Exam
        </button>
      </div>`).join('');
  }

  // ─── Result view ─────────────────────────────────────────────────────────────

  ResultProcessor.showResultView = function (result, questions) {
    showView('result');
    document.getElementById('result-score').textContent = `${result.score} / ${result.totalQuestions}`;
    document.getElementById('result-percent').textContent = `${result.percentage}%`;
    const badge = document.getElementById('result-badge');
    badge.textContent = result.passed ? 'PASS' : 'FAIL';
    badge.className = `result-badge result-badge--${result.passed ? 'pass' : 'fail'}`;
    document.getElementById('result-exam-title').textContent = result.examTitle;

    const tbody = document.getElementById('result-review-body');
    tbody.innerHTML = result.responses.map((r, i) => {
      const q = questions.find(q => q.id === r.questionId);
      const optLetters = ['A', 'B', 'C', 'D'];
      const yourAnswer = r.selectedOption
        ? `${r.selectedOption}: ${escapeHtml(q?.options[optLetters.indexOf(r.selectedOption)] || '—')}`
        : '(unanswered)';
      const correctAnswer = `${r.correctOption}: ${escapeHtml(q?.options[optLetters.indexOf(r.correctOption)] || '—')}`;
      return `
        <tr class="${r.isCorrect ? 'row--pass' : 'row--fail'}">
          <td>${i + 1}</td>
          <td>${q ? escapeHtml(q.questionText) : '(question removed)'}</td>
          <td>${yourAnswer}</td>
          <td>${correctAnswer}</td>
          <td class="result-icon">${r.isCorrect ? '✓' : '✗'}</td>
        </tr>`;
    }).join('');
  };

  // ─── Utility helpers ─────────────────────────────────────────────────────────

  function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    let errEl = field.parentElement.querySelector('.field-error');
    if (!errEl) {
      errEl = document.createElement('span');
      errEl.className = 'field-error';
      field.parentElement.appendChild(errEl);
    }
    errEl.textContent = message;
    field.classList.add('field--error');
  }

  function clearFormErrors(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.querySelectorAll('.field-error').forEach(el => el.remove());
    form.querySelectorAll('.field--error').forEach(el => el.classList.remove('field--error'));
  }

  // ─── Init ────────────────────────────────────────────────────────────────────

  async function init() {
    await AuthManager.seedAdmin();
    initLoginForm();
    initRegisterForm();

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => _switchAdminTab(btn.dataset.tab));
    });

    // Subject filter
    const qFilter = document.getElementById('q-subject-filter');
    if (qFilter) {
      qFilter.addEventListener('change', () => {
        _qSubjectFilter = qFilter.value;
        _qPage = 1;
        _renderQTable();
      });
    }

    // Cancel edit buttons
    const cancelQ = document.getElementById('q-cancel-edit');
    if (cancelQ) {
      cancelQ.addEventListener('click', () => {
        _editingQuestionId = null;
        document.getElementById('question-form').reset();
        document.getElementById('q-form-title').textContent = 'Add Question';
        cancelQ.style.display = 'none';
      });
    }

    const cancelEx = document.getElementById('exam-cancel-edit');
    if (cancelEx) {
      cancelEx.addEventListener('click', () => {
        _editingExamId = null;
        document.getElementById('exam-form').reset();
        document.getElementById('exam-form-title').textContent = 'Create Exam';
        cancelEx.style.display = 'none';
        document.getElementById('exam-available-count').textContent = '';
      });
    }

    // Nav logout buttons
    document.querySelectorAll('[data-action=logout]').forEach(btn => {
      btn.addEventListener('click', () => AuthManager.logout());
    });

    // Modal close buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });

    // Timer warning OK button
    const timerOk = document.getElementById('timer-warning-ok');
    if (timerOk) timerOk.addEventListener('click', () => closeModal('timer-warning-modal'));

    // Submit confirm modal buttons
    const submitConfirm = document.getElementById('submit-confirm-yes');
    if (submitConfirm) submitConfirm.addEventListener('click', () => ExamEngine.submitNow());
    const submitCancel = document.getElementById('submit-confirm-cancel');
    if (submitCancel) submitCancel.addEventListener('click', () => closeModal('submit-confirm-modal'));

    // Exam navigation buttons
    const btnPrev = document.getElementById('btn-prev');
    if (btnPrev) btnPrev.addEventListener('click', () => ExamEngine.navigate('prev'));
    const btnNext = document.getElementById('btn-next');
    if (btnNext) btnNext.addEventListener('click', () => ExamEngine.navigate('next'));
    const btnSubmit = document.getElementById('btn-submit');
    if (btnSubmit) btnSubmit.addEventListener('click', () => ExamEngine.confirmSubmit());

    // Back to dashboard from result
    const backBtn = document.getElementById('result-back-btn');
    if (backBtn) backBtn.addEventListener('click', () => showView('student-dashboard'));

    // Check existing session
    const session = AuthManager.getSession();
    if (session) {
      if (session.role === 'admin') showView('admin-dashboard');
      else showView('student-dashboard');
    } else {
      showView('login');
    }
  }

  return {
    init,
    showView,
    showModal,
    closeModal,
    editQuestion,
    deleteQuestion,
    editExam,
    deleteExam,
    toggleExam,
    showFieldError,
    clearFormErrors,
  };
})();

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => UIController.init());

// Expose to window for inline onclick handlers
window.UIController = UIController;
window.ExamEngine = ExamEngine;
window.QuestionManager = QuestionManager;

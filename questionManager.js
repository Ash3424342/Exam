/**
 * questionManager.js
 * Purpose: Question bank CRUD, filtering, pagination, and bulk import logic
 * Key exports: QuestionManager (object with all public methods)
 */

'use strict';

const QuestionManager = (() => {
  const STORE_KEY = 'questionBank';

  // ─── Private helpers ────────────────────────────────────────────────────────

  /** @returns {Array} All questions from localStorage */
  function _load() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
    } catch {
      return [];
    }
  }

  /** @param {Array} questions - Persist questions array to localStorage */
  function _save(questions) {
    return storageGuard(() => {
      localStorage.setItem(STORE_KEY, JSON.stringify(questions));
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Adds a new question to the bank.
   * @param {{ subject, questionText, options, correctAnswer }} data
   * @returns {{ success: boolean, error?: string, question?: object }}
   */
  function addQuestion(data) {
    const { subject, questionText, options, correctAnswer } = data;

    // Validate required fields
    if (!subject || !subject.trim()) return { success: false, error: 'Subject is required.' };
    if (!questionText || !questionText.trim()) return { success: false, error: 'Question text is required.' };
    if (!Array.isArray(options) || options.length !== 4 || options.some(o => !o || !o.trim())) {
      return { success: false, error: 'All four options (A, B, C, D) are required.' };
    }
    if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) {
      return { success: false, error: 'Correct answer must be A, B, C, or D.' };
    }

    const questions = _load();

    // Duplicate detection on question text (case-insensitive)
    const duplicate = questions.find(
      q => q.questionText.trim().toLowerCase() === questionText.trim().toLowerCase()
    );
    if (duplicate) {
      return { success: false, error: 'A question with this text already exists.' };
    }

    const question = {
      id: generateId(),
      subject: subject.trim(),
      questionText: questionText.trim(),
      options: options.map(o => o.trim()),
      correctAnswer,
      createdAt: new Date().toISOString(),
    };

    questions.push(question);
    const saved = _save(questions);
    if (!saved) return { success: false, error: 'Failed to save question to storage.' };

    return { success: true, question };
  }

  /**
   * Updates an existing question by ID.
   * @param {string} id
   * @param {{ subject, questionText, options, correctAnswer }} data
   * @returns {{ success: boolean, error?: string }}
   */
  function updateQuestion(id, data) {
    const { subject, questionText, options, correctAnswer } = data;

    if (!subject || !subject.trim()) return { success: false, error: 'Subject is required.' };
    if (!questionText || !questionText.trim()) return { success: false, error: 'Question text is required.' };
    if (!Array.isArray(options) || options.length !== 4 || options.some(o => !o || !o.trim())) {
      return { success: false, error: 'All four options (A, B, C, D) are required.' };
    }
    if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) {
      return { success: false, error: 'Correct answer must be A, B, C, or D.' };
    }

    const questions = _load();
    const idx = questions.findIndex(q => q.id === id);
    if (idx === -1) return { success: false, error: 'Question not found.' };

    // Duplicate check (exclude self)
    const duplicate = questions.find(
      (q, i) =>
        i !== idx &&
        q.questionText.trim().toLowerCase() === questionText.trim().toLowerCase()
    );
    if (duplicate) return { success: false, error: 'Another question with this text already exists.' };

    questions[idx] = {
      ...questions[idx],
      subject: subject.trim(),
      questionText: questionText.trim(),
      options: options.map(o => o.trim()),
      correctAnswer,
    };

    const saved = _save(questions);
    return saved ? { success: true } : { success: false, error: 'Failed to save to storage.' };
  }

  /**
   * Deletes a question by ID.
   * @param {string} id
   * @returns {{ success: boolean, error?: string }}
   */
  function deleteQuestion(id) {
    const questions = _load();
    const filtered = questions.filter(q => q.id !== id);
    if (filtered.length === questions.length) {
      return { success: false, error: 'Question not found.' };
    }
    const saved = _save(filtered);
    return saved ? { success: true } : { success: false, error: 'Failed to save to storage.' };
  }

  /**
   * Returns all questions, optionally filtered by subject.
   * @param {string} [subject] - Subject to filter by (empty/undefined = all)
   * @returns {Array}
   */
  function getQuestions(subject) {
    const questions = _load();
    if (!subject || subject === '__all__') return questions;
    return questions.filter(q => q.subject === subject);
  }

  /**
   * Returns a single question by ID.
   * @param {string} id
   * @returns {object|null}
   */
  function getQuestionById(id) {
    return _load().find(q => q.id === id) || null;
  }

  /**
   * Returns a sorted, deduplicated list of all subjects in the bank.
   * @returns {string[]}
   */
  function getSubjects() {
    const questions = _load();
    const subjects = [...new Set(questions.map(q => q.subject))];
    return subjects.sort();
  }

  /**
   * Returns count of questions for a specific subject.
   * @param {string} subject
   * @returns {number}
   */
  function getCountBySubject(subject) {
    return _load().filter(q => q.subject === subject).length;
  }

  /**
   * Paginates a question array.
   * @param {Array} questions - Source array to paginate
   * @param {number} page - 1-based page index
   * @param {number} [perPage=10]
   * @returns {{ items: Array, totalPages: number, currentPage: number, total: number }}
   */
  function paginate(questions, page, perPage = 10) {
    const total = questions.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const start = (currentPage - 1) * perPage;
    return {
      items: questions.slice(start, start + perPage),
      totalPages,
      currentPage,
      total,
    };
  }

  /**
   * Bulk-imports an array of question objects (from JSON).
   * Validates each item; skips duplicates and invalid items.
   * @param {Array} rawItems - Array of raw question objects
   * @returns {{ inserted: number, skipped: number, errors: string[] }}
   */
  function bulkImport(rawItems) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return { inserted: 0, skipped: 0, errors: ['Input must be a non-empty JSON array.'] };
    }

    let inserted = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i];
      const label = `Item ${i + 1}`;

      const result = addQuestion({
        subject: item.subject,
        questionText: item.questionText,
        options: item.options,
        correctAnswer: item.correctAnswer,
      });

      if (result.success) {
        inserted++;
      } else {
        if (result.error && result.error.includes('already exists')) {
          skipped++;
        } else {
          errors.push(`${label}: ${result.error}`);
        }
      }
    }

    return { inserted, skipped, errors };
  }

  /**
   * Clears all questions (used by reset function).
   */
  function clearAll() {
    storageGuard(() => localStorage.removeItem(STORE_KEY));
  }

  return {
    addQuestion,
    updateQuestion,
    deleteQuestion,
    getQuestions,
    getQuestionById,
    getSubjects,
    getCountBySubject,
    paginate,
    bulkImport,
    clearAll,
  };
})();

/**
 * aiGenerator.js
 * Purpose: Groq API integration for AI-powered question generation
 * Key exports: generateQuestionsFromGroq, parseGroqResponse
 */

'use strict';

const AI_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT =
  'You are a question generator. Return ONLY a valid JSON array. No markdown, no explanation, no code fences. ' +
  'Each element: { "question": string, "options": [string, string, string, string], "answer": string } ' +
  'where answer is the exact text of the correct option.';

/**
 * Builds the user message for a Groq API request.
 * @param {string} topic - Subject/topic for question generation
 * @param {number} count - Number of questions to generate
 * @returns {string} Formatted user message
 */
function buildUserMessage(topic, count) {
  return `Generate ${count} multiple choice questions on the topic: ${topic}`;
}

/**
 * Multi-pass parser for Groq response text.
 * Handles markdown fences, extracts JSON arrays, and validates structure.
 * @param {string} rawText - Raw response string from API
 * @returns {{ questions: Array, error: string|null }}
 */
function parseGroqResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { questions: [], error: 'Empty response received from API.' };
  }

  // Pass 1: Strip markdown code fences
  let cleaned = rawText.replace(/```json|```/g, '').trim();

  // Pass 2: Attempt direct JSON.parse
  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch (_) {
    // Pass 3: Regex-extract first [...] block
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (e) {
        return {
          questions: [],
          error: `JSON parse failed. Raw excerpt: ${rawText.slice(0, 200)}`,
        };
      }
    } else {
      return {
        questions: [],
        error: `No JSON array found. Raw excerpt: ${rawText.slice(0, 200)}`,
      };
    }
  }

  if (!Array.isArray(parsed)) {
    return { questions: [], error: 'API response is not a JSON array.' };
  }

  // Validate and normalise each item
  const valid = [];
  const invalid = [];

  for (const item of parsed) {
    // Support both 'answer' and 'correctAnswer' keys
    const answerText = item.answer ?? item.correctAnswer ?? null;

    if (
      typeof item.question !== 'string' ||
      !item.question.trim() ||
      !Array.isArray(item.options) ||
      item.options.length !== 4 ||
      item.options.some(o => typeof o !== 'string' || !o.trim()) ||
      typeof answerText !== 'string' ||
      !item.options.includes(answerText)
    ) {
      invalid.push(item);
      continue;
    }

    valid.push({
      question: item.question.trim(),
      options: item.options.map(o => o.trim()),
      answer: answerText.trim(),
    });
  }

  if (valid.length === 0) {
    return {
      questions: [],
      error: `No valid questions found. ${invalid.length} items failed validation.`,
    };
  }

  return { questions: valid, error: null };
}

/**
 * Calls the Groq API to generate multiple-choice questions and saves them to the question bank.
 * @param {string} topic - Topic string for the questions
 * @param {number} count - Number of questions to request
 * @param {string} subject - Subject label to tag saved questions with
 * @param {string} [model='llama-3.3-70b-versatile'] - Groq model to use
 * @returns {Promise<{ inserted: number, errors: string[] }>}
 */
async function generateQuestionsFromGroq(topic, count, subject, model) {
  const apiKey = sessionStorage.getItem('groqApiKey');
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Groq API key not set. Please add your API key in Settings.');
  }

  const selectedModel = model || sessionStorage.getItem('groqModel') || 'llama-3.3-70b-versatile';

  const requestBody = {
    model: selectedModel,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(topic, count) },
    ],
    temperature: 0.7,
    max_tokens: 4096,
  };

  let response;
  try {
    response = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (networkErr) {
    throw new Error(
      'Network error connecting to Groq API. Check your internet connection.'
    );
  }

  if (!response.ok) {
    let detail = '';
    try {
      const errBody = await response.json();
      detail = errBody?.error?.message || '';
    } catch (_) {}

    if (response.status === 401) {
      throw new Error('Invalid Groq API key (401). Please check your key in Settings.');
    }
    if (response.status === 429) {
      throw new Error('Groq API rate limit exceeded (429). Please wait and try again.');
    }
    throw new Error(`Groq API error ${response.status}: ${detail || response.statusText}`);
  }

  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content ?? '';

  const { questions, error } = parseGroqResponse(rawText);
  if (error && questions.length === 0) {
    throw new Error(error);
  }

  // Insert valid questions into questionBank via QuestionManager
  const errors = [];
  let inserted = 0;

  for (const q of questions) {
    // Map answer text → letter (A/B/C/D)
    const letterIndex = q.options.indexOf(q.answer);
    const correctAnswerLetter = ['A', 'B', 'C', 'D'][letterIndex];

    try {
      const result = window.QuestionManager.addQuestion({
        subject: subject || topic,
        questionText: q.question,
        options: q.options,
        correctAnswer: correctAnswerLetter,
      });
      if (result.success) {
        inserted++;
      } else {
        errors.push(result.error || 'Unknown save error');
      }
    } catch (e) {
      errors.push(e.message);
    }
  }

  if (error && questions.length > 0) {
    errors.push(`Note: ${questions.length - inserted} items failed partial validation.`);
  }

  return { inserted, errors };
}

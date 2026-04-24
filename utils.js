/**
 * utils.js
 * Purpose: Shared utility functions for the Online Examination Portal
 * Key exports: hashPassword, randomSample, formatDate, storageGuard, generateId, showToast, showSpinner, hideSpinner
 */

'use strict';

/**
 * Hashes a password string using SHA-256 via the Web Crypto API.
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns a random sample of `count` items from `array` using Fisher-Yates shuffle.
 * @param {Array} array - Source array
 * @param {number} count - Number of items to sample
 * @returns {Array} Shuffled subset of `array`
 */
function randomSample(array, count) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(count, arr.length));
}

/**
 * Formats an ISO date string (or Date object) into a readable locale string.
 * @param {string|Date} dateInput - ISO string or Date object
 * @returns {string} Formatted date/time string
 */
function formatDate(dateInput) {
  if (!dateInput) return '—';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Wraps a localStorage write in try/catch; shows a toast on QuotaExceededError.
 * @param {Function} writeFn - Function performing the localStorage write
 * @returns {boolean} True if write succeeded, false otherwise
 */
function storageGuard(writeFn) {
  try {
    writeFn();
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      showToast('Storage quota exceeded. Please free space or reset data.', 'error');
    } else {
      console.error('[storageGuard] Unexpected write error:', err);
      showToast('Storage write failed. Please try again.', 'error');
    }
    return false;
  }
}

/**
 * Generates a simple unique ID (timestamp + random hex).
 * @returns {string} Unique identifier string
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Displays a toast notification in the bottom-right corner.
 * @param {string} message - Text to display
 * @param {'success'|'error'|'info'|'warning'} type - Toast variant
 * @param {number} [duration=3000] - Auto-dismiss delay in ms
 */
function showToast(message, type = 'info', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Trigger enter animation
  requestAnimationFrame(() => toast.classList.add('toast--visible'));

  setTimeout(() => {
    toast.classList.remove('toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

/**
 * Shows the full-page loading spinner overlay.
 * @param {string} [message='Loading…'] - Optional loading message
 */
function showSpinner(message = 'Loading…') {
  let overlay = document.getElementById('spinner-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'spinner-overlay';
    overlay.innerHTML = `
      <div class="spinner-box">
        <div class="spinner"></div>
        <p class="spinner-message"></p>
      </div>`;
    document.body.appendChild(overlay);
  }
  overlay.querySelector('.spinner-message').textContent = message;
  overlay.classList.add('spinner-overlay--visible');
}

/**
 * Hides the full-page loading spinner overlay.
 */
function hideSpinner() {
  const overlay = document.getElementById('spinner-overlay');
  if (overlay) overlay.classList.remove('spinner-overlay--visible');
}

/**
 * Escapes HTML special characters to prevent XSS in dynamically inserted content.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Returns storage usage info for localStorage.
 * NOTE: The maxKB of 5120 (5 MB) reflects the common Safari/mobile default.
 * Chrome and Firefox allow up to 10 MB. The bar is conservative — actual
 * available space may be larger on desktop browsers.
 * @returns {{ usedKB: number, maxKB: number, percent: number }}
 */
function getStorageUsage() {
  let total = 0;
  for (const key in localStorage) {
    if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
      total += (localStorage[key].length + key.length) * 2; // UTF-16 bytes
    }
  }
  const usedKB = Math.round(total / 1024);
  const maxKB = 5120;
  return { usedKB, maxKB, percent: Math.min(100, (usedKB / maxKB) * 100) };
}

// Attach global error handler for unhandled errors
window.addEventListener('error', (event) => {
  console.error('[Unhandled Error]', event.error);
  showToast('Something went wrong', 'error');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason);
  showToast('Something went wrong', 'error');
});

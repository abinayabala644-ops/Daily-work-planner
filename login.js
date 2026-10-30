(function () {
  'use strict';

  let isSignUpMode = false;
  let supabaseClient = null;

  const authTitle = document.getElementById('auth-title');
  const authSubtitle = document.getElementById('auth-subtitle');
  const authForm = document.getElementById('auth-form');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const togglePasswordCheckbox = document.getElementById('toggle-password');
  const authSubmitBtn = document.getElementById('auth-submit-btn');
  const toggleModeBtn = document.getElementById('toggle-mode-btn');
  const authMessage = document.getElementById('auth-message');

  function areKeysPlaceholder() {
    return (
      typeof SUPABASE_URL === 'undefined' ||
      typeof SUPABASE_ANON_KEY === 'undefined' ||
      !SUPABASE_URL ||
      !SUPABASE_ANON_KEY ||
      SUPABASE_URL === 'PASTE_PROJECT_URL_HERE' ||
      SUPABASE_ANON_KEY === 'PASTE_ANON_KEY_HERE'
    );
  }

  function initSupabase() {
    if (areKeysPlaceholder()) {
      return null;
    }
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      try {
        return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      } catch (e) {
        console.error('Supabase init error:', e);
        return null;
      }
    }
    return null;
  }

  supabaseClient = initSupabase();

  // If user already has a session, go straight to index.html
  if (supabaseClient) {
    supabaseClient.auth.getSession().then(({ data }) => {
      if (data && data.session) {
        window.location.replace('index.html');
      }
    }).catch(() => {
      // Ignore session check error on load
    });
  }

  function clearMessage() {
    authMessage.textContent = '';
    authMessage.className = 'message-area';
    authMessage.style.display = 'none';
  }

  function showError(text) {
    authMessage.textContent = text;
    authMessage.className = 'message-area error';
    authMessage.style.display = 'block';
  }

  function showSuccess(text) {
    authMessage.textContent = text;
    authMessage.className = 'message-area success';
    authMessage.style.display = 'block';
  }

  function isValidEmail(email) {
    // Basic regex checking email structure
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function updateModeUI() {
    clearMessage();
    if (isSignUpMode) {
      authTitle.textContent = 'Create your account';
      authSubtitle.textContent = 'Sign up to start planning';
      authSubmitBtn.textContent = 'Create account';
      passwordInput.setAttribute('autocomplete', 'new-password');
      toggleModeBtn.textContent = 'Already have an account? Sign in';
    } else {
      authTitle.textContent = 'Daily Work Planner';
      authSubtitle.textContent = 'Sign in to continue';
      authSubmitBtn.textContent = 'Sign in';
      passwordInput.setAttribute('autocomplete', 'current-password');
      toggleModeBtn.textContent = 'Create account';
    }
  }

  // Toggle Password Visibility
  togglePasswordCheckbox.addEventListener('change', () => {
    passwordInput.type = togglePasswordCheckbox.checked ? 'text' : 'password';
  });

  // Toggle Mode (Sign In vs Create Account)
  toggleModeBtn.addEventListener('click', () => {
    isSignUpMode = !isSignUpMode;
    updateModeUI();
  });

  // Form submission
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();

    if (areKeysPlaceholder()) {
      showError('Sign-in is not set up yet.');
      return;
    }

    if (!supabaseClient) {
      supabaseClient = initSupabase();
      if (!supabaseClient) {
        showError('Sign-in is not set up yet.');
        return;
      }
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email) {
      showError('Please enter your email.');
      emailInput.focus();
      return;
    }

    if (!isValidEmail(email)) {
      showError('Please enter a valid email address.');
      emailInput.focus();
      return;
    }

    if (!password) {
      showError('Please enter your password.');
      passwordInput.focus();
      return;
    }

    if (isSignUpMode && password.length < 8) {
      showError('Password must have at least 8 characters.');
      passwordInput.focus();
      return;
    }

    // Disable button & show waiting
    authSubmitBtn.disabled = true;
    const originalBtnText = authSubmitBtn.textContent;
    authSubmitBtn.textContent = 'Please wait…';

    try {
      if (isSignUpMode) {
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
        });

        if (error) {
          // If the email already exists or signup failed
          showError('Could not create the account. Try signing in.');
        } else if (data && data.session) {
          // Session returned directly
          window.location.replace('index.html');
          return;
        } else {
          // Email confirmation is on
          showSuccess('Account created. Check your email to confirm it, then sign in.');
          isSignUpMode = false;
          updateModeUI();
          passwordInput.value = '';
        }
      } else {
        const { error } = await supabaseClient.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          showError('Wrong email or password.');
        } else {
          window.location.replace('index.html');
          return;
        }
      }
    } catch (err) {
      if (isSignUpMode) {
        showError('Could not create the account. Try signing in.');
      } else {
        showError('Wrong email or password.');
      }
    } finally {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = originalBtnText;
    }
  });
})();

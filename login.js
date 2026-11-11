(function () {
  'use strict';

  // currentMode: 'signin' | 'signup' | 'forgot' | 'reset'
  let currentMode = 'signin';
  let supabaseClient = null;

  const authTitle = document.getElementById('auth-title');
  const authSubtitle = document.getElementById('auth-subtitle');
  const authForm = document.getElementById('auth-form');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const passwordLabel = document.getElementById('auth-password-label');
  const groupPassword = document.getElementById('group-password');
  const groupShowPassword = document.getElementById('group-show-password');
  const togglePasswordCheckbox = document.getElementById('toggle-password');
  const authSubmitBtn = document.getElementById('auth-submit-btn');
  const toggleModeBtn = document.getElementById('toggle-mode-btn');
  const backToSignInBtn = document.getElementById('back-to-signin-btn');
  const forgotPasswordLink = document.getElementById('forgot-password-link');
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

  // Check if URL has password recovery hash/params
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  const isRecoveryHash = hash.includes('type=recovery') || search.includes('type=recovery');

  if (isRecoveryHash) {
    currentMode = 'reset';
  }

  // If user already has a session, go straight to index.html (UNLESS in password reset mode)
  if (supabaseClient && currentMode !== 'reset') {
    supabaseClient.auth.getSession().then(({ data }) => {
      if (data && data.session) {
        window.location.replace('index.html');
      }
    }).catch(() => {
      // Ignore session check error on load
    });
  }

  // Also listen for auth state changes (e.g. password recovery event)
  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        currentMode = 'reset';
        updateModeUI();
      }
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
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function updateModeUI() {
    clearMessage();

    // Reset password visibility
    if (togglePasswordCheckbox) {
      togglePasswordCheckbox.checked = false;
      passwordInput.type = 'password';
    }

    if (currentMode === 'signup') {
      authTitle.textContent = 'Create your account';
      authSubtitle.textContent = 'Sign up to start planning';
      authSubmitBtn.textContent = 'Create account';
      if (groupPassword) groupPassword.style.display = 'block';
      if (groupShowPassword) groupShowPassword.style.display = 'flex';
      if (passwordLabel) passwordLabel.textContent = 'Password';
      if (forgotPasswordLink) forgotPasswordLink.style.display = 'none';
      if (emailInput.parentElement) emailInput.parentElement.style.display = 'block';
      passwordInput.setAttribute('autocomplete', 'new-password');
      passwordInput.placeholder = '••••••••';
      if (toggleModeBtn) {
        toggleModeBtn.style.display = 'inline-flex';
        toggleModeBtn.textContent = 'Already have an account? Sign in';
      }
      if (backToSignInBtn) backToSignInBtn.style.display = 'none';
    } else if (currentMode === 'forgot') {
      authTitle.textContent = 'Reset your password';
      authSubtitle.textContent = 'Enter your email to receive a password reset link';
      authSubmitBtn.textContent = 'Send reset link';
      if (groupPassword) groupPassword.style.display = 'none';
      if (emailInput.parentElement) emailInput.parentElement.style.display = 'block';
      if (toggleModeBtn) toggleModeBtn.style.display = 'none';
      if (backToSignInBtn) backToSignInBtn.style.display = 'inline-flex';
    } else if (currentMode === 'reset') {
      authTitle.textContent = 'Set new password';
      authSubtitle.textContent = 'Enter a new password for your account';
      authSubmitBtn.textContent = 'Update password';
      // Hide email input, show new password input
      if (emailInput.parentElement) emailInput.parentElement.style.display = 'none';
      if (groupPassword) groupPassword.style.display = 'block';
      if (groupShowPassword) groupShowPassword.style.display = 'flex';
      if (passwordLabel) passwordLabel.textContent = 'New Password';
      if (forgotPasswordLink) forgotPasswordLink.style.display = 'none';
      passwordInput.setAttribute('autocomplete', 'new-password');
      passwordInput.placeholder = 'At least 8 characters';
      passwordInput.value = '';
      if (toggleModeBtn) toggleModeBtn.style.display = 'none';
      if (backToSignInBtn) backToSignInBtn.style.display = 'inline-flex';
    } else {
      // 'signin' mode
      currentMode = 'signin';
      authTitle.textContent = 'Daily Work Planner';
      authSubtitle.textContent = 'Sign in to continue';
      authSubmitBtn.textContent = 'Sign in';
      if (emailInput.parentElement) emailInput.parentElement.style.display = 'block';
      if (groupPassword) groupPassword.style.display = 'block';
      if (groupShowPassword) groupShowPassword.style.display = 'flex';
      if (passwordLabel) passwordLabel.textContent = 'Password';
      if (forgotPasswordLink) forgotPasswordLink.style.display = 'inline';
      passwordInput.setAttribute('autocomplete', 'current-password');
      passwordInput.placeholder = '••••••••';
      if (toggleModeBtn) {
        toggleModeBtn.style.display = 'inline-flex';
        toggleModeBtn.textContent = 'Create account';
      }
      if (backToSignInBtn) backToSignInBtn.style.display = 'none';
    }
  }

  // Toggle Password Visibility
  togglePasswordCheckbox.addEventListener('change', () => {
    passwordInput.type = togglePasswordCheckbox.checked ? 'text' : 'password';
  });

  // Toggle Mode (Sign In vs Create Account)
  toggleModeBtn.addEventListener('click', () => {
    if (currentMode === 'signup') {
      currentMode = 'signin';
    } else {
      currentMode = 'signup';
    }
    updateModeUI();
  });

  // Forgot Password click
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', () => {
      currentMode = 'forgot';
      updateModeUI();
      emailInput.focus();
    });
  }

  // Back to Sign In click
  if (backToSignInBtn) {
    backToSignInBtn.addEventListener('click', () => {
      currentMode = 'signin';
      updateModeUI();
      emailInput.focus();
    });
  }

  // Form submission
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();

    if (areKeysPlaceholder()) {
      showError('Authentication is not set up yet.');
      return;
    }

    if (!supabaseClient) {
      supabaseClient = initSupabase();
      if (!supabaseClient) {
        showError('Authentication is not set up yet.');
        return;
      }
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    // --- 1. FORGOT PASSWORD MODE ---
    if (currentMode === 'forgot') {
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

      authSubmitBtn.disabled = true;
      const originalText = authSubmitBtn.textContent;
      authSubmitBtn.textContent = 'Sending link…';

      try {
        const redirectTo = window.location.origin + window.location.pathname;
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
          redirectTo,
        });

        if (error) {
          showError('Could not send reset link. Please check your email and try again.');
        } else {
          showSuccess('Password reset link sent! Check your email inbox and spam folder.');
        }
      } catch (err) {
        showError('Could not send reset link. Please check your email and try again.');
      } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.textContent = originalText;
      }
      return;
    }

    // --- 2. SET NEW PASSWORD MODE (From recovery link) ---
    if (currentMode === 'reset') {
      if (!password) {
        showError('Please enter your new password.');
        passwordInput.focus();
        return;
      }
      if (password.length < 8) {
        showError('Password must have at least 8 characters.');
        passwordInput.focus();
        return;
      }

      authSubmitBtn.disabled = true;
      const originalText = authSubmitBtn.textContent;
      authSubmitBtn.textContent = 'Updating…';

      try {
        const { error } = await supabaseClient.auth.updateUser({
          password,
        });

        if (error) {
          showError('Could not update password. The reset link may have expired.');
        } else {
          showSuccess('Password updated successfully! Redirecting to your planner…');
          // Clean hash from URL
          if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', window.location.pathname);
          }
          setTimeout(() => {
            window.location.replace('index.html');
          }, 1500);
          return;
        }
      } catch (err) {
        showError('Could not update password. Please try again.');
      } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.textContent = originalText;
      }
      return;
    }

    // --- 3. SIGN IN / SIGN UP MODES ---
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

    if (currentMode === 'signup' && password.length < 8) {
      showError('Password must have at least 8 characters.');
      passwordInput.focus();
      return;
    }

    // Disable button & show waiting
    authSubmitBtn.disabled = true;
    const originalBtnText = authSubmitBtn.textContent;
    authSubmitBtn.textContent = 'Please wait…';

    try {
      if (currentMode === 'signup') {
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
        });

        if (error) {
          showError('Could not create the account. Try signing in.');
        } else if (data && data.session) {
          window.location.replace('index.html');
          return;
        } else {
          showSuccess('Account created. Check your email to confirm it, then sign in.');
          currentMode = 'signin';
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
      if (currentMode === 'signup') {
        showError('Could not create the account. Try signing in.');
      } else {
        showError('Wrong email or password.');
      }
    } finally {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = originalBtnText;
    }
  });

  // Initial UI state setup
  updateModeUI();
})();

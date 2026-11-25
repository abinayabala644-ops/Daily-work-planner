(function () {
  'use strict';

  // currentMode: 'signin' | 'signup' | 'forgot' | 'reset'
  let currentMode = 'signin';
  let supabaseClient = null;

  const authTitle = document.getElementById('auth-title');
  const authSubtitle = document.getElementById('auth-subtitle');
  const googleAuthContainer = document.getElementById('google-auth-container');
  const googleAuthBtn = document.getElementById('google-auth-btn');
  const authForm = document.getElementById('auth-form');

  const groupFullName = document.getElementById('group-fullname');
  const fullNameInput = document.getElementById('auth-fullname');

  const groupEmail = document.getElementById('group-email');
  const emailInput = document.getElementById('auth-email');

  const groupPassword = document.getElementById('group-password');
  const passwordInput = document.getElementById('auth-password');
  const passwordLabel = document.getElementById('auth-password-label');
  const forgotPasswordLink = document.getElementById('forgot-password-link');

  const groupConfirmPassword = document.getElementById('group-confirm-password');
  const confirmPasswordInput = document.getElementById('auth-confirm-password');
  const confirmPasswordLabel = document.getElementById('auth-confirm-password-label');

  const groupShowPassword = document.getElementById('group-show-password');
  const togglePasswordCheckbox = document.getElementById('toggle-password');

  const authSubmitBtn = document.getElementById('auth-submit-btn');
  const authSubmitSpinner = document.getElementById('auth-submit-spinner');
  const authSubmitText = document.getElementById('auth-submit-text');

  const togglePromptText = document.getElementById('toggle-prompt-text');
  const toggleModeBtn = document.getElementById('toggle-mode-btn');
  const backToSignInBtn = document.getElementById('back-to-signin-btn');
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

  // Check URL params for errors or recovery mode
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  const urlParams = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''));

  const isRecoveryHash =
    hash.includes('type=recovery') ||
    search.includes('type=recovery') ||
    urlParams.get('type') === 'recovery' ||
    hashParams.get('type') === 'recovery';

  if (isRecoveryHash) {
    currentMode = 'reset';
  }

  // Handle Google OAuth error returned in URL hash or search
  const authErrorDesc = hashParams.get('error_description') || urlParams.get('error_description');
  if (authErrorDesc) {
    showError(decodeURIComponent(authErrorDesc.replace(/\+/g, ' ')));
  }

  // If user already has an active session, redirect to index.html (unless in recovery/reset mode)
  if (supabaseClient && currentMode !== 'reset') {
    supabaseClient.auth.getSession().then(({ data }) => {
      if (data && data.session && data.session.user) {
        window.location.replace('index.html');
      }
    }).catch(() => {
      // Ignore session check error on initial page load
    });
  }

  // Listen for Supabase auth state changes (e.g. password recovery or OAuth callback redirect)
  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        currentMode = 'reset';
        updateModeUI();
      } else if (event === 'SIGNED_IN' && session && session.user && currentMode !== 'reset') {
        window.location.replace('index.html');
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

  function setLoading(isLoading, loadingText) {
    if (isLoading) {
      authSubmitBtn.disabled = true;
      if (googleAuthBtn) googleAuthBtn.disabled = true;
      if (authSubmitSpinner) authSubmitSpinner.style.display = 'inline-block';
      if (authSubmitText) authSubmitText.textContent = loadingText || 'Please wait…';
    } else {
      authSubmitBtn.disabled = false;
      if (googleAuthBtn) googleAuthBtn.disabled = false;
      if (authSubmitSpinner) authSubmitSpinner.style.display = 'none';
    }
  }

  function updateModeUI() {
    clearMessage();

    // Reset password visibility checkbox
    if (togglePasswordCheckbox) {
      togglePasswordCheckbox.checked = false;
      if (passwordInput) passwordInput.type = 'password';
      if (confirmPasswordInput) confirmPasswordInput.type = 'password';
    }

    if (currentMode === 'signup') {
      authTitle.textContent = 'Daily Work Planner';
      authSubtitle.textContent = 'Create your account to get started';
      if (authSubmitText) authSubmitText.textContent = 'Create Account';

      if (googleAuthContainer) googleAuthContainer.style.display = 'block';
      if (groupFullName) groupFullName.style.display = 'block';
      if (groupEmail) groupEmail.style.display = 'block';
      if (groupPassword) groupPassword.style.display = 'block';
      if (groupConfirmPassword) groupConfirmPassword.style.display = 'block';
      if (groupShowPassword) groupShowPassword.style.display = 'block';

      if (passwordLabel) passwordLabel.textContent = 'Password';
      if (confirmPasswordLabel) confirmPasswordLabel.textContent = 'Confirm Password';
      if (forgotPasswordLink) forgotPasswordLink.style.display = 'none';

      passwordInput.setAttribute('autocomplete', 'new-password');
      passwordInput.placeholder = 'At least 8 characters';

      if (togglePromptText) togglePromptText.textContent = 'Already have an account?';
      if (toggleModeBtn) {
        toggleModeBtn.style.display = 'inline-flex';
        toggleModeBtn.textContent = 'Sign In';
      }
      if (backToSignInBtn) backToSignInBtn.style.display = 'none';

    } else if (currentMode === 'forgot') {
      authTitle.textContent = 'Daily Work Planner';
      authSubtitle.textContent = 'Enter your email to receive a password reset link';
      if (authSubmitText) authSubmitText.textContent = 'Send Reset Link';

      if (googleAuthContainer) googleAuthContainer.style.display = 'none';
      if (groupFullName) groupFullName.style.display = 'none';
      if (groupEmail) groupEmail.style.display = 'block';
      if (groupPassword) groupPassword.style.display = 'none';
      if (groupConfirmPassword) groupConfirmPassword.style.display = 'none';
      if (groupShowPassword) groupShowPassword.style.display = 'none';

      if (togglePromptText) togglePromptText.textContent = '';
      if (toggleModeBtn) toggleModeBtn.style.display = 'none';
      if (backToSignInBtn) backToSignInBtn.style.display = 'inline-flex';

    } else if (currentMode === 'reset') {
      authTitle.textContent = 'Daily Work Planner';
      authSubtitle.textContent = 'Enter a new password for your account';
      if (authSubmitText) authSubmitText.textContent = 'Update Password';

      if (googleAuthContainer) googleAuthContainer.style.display = 'none';
      if (groupFullName) groupFullName.style.display = 'none';
      if (groupEmail) groupEmail.style.display = 'none';
      if (groupPassword) groupPassword.style.display = 'block';
      if (groupConfirmPassword) groupConfirmPassword.style.display = 'block';
      if (groupShowPassword) groupShowPassword.style.display = 'block';

      if (passwordLabel) passwordLabel.textContent = 'New Password';
      if (confirmPasswordLabel) confirmPasswordLabel.textContent = 'Confirm New Password';
      if (forgotPasswordLink) forgotPasswordLink.style.display = 'none';

      passwordInput.setAttribute('autocomplete', 'new-password');
      passwordInput.placeholder = 'At least 8 characters';
      passwordInput.value = '';
      if (confirmPasswordInput) confirmPasswordInput.value = '';

      if (togglePromptText) togglePromptText.textContent = '';
      if (toggleModeBtn) toggleModeBtn.style.display = 'none';
      if (backToSignInBtn) backToSignInBtn.style.display = 'inline-flex';

    } else {
      // Default: 'signin'
      currentMode = 'signin';
      authTitle.textContent = 'Daily Work Planner';
      authSubtitle.textContent = 'Sign in to continue';
      if (authSubmitText) authSubmitText.textContent = 'Sign In';

      if (googleAuthContainer) googleAuthContainer.style.display = 'block';
      if (groupFullName) groupFullName.style.display = 'none';
      if (groupEmail) groupEmail.style.display = 'block';
      if (groupPassword) groupPassword.style.display = 'block';
      if (groupConfirmPassword) groupConfirmPassword.style.display = 'none';
      if (groupShowPassword) groupShowPassword.style.display = 'block';

      if (passwordLabel) passwordLabel.textContent = 'Password';
      if (forgotPasswordLink) forgotPasswordLink.style.display = 'inline';

      passwordInput.setAttribute('autocomplete', 'current-password');
      passwordInput.placeholder = '••••••••';

      if (togglePromptText) togglePromptText.textContent = "Don't have an account?";
      if (toggleModeBtn) {
        toggleModeBtn.style.display = 'inline-flex';
        toggleModeBtn.textContent = 'Create Account';
      }
      if (backToSignInBtn) backToSignInBtn.style.display = 'none';
    }
  }

  // Toggle Password Visibility
  if (togglePasswordCheckbox) {
    togglePasswordCheckbox.addEventListener('change', () => {
      const type = togglePasswordCheckbox.checked ? 'text' : 'password';
      if (passwordInput) passwordInput.type = type;
      if (confirmPasswordInput) confirmPasswordInput.type = type;
    });
  }

  // Toggle Mode (Sign In vs Create Account)
  if (toggleModeBtn) {
    toggleModeBtn.addEventListener('click', () => {
      if (currentMode === 'signup') {
        currentMode = 'signin';
      } else {
        currentMode = 'signup';
      }
      updateModeUI();
    });
  }

  // Forgot Password Link Click
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', () => {
      currentMode = 'forgot';
      updateModeUI();
      if (emailInput) emailInput.focus();
    });
  }

  // Back to Sign In Click
  if (backToSignInBtn) {
    backToSignInBtn.addEventListener('click', () => {
      currentMode = 'signin';
      updateModeUI();
      if (emailInput) emailInput.focus();
    });
  }

  // Google OAuth Flow
  if (googleAuthBtn) {
    googleAuthBtn.addEventListener('click', async () => {
      clearMessage();

      if (areKeysPlaceholder() || !supabaseClient) {
        showError('Supabase authentication is not configured yet.');
        return;
      }

      setLoading(true, 'Connecting to Google…');

      try {
        const redirectTo = window.location.origin + window.location.pathname.replace(/login\.html$/i, '') + 'index.html';
        const { error } = await supabaseClient.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectTo,
            queryParams: {
              access_type: 'offline',
              prompt: 'select_account',
            },
          },
        });

        if (error) {
          // If Google provider is not configured in Supabase, show clear guidance
          if (error.message && (error.message.includes('not enabled') || error.message.includes('OAuth'))) {
            showError('Google Sign-In is not enabled in your Supabase project. Enable it under Authentication > Providers > Google.');
          } else {
            showError(error.message || 'Could not connect to Google. Please try again.');
          }
          setLoading(false);
          if (authSubmitText) authSubmitText.textContent = currentMode === 'signup' ? 'Create Account' : 'Sign In';
        }
      } catch (err) {
        console.error('Google OAuth error:', err);
        showError('Google authentication error. Please try again.');
        setLoading(false);
        if (authSubmitText) authSubmitText.textContent = currentMode === 'signup' ? 'Create Account' : 'Sign In';
      }
    });
  }

  // Form submission handling
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();

    if (areKeysPlaceholder() || !supabaseClient) {
      showError('Authentication is not set up yet. Please configure Supabase keys.');
      return;
    }

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';
    const fullName = fullNameInput ? fullNameInput.value.trim() : '';

    // --- 1. FORGOT PASSWORD MODE ---
    if (currentMode === 'forgot') {
      if (!email) {
        showError('Please enter your email address.');
        emailInput.focus();
        return;
      }
      if (!isValidEmail(email)) {
        showError('Please enter a valid email address.');
        emailInput.focus();
        return;
      }

      setLoading(true, 'Sending reset link…');

      try {
        const redirectTo = window.location.origin + window.location.pathname;
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
          redirectTo,
        });

        if (error) {
          showError(error.message || 'Could not send reset link. Please check your email and try again.');
        } else {
          showSuccess('Password reset link sent! Please check your email inbox and spam folder.');
        }
      } catch (err) {
        showError('Could not send reset link. Please check your email and try again.');
      } finally {
        setLoading(false);
        if (authSubmitText) authSubmitText.textContent = 'Send Reset Link';
      }
      return;
    }

    // --- 2. SET NEW PASSWORD (RESET) MODE ---
    if (currentMode === 'reset') {
      if (!password) {
        showError('Please enter your new password.');
        passwordInput.focus();
        return;
      }
      if (password.length < 8) {
        showError('Password must be at least 8 characters long.');
        passwordInput.focus();
        return;
      }
      if (!confirmPassword) {
        showError('Please confirm your new password.');
        confirmPasswordInput.focus();
        return;
      }
      if (password !== confirmPassword) {
        showError('Passwords do not match. Please re-enter.');
        confirmPasswordInput.focus();
        return;
      }

      setLoading(true, 'Updating password…');

      try {
        const { error } = await supabaseClient.auth.updateUser({
          password,
        });

        if (error) {
          showError(error.message || 'Could not update password. The reset link may have expired.');
        } else {
          showSuccess('Password updated successfully! Redirecting to your planner…');
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
        setLoading(false);
        if (authSubmitText) authSubmitText.textContent = 'Update Password';
      }
      return;
    }

    // --- 3. CREATE ACCOUNT (SIGN UP) MODE ---
    if (currentMode === 'signup') {
      if (!fullName) {
        showError('Please enter your full name.');
        fullNameInput.focus();
        return;
      }
      if (!email) {
        showError('Please enter your email address.');
        emailInput.focus();
        return;
      }
      if (!isValidEmail(email)) {
        showError('Please enter a valid email address.');
        emailInput.focus();
        return;
      }
      if (!password) {
        showError('Please enter a password.');
        passwordInput.focus();
        return;
      }
      if (password.length < 8) {
        showError('Password must be at least 8 characters long.');
        passwordInput.focus();
        return;
      }
      if (!confirmPassword) {
        showError('Please confirm your password.');
        confirmPasswordInput.focus();
        return;
      }
      if (password !== confirmPassword) {
        showError('Passwords do not match. Please re-enter.');
        confirmPasswordInput.focus();
        return;
      }

      setLoading(true, 'Creating account…');

      try {
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        });

        if (error) {
          showError(error.message || 'Could not create the account. Try signing in.');
        } else if (data && data.session && data.session.user) {
          showSuccess('Account created successfully! Redirecting to your planner…');
          setTimeout(() => {
            window.location.replace('index.html');
          }, 600);
          return;
        } else {
          showSuccess('Account created! Please check your email to confirm your account, then sign in.');
          currentMode = 'signin';
          updateModeUI();
          if (passwordInput) passwordInput.value = '';
          if (confirmPasswordInput) confirmPasswordInput.value = '';
        }
      } catch (err) {
        showError('Could not create the account. Please try again.');
      } finally {
        setLoading(false);
        if (authSubmitText) authSubmitText.textContent = currentMode === 'signup' ? 'Create Account' : 'Sign In';
      }
      return;
    }

    // --- 4. SIGN IN MODE ---
    if (!email) {
      showError('Please enter your email address.');
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

    setLoading(true, 'Signing in…');

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message && error.message.toLowerCase().includes('invalid login credentials')) {
          showError('Incorrect email or password. Please try again.');
        } else if (error.message && error.message.toLowerCase().includes('email not confirmed')) {
          showError('Email is not verified yet. Please check your inbox for the confirmation email.');
        } else {
          showError(error.message || 'Incorrect email or password.');
        }
      } else if (data && data.session) {
        window.location.replace('index.html');
        return;
      }
    } catch (err) {
      showError('Wrong email or password. Please try again.');
    } finally {
      setLoading(false);
      if (authSubmitText) authSubmitText.textContent = 'Sign In';
    }
  });

  // Initial UI state setup
  updateModeUI();

  // Reset/Empty inputs on load to prevent browser pre-filling remembered credentials
  function resetLoginFormInputs() {
    if (authForm) {
      try { authForm.reset(); } catch (e) {}
    }
    if (emailInput && currentMode !== 'reset') emailInput.value = '';
    if (passwordInput) passwordInput.value = '';
    if (confirmPasswordInput) confirmPasswordInput.value = '';
    if (fullNameInput) fullNameInput.value = '';
  }

  resetLoginFormInputs();
  setTimeout(resetLoginFormInputs, 50);
  setTimeout(resetLoginFormInputs, 200);
})();
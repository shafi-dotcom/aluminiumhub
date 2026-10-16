import { login, signup, logout, getUser, handleAuthCallback, requestPasswordRecovery, updateUser, acceptInvite, onAuthChange, MissingIdentityError } from './vendor/identity.mjs';

let currentUser = null;
let resetAllowed = false;
let inviteToken = null;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const input = (name, label, type, autocomplete, extra = '') => `<label for="auth-${name}">${label}<input id="auth-${name}" name="${name}" type="${type}" autocomplete="${autocomplete}" required ${extra}></label>`;
const message = (text, error = false) => {
  const target = document.getElementById('auth-message');
  if (target) { target.textContent = text; target.dataset.error = String(error); }
};
function errorMessage(error) {
  if (error instanceof MissingIdentityError) return 'Account services are temporarily unavailable. Please try again later.';
  if (error?.status === 401 || error?.status === 400) return 'Unable to sign in. Check your email and password, and confirm your email before trying again.';
  if (error?.status === 403) return 'This account action is currently unavailable. Please try again later.';
  if (error?.status === 429) return 'Too many attempts. Please wait a few minutes before trying again.';
  return 'Unable to complete this request. Please check your details and connection, then try again.';
}
function updateHeader() {
  document.getElementById('account-links').innerHTML = currentUser
    ? '<a href="#/account">My account</a>'
    : '<a href="#/login">Login</a> &nbsp; <a href="#/register">Register</a>';
}
window.authUI = function (page) {
  if (currentUser && ['login', 'register'].includes(page)) page = 'account';
  let title, description, body;
  if (page === 'account' && currentUser) {
    title = 'Your account'; description = 'You are signed in to Aluminium Hub.';
    body = `<p class="auth-detail"><strong>${escape(currentUser.name || 'Aluminium Hub member')}</strong><br>${escape(currentUser.email)}</p><div class="auth-actions"><a class="btn" href="#/">Explore Aluminium Hub</a><button class="btn" id="auth-logout" type="button">Log out</button></div>`;
  } else {
    if (page === 'account') page = 'login';
    const register = page === 'register';
    title = register ? 'Create your account' : page === 'forgot-password' ? 'Forgot your password?' : page === 'reset-password' ? 'Set a new password' : 'Welcome back';
    description = register ? 'Join the aluminium community in Saudi Arabia.' : page === 'forgot-password' ? 'Enter your email to receive a password reset link.' : page === 'reset-password' ? 'Choose a new password for your account.' : 'Log in with your email and password.';
    let fields = register ? input('name', 'Full name', 'text', 'name', 'maxlength="120"') : '';
    if (page !== 'reset-password') fields += input('email', 'Email address', 'email', 'email');
    if (page !== 'forgot-password') fields += input('password', 'Password', 'password', register || page === 'reset-password' ? 'new-password' : 'current-password', register || page === 'reset-password' ? 'minlength="8" aria-describedby="password-help"' : '');
    if (register || page === 'reset-password') fields += '<span class="note" id="password-help">Use at least 8 characters.</span>' + input('confirm', 'Confirm password', 'password', 'new-password', 'minlength="8"');
    body = page === 'reset-password' && !resetAllowed && !inviteToken
      ? '<p>Open the link in your recovery email to set a new password.</p><a href="#/forgot-password">Request a new link</a>'
      : `<form class="auth-form" data-auth="${page}">${fields}<button class="btn" type="submit">${register ? 'Create account' : page === 'forgot-password' ? 'Send reset link' : page === 'reset-password' ? 'Save password' : 'Log in'}</button></form>`;
    if (page === 'login') body += '<a href="#/forgot-password">Forgot password?</a><p class="note">New to Aluminium Hub? <a href="#/register">Create an account</a></p>';
    else body += '<p class="note"><a href="#/login">Back to login</a></p>';
  }
  return `<main class="wrap page"><div class="auth-layout"><aside class="auth-intro"><small>Aluminium Hub · Saudi Arabia</small><h2>Your industry.<br>Your community.</h2><p>A place for the people shaping the aluminium industry.</p><a href="#/" style="color:#a9d5ff">← Back to home</a></aside><section class="auth-content" aria-labelledby="auth-title">${!currentUser && ['login','register'].includes(page) ? `<nav class="auth-tabs" aria-label="Account"><a href="#/login" ${page === 'login' ? 'aria-current="page"' : ''}>Login</a><a href="#/register" ${page === 'register' ? 'aria-current="page"' : ''}>Register</a></nav>` : ''}<h1 id="auth-title">${title}</h1><p class="m">${description}</p><div id="auth-message" class="auth-message" role="status" aria-live="polite" tabindex="-1"></div>${body}</section></div></main>`;
};
document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-auth]');
  if (!form) return;
  event.preventDefault();
  const values = new FormData(form);
  const kind = form.dataset.auth;
  const password = values.get('password');
  if (values.has('confirm') && password !== values.get('confirm')) { message('Passwords do not match.', true); return; }
  if (kind === 'register' && !values.get('name').trim()) { message('Enter your full name.', true); return; }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  form.setAttribute('aria-busy', 'true');
  message('Please wait…');
  try {
    const email = String(values.get('email') || '').trim();
    if (kind === 'login') {
      currentUser = await login(email, password);
      updateHeader(); location.hash = '#/account';
    } else if (kind === 'register') {
      const user = await signup(email, password, { full_name: values.get('name').trim() });
      form.reset();
      if (user.emailVerified) { currentUser = await getUser(); updateHeader(); location.hash = '#/account'; }
      else message('Check your email for a confirmation link before logging in. If you already have an account, log in or reset your password.');
    } else if (kind === 'forgot-password') {
      await requestPasswordRecovery(email);
      form.reset(); message('If an account exists for this email, you’ll receive a password reset link.');
    } else if (kind === 'reset-password') {
      if (inviteToken) { currentUser = await acceptInvite(inviteToken, password); inviteToken = null; }
      else { if (!resetAllowed) throw new Error('Recovery required'); currentUser = await updateUser({ password }); }
      resetAllowed = false; updateHeader(); location.hash = '#/account';
    }
  } catch (error) { message(errorMessage(error), true); }
  finally { button.disabled = false; form.removeAttribute('aria-busy'); }
});
document.addEventListener('click', async event => {
  const button = event.target.closest('#auth-logout');
  if (!button) return;
  button.disabled = true;
  try { await logout(); currentUser = null; updateHeader(); location.hash = '#/login'; }
  catch (error) { message(errorMessage(error), true); button.disabled = false; }
});
onAuthChange(async () => {
  currentUser = await getUser(); updateHeader();
  // Leave active forms intact; refresh the account page when another tab logs out.
  if (location.hash === '#/account') window.route();
});
try {
  const result = await handleAuthCallback();
  currentUser = await getUser();
  if (result?.type === 'recovery' || result?.type === 'invite') {
    resetAllowed = result.type === 'recovery'; inviteToken = result.type === 'invite' ? result.token : null;
    location.hash = '#/reset-password';
  } else if (result) location.hash = '#/account';
  updateHeader(); window.route();
} catch (error) {
  // Remove expired callback data from the address bar and offer a usable retry path.
  history.replaceState(null, '', location.pathname + location.search + '#/login');
  updateHeader(); window.route(); message('This account link could not be verified. Try logging in or request a new password reset link.', true);
}

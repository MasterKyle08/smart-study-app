document.addEventListener('DOMContentLoaded', () => {
  const gate = document.getElementById('adminGate');
  const app = document.getElementById('adminApp');
  const gateMessage = document.getElementById('gateMessage');
  let selectedUserId = null;

  function showGateMsg(message, type = 'error') {
    if (typeof showMessage === 'function') showMessage('gateMessage', message, type);
    else if (gateMessage) {
      gateMessage.classList.remove('hidden');
      gateMessage.textContent = message;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setVisible(id, show) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !show);
  }

  async function loadStatus() {
    try {
      const me = await apiGetCurrentUser();
      if (!me.user) throw new Error('not signed in');
      if (!me.user.isAdmin) {
        setVisible('notSignedIn', false);
        setVisible('notAdmin', true);
        setVisible('phoneEnroll', false);
        setVisible('unlockPanel', false);
        document.getElementById('gateCopy').textContent = 'Signed in, but this account is not an admin.';
        return;
      }
      const status = await apiAdminStatus();
      if (status.unlocked) {
        openApp();
        return;
      }
      const needsPhone = status.twoFactor && status.twoFactor.needsPhone && !(status.twoFactor.channel === 'sms');
      setVisible('notSignedIn', false);
      setVisible('notAdmin', false);
      setVisible('phoneEnroll', Boolean(status.smsConfigured && (!status.twoFactor || status.twoFactor.needsPhone || !status.twoFactor.channel || status.twoFactor.channel !== 'sms')));
      if (status.smsConfigured && status.twoFactor && status.twoFactor.channel === 'sms') {
        setVisible('phoneEnroll', false);
      }
      if (needsPhone) setVisible('phoneEnroll', true);
      setVisible('unlockPanel', !needsPhone);
      const hint = document.getElementById('unlockHint');
      if (hint && status.twoFactor) {
        const ch = status.twoFactor.channel;
        if (ch === 'sms') hint.textContent = `A code will be texted to ${status.twoFactor.destinationMasked}. This is required every time you enter admin.`;
        else if (ch === 'email') hint.textContent = `SMS is not configured, so a code will be emailed to ${status.twoFactor.destinationMasked}.`;
        else if (ch === 'dev') hint.textContent = 'Development mode: the 2FA code will be printed in the server log.';
        else hint.textContent = 'Configure Twilio or email on the server to send 2FA codes.';
      }
    } catch (error) {
      setVisible('notSignedIn', true);
      setVisible('notAdmin', false);
      setVisible('phoneEnroll', false);
      setVisible('unlockPanel', false);
      if (error.status !== 401) showGateMsg(error.message || 'Could not load admin status.');
    }
  }

  function openApp() {
    gate.classList.add('hidden');
    app.classList.remove('hidden');
    document.getElementById('lockAdminButton').classList.remove('hidden');
    if (typeof setupTabs === 'function') setupTabs('main [role="tablist"]');
    loadUsers();
    loadQuizzes();
    loadUsage();
    loadAudit();
  }

  document.getElementById('sendPhoneCode').addEventListener('click', async () => {
    try {
      const phone = document.getElementById('phoneInput').value;
      const result = await apiAdminPhoneStart(phone);
      showGateMsg(result.message, 'success');
      document.getElementById('phoneCodeInput').classList.remove('hidden');
      document.getElementById('confirmPhoneCode').classList.remove('hidden');
    } catch (error) {
      showGateMsg(error.message);
    }
  });

  document.getElementById('confirmPhoneCode').addEventListener('click', async () => {
    try {
      await apiAdminPhoneConfirm(document.getElementById('phoneCodeInput').value, document.getElementById('phoneInput').value);
      showGateMsg('Phone verified. You can send a 2FA code now.', 'success');
      await loadStatus();
    } catch (error) {
      showGateMsg(error.message);
    }
  });

  document.getElementById('sendUnlockCode').addEventListener('click', async () => {
    try {
      const result = await apiAdminUnlockStart();
      showGateMsg(result.message, 'success');
      document.getElementById('unlockCodeInput').classList.remove('hidden');
      document.getElementById('confirmUnlockCode').classList.remove('hidden');
    } catch (error) {
      showGateMsg(error.message);
    }
  });

  document.getElementById('confirmUnlockCode').addEventListener('click', async () => {
    try {
      await apiAdminUnlockConfirm(document.getElementById('unlockCodeInput').value);
      openApp();
    } catch (error) {
      showGateMsg(error.message);
    }
  });

  document.getElementById('lockAdminButton').addEventListener('click', async () => {
    try { await apiAdminLock(); } catch (_err) { /* ignore */ }
    app.classList.add('hidden');
    gate.classList.remove('hidden');
    document.getElementById('lockAdminButton').classList.add('hidden');
    loadStatus();
  });

  document.getElementById('logoutNavButton').addEventListener('click', async () => {
    try { if (typeof apiLogout === 'function') await apiLogout(); } catch (_err) { /* ignore */ }
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userPlan');
    localStorage.removeItem('userIsAdmin');
    window.location.href = '/';
  });

  async function loadUsers() {
    const box = document.getElementById('usersList');
    box.textContent = 'Loading…';
    try {
      const { users } = await apiAdminUsers(document.getElementById('userSearch').value);
      if (!users.length) {
        box.textContent = 'No users found.';
        return;
      }
      box.innerHTML = users.map((user) => `
        <button type="button" class="w-full text-left p-3 rounded-xl border" style="border-color:var(--border);background:var(--surface-2)" data-user-id="${user.id}">
          <span class="font-medium">${escapeHtml(user.email)}</span>
          <span class="block text-xs mt-1" style="color:var(--muted)">${escapeHtml(user.plan)} · ${user.isAdmin ? 'admin' : 'user'}${user.isBanned ? ' · banned' : ''}${user.isOwner ? ' · owner' : ''}</span>
        </button>`).join('');
      box.querySelectorAll('[data-user-id]').forEach((btn) => {
        btn.addEventListener('click', () => loadUserDetail(btn.getAttribute('data-user-id')));
      });
    } catch (error) {
      box.textContent = error.message || 'Could not load users.';
    }
  }

  document.getElementById('userSearchBtn').addEventListener('click', loadUsers);
  document.getElementById('userSearch').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') loadUsers();
  });

  async function loadUserDetail(id) {
    selectedUserId = id;
    const box = document.getElementById('userDetail');
    box.textContent = 'Loading…';
    try {
      const detail = await apiAdminUser(id);
      const user = detail.user;
      const sessions = detail.sessions || [];
      const quizzes = detail.quizzes || [];
      const you = detail.usage && detail.usage.you;
      box.innerHTML = `
        <h3 class="text-lg font-semibold mb-1">${escapeHtml(user.email)}</h3>
        <p class="text-xs mb-3" style="color:var(--muted)">id ${user.id} · ${escapeHtml(user.plan)} · ${user.isAdmin ? 'admin' : 'user'}${user.isBanned ? ' · banned' : ''} · phone ${escapeHtml(user.phoneMasked || 'none')}</p>
        <p class="text-sm mb-4">Today: ${you ? `${you.jobsUsed} / ${you.jobsLimit} jobs` : 'n/a'}${you && you.bonusJobs ? ` · bonus ${you.bonusJobs}` : ''}</p>
        <div class="flex flex-wrap gap-2 mb-4">
          <button class="btn-secondary" data-act="plan">${user.plan === 'premium' ? 'Set free' : 'Set premium'}</button>
          <button class="btn-secondary" data-act="role">${user.isAdmin ? 'Demote' : 'Promote'}</button>
          <button class="btn-secondary" data-act="ban">${user.isBanned ? 'Unban' : 'Ban'}</button>
          <button class="btn-secondary" data-act="quota">Reset quota</button>
          <button class="btn-secondary" data-act="bonus">Grant +5 jobs</button>
          <button class="btn-danger" data-act="wipe">Wipe data</button>
          <button class="btn-danger" data-act="delete">Delete account</button>
        </div>
        <h4 class="font-semibold text-sm mb-2">Sessions (${sessions.length})</h4>
        <div class="space-y-3 max-h-96 overflow-y-auto">
          ${sessions.length ? sessions.map((session) => `
            <details class="border rounded-xl p-3" style="border-color:var(--border)">
              <summary class="cursor-pointer font-medium">${escapeHtml(session.originalFilename || 'session')} · ${escapeHtml(session.createdAt || '')}</summary>
              <pre class="text-xs mt-2 whitespace-pre-wrap break-words">${escapeHtml((session.summary || session.extractedText || '').slice(0, 4000))}</pre>
            </details>`).join('') : '<p class="text-sm" style="color:var(--muted)">No sessions.</p>'}
        </div>
        <h4 class="font-semibold text-sm mt-4 mb-2">Premade quizzes (${quizzes.length})</h4>
        <ul class="text-sm list-disc pl-5">${quizzes.map((quiz) => `<li>${escapeHtml(quiz.title)} (${escapeHtml(quiz.slug)})</li>`).join('') || '<li>None</li>'}</ul>
      `;
      box.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', () => runUserAction(user, btn.getAttribute('data-act')));
      });
    } catch (error) {
      box.textContent = error.message || 'Could not load user.';
    }
  }

  function confirmAction({ title, copy, phraseLabel, phraseRequired, extraLabel, danger = true }) {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirmModal');
      document.getElementById('confirmTitle').textContent = title;
      document.getElementById('confirmCopy').textContent = copy;
      document.getElementById('confirmPassword').value = '';
      document.getElementById('confirmPhrase').value = '';
      document.getElementById('confirmExtra').value = '';
      document.getElementById('confirmError').classList.add('hidden');
      document.getElementById('confirmPhraseWrap').classList.toggle('hidden', !phraseRequired);
      document.getElementById('confirmPhraseLabel').textContent = phraseLabel || 'Type to confirm';
      document.getElementById('confirmExtraWrap').classList.toggle('hidden', !extraLabel);
      document.getElementById('confirmExtraLabel').textContent = extraLabel || '';
      document.getElementById('confirmSubmit').className = danger ? 'btn-danger' : 'btn-primary';
      modal.dataset.visible = 'true';
      modal.classList.remove('opacity-0', 'pointer-events-none');
      const done = (value) => {
        modal.dataset.visible = 'false';
        modal.classList.add('opacity-0', 'pointer-events-none');
        document.getElementById('confirmSubmit').onclick = null;
        document.getElementById('confirmCancel').onclick = null;
        resolve(value);
      };
      document.getElementById('confirmCancel').onclick = () => done(null);
      document.getElementById('confirmSubmit').onclick = () => {
        done({
          password: document.getElementById('confirmPassword').value,
          confirm: document.getElementById('confirmPhrase').value,
          extra: document.getElementById('confirmExtra').value,
        });
      };
    });
  }

  async function runUserAction(user, act) {
    try {
      if (act === 'plan') {
        const next = user.plan === 'premium' ? 'free' : 'premium';
        const confirmed = await confirmAction({
          title: `Set plan to ${next}`,
          copy: `This does not go through Stripe. ${user.email} will become ${next}.`,
          danger: false,
        });
        if (!confirmed) return;
        await apiAdminUserPlan(user.id, next, confirmed.password);
      } else if (act === 'role') {
        const next = user.isAdmin ? 'user' : 'admin';
        const confirmed = await confirmAction({
          title: next === 'admin' ? 'Promote to admin' : 'Remove admin',
          copy: 'The owner is emailed when admin permission changes. New admins must pass 2FA before they can use this page.',
        });
        if (!confirmed) return;
        await apiAdminUserRole(user.id, next, confirmed.password);
      } else if (act === 'ban') {
        const confirmed = await confirmAction({
          title: user.isBanned ? 'Unban user' : 'Ban user',
          copy: user.isBanned ? 'They will be able to sign in again.' : 'They will be blocked from signing in and generating.',
          extraLabel: user.isBanned ? '' : 'Reason (optional)',
        });
        if (!confirmed) return;
        if (user.isBanned) await apiAdminUserUnban(user.id, confirmed.password);
        else await apiAdminUserBan(user.id, confirmed.password, confirmed.extra);
      } else if (act === 'quota') {
        const confirmed = await confirmAction({ title: 'Reset today’s job count', copy: 'Sets this user’s jobs used today to 0.', danger: false });
        if (!confirmed) return;
        await apiAdminUserQuota(user.id, confirmed.password, 0);
      } else if (act === 'bonus') {
        const confirmed = await confirmAction({ title: 'Grant +5 jobs', copy: 'Adds 5 extra study actions for today.', danger: false });
        if (!confirmed) return;
        await apiAdminUserQuota(user.id, confirmed.password, 5);
      } else if (act === 'wipe') {
        const confirmed = await confirmAction({
          title: 'Wipe stored study data',
          copy: 'Deletes sessions, flashcard reviews, and usage rows. Keeps the account. Type WIPE.',
          phraseRequired: true,
          phraseLabel: 'Type WIPE',
        });
        if (!confirmed) return;
        await apiAdminUserWipe(user.id, confirmed.password, confirmed.confirm);
      } else if (act === 'delete') {
        const confirmed = await confirmAction({
          title: 'Delete account',
          copy: `Permanently deletes ${user.email} and their sessions, reviews, quizzes, and usage. Type their email.`,
          phraseRequired: true,
          phraseLabel: 'Type the email',
        });
        if (!confirmed) return;
        await apiAdminUserDelete(user.id, confirmed.password, confirmed.confirm);
        selectedUserId = null;
        document.getElementById('userDetail').innerHTML = '<p class="text-sm">Account deleted.</p>';
      }
      await loadUsers();
      if (selectedUserId && act !== 'delete') await loadUserDetail(selectedUserId);
      loadAudit();
    } catch (error) {
      const err = document.getElementById('confirmError');
      alert(error.message || 'Action failed.');
      if (err) {
        err.textContent = error.message;
        err.classList.remove('hidden');
      }
    }
  }

  async function loadQuizzes() {
    const box = document.getElementById('quizList');
    box.textContent = 'Loading…';
    try {
      const { quizzes } = await apiAdminQuizzes(document.getElementById('quizSearch').value);
      if (!quizzes.length) {
        box.textContent = 'No quizzes found.';
        return;
      }
      box.innerHTML = quizzes.map((quiz) => `
        <div class="flex items-start justify-between gap-3 p-3 rounded-xl border" style="border-color:var(--border)">
          <div>
            <p class="font-medium">${escapeHtml(quiz.title)}</p>
            <p class="text-xs" style="color:var(--muted)">${escapeHtml(quiz.slug)} · ${quiz.questionCount || 0} questions · ${quiz.isPublic ? 'public' : 'private'}</p>
          </div>
          <button class="btn-danger" data-slug="${escapeHtml(quiz.slug)}">Delete</button>
        </div>`).join('');
      box.querySelectorAll('[data-slug]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const slug = btn.getAttribute('data-slug');
          const confirmed = await confirmAction({
            title: 'Delete premade quiz',
            copy: `Deletes ${slug} for everyone. Type the slug or DELETE.`,
            phraseRequired: true,
            phraseLabel: 'Type the slug or DELETE',
          });
          if (!confirmed) return;
          try {
            await apiAdminQuizDelete(slug, confirmed.password, confirmed.confirm);
            loadQuizzes();
            loadAudit();
          } catch (error) {
            alert(error.message);
          }
        });
      });
    } catch (error) {
      box.textContent = error.message || 'Could not load quizzes.';
    }
  }

  document.getElementById('quizSearchBtn').addEventListener('click', loadQuizzes);

  async function loadUsage() {
    const box = document.getElementById('usagePanel');
    try {
      const data = await apiAdminUsage();
      const community = data.selfCount || {};
      const google = data.googleCloud || {};
      const rows = (data.topUsersToday || []).map((row) => `
        <tr>
          <td class="py-1 pr-3">${escapeHtml(row.key)}</td>
          <td class="py-1 pr-3">${row.jobs}</td>
          <td class="py-1 pr-3">${row.gemmaRequests}</td>
          <td class="py-1 pr-3">${row.premiumRequests}</td>
          <td class="py-1">${row.inputTokens} / ${row.outputTokens}</td>
        </tr>`).join('');
      box.innerHTML = `
        <h3 class="font-semibold mb-2">Smart Study counter (primary)</h3>
        <p>Gemma requests today: <strong>${community.gemmaUsed}</strong> / ${community.gemmaBudget}</p>
        <p>Estimated tokens: ${community.estimatedInputTokens} in / ${community.estimatedOutputTokens} out</p>
        <p class="text-xs mt-2 mb-4" style="color:var(--muted)">${escapeHtml(community.note || '')}</p>
        <h3 class="font-semibold mb-2">Google Cloud Monitoring (optional)</h3>
        <p>${google.configured ? `Project ${escapeHtml(google.projectId || '')}: <strong>${google.used == null ? 'error' : google.used}</strong> requests since Pacific midnight` : 'Not configured.'}</p>
        <p class="text-xs mt-1 mb-4" style="color:var(--muted)">${escapeHtml(google.note || google.error || 'Set GCP_PROJECT_ID and a monitoring.viewer service account. Never put that key in frontend code.')}</p>
        <h3 class="font-semibold mb-2">Top usage today</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-xs">
            <thead><tr><th class="py-1 pr-3">Key</th><th class="py-1 pr-3">Jobs</th><th class="py-1 pr-3">Gemma</th><th class="py-1 pr-3">Premium</th><th class="py-1">Tokens in/out</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5">No rows yet.</td></tr>'}</tbody>
          </table>
        </div>`;
    } catch (error) {
      box.textContent = error.message || 'Could not load usage.';
    }
  }

  async function loadAudit() {
    const box = document.getElementById('auditPanel');
    try {
      const { entries } = await apiAdminAudit();
      if (!entries.length) {
        box.textContent = 'No admin actions yet.';
        return;
      }
      box.innerHTML = `<div class="space-y-2">${entries.map((entry) => `
        <div class="border-b pb-2" style="border-color:var(--border)">
          <p><strong>${escapeHtml(entry.action)}</strong> · ${escapeHtml(entry.actorEmail || '')} → ${escapeHtml(entry.targetEmail || entry.targetId || '')}</p>
          <p class="text-xs" style="color:var(--muted)">${escapeHtml(entry.createdAt || '')} · ${escapeHtml(entry.ip || '')}</p>
        </div>`).join('')}</div>`;
    } catch (error) {
      box.textContent = error.message || 'Could not load audit log.';
    }
  }

  if (typeof setupAppShell === 'function') setupAppShell();
  loadStatus();
});

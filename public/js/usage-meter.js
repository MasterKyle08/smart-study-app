function formatLastRun(run) {
  if (!run || !run.requests) return '';
  const src = run.source === 'api' ? 'counted by Google' : (run.source === 'estimate' ? 'estimated from prompt/response size' : 'Google count + estimate');
  return `Last generation: ${run.requests} request(s) · ${Number(run.inputTokens).toLocaleString()} in · ${Number(run.outputTokens).toLocaleString()} out (${src}).`;
}

async function refreshUsageMeter(lastRun) {
  const el = document.getElementById('usageMeter');
  if (!el || typeof apiUsageStatus !== 'function') return;
  try {
    const status = await apiUsageStatus();
    const g = status.community;
    const you = status.you;
    const quota = status.quota || {};
    const used = Number(quota.used != null ? quota.used : g.displayUsed != null ? g.displayUsed : g.gemmaUsed) || 0;
    const limit = Number(quota.limit != null ? quota.limit : g.displayLimit != null ? g.displayLimit : g.gemmaBudget) || 1500;
    const remaining = Math.max(0, limit - used);
    const source = quota.source || g.displaySource || 'smart-study';
    const gemmaPct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    const youPct = you.jobsLimit ? Math.min(100, Math.round((you.jobsUsed / you.jobsLimit) * 100)) : 0;
    const lastLine = formatLastRun(lastRun);
    const sourceNote = source === 'google-cloud-monitoring'
      ? 'From Google Cloud Monitoring via our server (often lags a few minutes). Job limits still use Smart Study’s own count.'
      : 'Reserved by Smart Study before provider calls, including retries. Google does not publish remaining free-tier quota to apps.';
    el.innerHTML = `
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div class="flex-1">
          <p class="text-xs font-semibold uppercase tracking-wide mb-1" style="color:var(--muted)">Global free requests</p>
          <p class="text-sm font-medium">Global free requests <span id="quota-display">${used}/${limit}</span> · ${remaining} left today</p>
          <div class="progress-track mt-2"><div class="progress-bar" style="width:${gemmaPct}%"></div></div>
          <p class="text-xs mt-1" style="color:var(--muted)">${sourceNote} Tokens in/out today: ${g.estimatedInputTokens.toLocaleString()} / ${g.estimatedOutputTokens.toLocaleString()}. Resets midnight Pacific.</p>
          ${lastLine ? `<p class="text-xs mt-1 font-medium">${lastLine}</p>` : ''}
        </div>
        <div class="flex-1">
          <p class="text-xs font-semibold uppercase tracking-wide mb-1" style="color:var(--muted)">Your study actions</p>
          <p class="text-sm font-medium">${you.jobsUsed} / ${you.jobsLimit} used · ${you.jobsRemaining} left (${you.plan})</p>
          <div class="progress-track mt-2"><div class="progress-bar" style="width:${youPct}%"></div></div>
          <p class="text-xs mt-1" style="color:var(--muted)">A study action is generating a set, practice quiz, or regeneration. Grading and chat still count toward the shared request pool.</p>
        </div>
        <div class="flex flex-col gap-2 min-w-[12rem]">
          <p class="text-xs" style="color:var(--muted)">Daily allowances reset at midnight Pacific. Display ads do not grant extra actions.</p>
        </div>
      </div>
      <div id="adsenseSlot" class="mt-4"></div>`;
    maybeRenderPageAd();
  } catch (_err) {
    el.innerHTML = '<p class="text-sm" style="color:var(--muted)">Usage stats unavailable right now.</p>';
  }
}

async function maybeRenderPageAd() {
  const slotHost = document.getElementById('adsenseSlot');
  if (!slotHost || typeof apiBillingConfig !== 'function') return;
  try {
    const config = await apiBillingConfig();
    if (!config.ads || !config.ads.enabled || !config.ads.client) return;
    await loadAdsense(config.ads.client);
    const extra = config.ads.slot
      ? `data-ad-slot="${config.ads.slot}"`
      : 'data-ad-format="auto" data-full-width-responsive="true"';
    slotHost.innerHTML = `<ins class="adsbygoogle" style="display:block" data-ad-client="${config.ads.client}" ${extra}></ins>`;
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (_err) {
    /* ads are optional */
  }
}

function loadAdsense(client) {
  if (document.querySelector('script[data-smart-adsense]')) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.setAttribute('data-smart-adsense', '1');
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load AdSense.'));
    document.head.appendChild(script);
  });
}


document.addEventListener('DOMContentLoaded', () => {
  refreshUsageMeter();
  window.setInterval(() => {
    if (document.getElementById('usageMeter')) refreshUsageMeter();
  }, 60000);
});
window.refreshUsageMeter = refreshUsageMeter;

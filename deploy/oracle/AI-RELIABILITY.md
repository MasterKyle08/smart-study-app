# Free Gemma 4 reliability and latency

During this investigation, tiny synthetic requests to `gemma-4-31b-it` returned Google's HTTP 500 INTERNAL error or exceeded the probe's timeout. A tiny request to `gemma-4-26b-a4b-it` returned HTTP 200 in about 0.5 seconds. These are current probe observations, not a measurement of historical traffic or realistic-document latency. They establish a current provider-serving problem, but do not identify every failure behind the reported 46% Google AI Studio rate.

The new transport was also tested live: the primary returned HTTP 500, the fallback returned valid flashcard JSON, and the complete request finished in about 4.8 seconds including the configured request pacing. The test used synthetic content and did not write to the database.

Google [supports both models through the Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api), and [Gemma 4 input/output is free](https://ai.google.dev/gemini-api/docs/pricing). Thinking remains disabled with the documented `thinkingLevel: minimal` setting.

The app previously retried every structured-output failure immediately in another format, including outages, quota errors, and bad credentials. Summary, flashcards, and quiz generation also ran sequentially. Each request could take 90 seconds, so a format fallback could substantially increase the wait.

The changes now:

- Keep the configured primary model, with the other Gemma 4 model as a free fallback for server errors or timeouts. After a primary outage, use the fallback for five minutes before trying the primary again.
- Limit a primary request to 25 seconds when a fallback is available. A transport request has a 90-second total budget, including retries and pacing.
- Retry transient failures with bounded backoff. Fail authentication, invalid-request and daily-quota errors promptly; respect short retry hints instead of immediately resending.
- Request prompt JSON directly for Gemma rather than probing schema-constrained mode on every JSON task. Premium keeps native schema output, with format fallback only for parsing/unsupported-format errors.
- Run up to two independent study outputs concurrently, with at most two free provider calls in flight and four seconds between free request starts across the process.
- Log model, Google HTTP status, attempt, queue wait, provider duration, and finish reason under `[google-ai]`. API keys are sent in headers, not URLs. Documents, prompts, and response text are not included in that telemetry.

Optional settings in the server `.env` (defaults work without editing your existing settings):

```dotenv
GOOGLE_FREE_FALLBACK_MODEL=gemma-4-26b-a4b-it
GOOGLE_FREE_REQUEST_INTERVAL_MS=4000
GOOGLE_FREE_PRIMARY_TIMEOUT_MS=25000
GOOGLE_FREE_FALLBACK_COOLDOWN_MS=300000
```

Set `GOOGLE_FREE_FALLBACK_MODEL=none` to use only the configured primary. A free fallback must be another Gemma 4 model; it cannot silently switch to a paid Gemini model. The two Gemma models can produce different answers, so compare output quality as well as speed.

Google's per-project/per-model RPM, token and daily limits still apply. [Check your actual AI Studio limits](https://ai.google.dev/gemini-api/docs/rate-limits) and increase the interval if your allowance is lower. Pacing is per app process; two deployments sharing a key do not share this in-memory limiter.

After deployment, review a fresh time window in Google AI Studio. The aggregate historical success percentage will still include past failures, and individual retry attempts count separately from successfully completed study jobs.

In PuTTY / Screen:

```bash
cd /home/ubuntu/smart-study-app
sudo docker compose logs --since=30m --tail=300 app
```

Look for `[google-ai]` entries. HTTP 500/503 suggests provider failures; 429 suggests quotas; timeout entries show a request exceeded its deadline. A successful fallback names `gemma-4-26b-a4b-it`. For a consistently faster primary on your own traffic, you can set `GOOGLE_AI_MODEL_NAME=gemma-4-26b-a4b-it` and redeploy, while comparing the quality of generated materials.

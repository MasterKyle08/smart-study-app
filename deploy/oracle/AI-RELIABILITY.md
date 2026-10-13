# Free Gemma 4 reliability and latency

During this investigation, tiny synthetic requests to `gemma-4-31b-it` returned Google's HTTP 500 INTERNAL error or exceeded the probe's timeout. A tiny request to `gemma-4-26b-a4b-it` returned HTTP 200 in about 0.5 seconds. These are current probe observations, not a measurement of historical traffic or realistic-document latency. They establish a current provider-serving problem, but do not identify every failure behind the reported 46% Google AI Studio rate.

The new transport was also tested live: the primary returned HTTP 500, the fallback returned valid flashcard JSON, and the complete request finished in about 4.8 seconds including the configured request pacing. The test used synthetic content and did not write to the database.

Google [supports both models through the Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api), and [Gemma 4 input/output is free](https://ai.google.dev/gemini-api/docs/pricing). Thinking remains disabled with the documented `thinkingLevel: minimal` setting.

The app previously retried every structured-output failure immediately in another format, including outages, quota errors, and bad credentials. Summary, flashcards, and quiz generation also ran sequentially. Each request could take 90 seconds, so a format fallback could substantially increase the wait.

The changes now:

- Keep the configured primary model, with the other Gemma 4 model as a free fallback for server errors or timeouts. After a primary outage, use the fallback for five minutes before trying the primary again.
- Limit a primary request to 25 seconds when a fallback is available. A transport request has a 90-second total budget, including retries and pacing.
- Retry transient failures with bounded backoff. Fail authentication, invalid-request and daily-quota errors promptly. Free minute-quota errors can wait for Google's retry hint (up to 60 seconds) and retry the same model if the total deadline permits. A quota failure does not trigger a model switch.
- Request prompt JSON directly for Gemma rather than probing schema-constrained mode on every JSON task. Premium keeps native schema output, with format fallback only for parsing/unsupported-format errors.
- Generate multiple selected outputs from a free-tier upload in one JSON request, sending the document once. Summary preferences, quiz types, question count, and difficulty are preserved. Single-output requests and premium generation retain their existing paths. Valid sections of a partial response are saved with warnings; missing sections do not trigger more calls automatically.
- Allow at most two free provider calls in flight, with four seconds between starts and a rolling 60-second input-token budget per model. Reserve estimated input before each attempt and reconcile successful reservations with Google's input count. Failed attempts conservatively retain their reservations until the minute expires.
- Share Google's quota retry hint among queued calls for the same model in this process. Calls already waiting recheck the cooldown before contacting Google. Errors that outlast the request deadline display a readable retry delay.
- Log model, Google HTTP status, attempt, queue wait, provider duration, finish reason, and successful input-token count under `[google-ai]`. API keys are sent in headers, not URLs. Documents, prompts, and response text are not included in that telemetry.

Optional settings in the server `.env` (defaults work without editing your existing settings):

```dotenv
GOOGLE_FREE_FALLBACK_MODEL=gemma-4-26b-a4b-it
GOOGLE_FREE_REQUEST_INTERVAL_MS=4000
GOOGLE_FREE_INPUT_TOKENS_PER_MINUTE=14000
GOOGLE_FREE_PRIMARY_TIMEOUT_MS=25000
GOOGLE_FREE_FALLBACK_COOLDOWN_MS=300000
```

Set `GOOGLE_FREE_FALLBACK_MODEL=none` to use only the configured primary. A free fallback must be another Gemma 4 model; it cannot silently switch to a paid Gemini model. The two Gemma models can produce different answers, so compare output quality as well as speed.

Google's per-project/per-model RPM, input-token and daily limits still apply. [Check your actual AI Studio limits](https://ai.google.dev/gemini-api/docs/rate-limits) and adjust pacing to your allowance. The 14,000-token default leaves headroom under the 16,000 input-tokens/minute limit reported by this project's Google error; it is not a universal Gemma allowance. Text estimates use roughly one token per three characters plus overhead and are reconciled after success. Images have an approximate reservation because their tokenization varies. Pacing is a best-effort aid, not an exact provider quota meter.

Quotas belong to the Google project, not each API key. Manual local testing uses the same project as the live app and consumes the same allowance. Two deployments do not share this in-memory limiter, and restarting the app clears its estimates without resetting Google's quota. Traffic from AI Studio or other tools also consumes the allowance. To test without competing with the live site, use a separate Google project with its own free Gemma key in private `.env.local`; another key in the existing project will not separate the quota.

For the reported failure, one successful summary used 4,932 input tokens while quiz and flashcard calls received HTTP 429 with a roughly 43-second retry hint. The old upload flow sent the source independently for all three outputs. The displayed count came from successful Google responses only, so it could not show rejected calls or other project traffic. The UI now labels it as successful API responses and explicitly excludes rejected attempts. This minute-quota issue contributes to a low API success rate but does not establish the cause of every historical failure.

After deployment, review a fresh time window in Google AI Studio. The aggregate historical success percentage will still include past failures, and individual retry attempts count separately from successfully completed study jobs.

In PuTTY / Screen:

```bash
cd /home/ubuntu/smart-study-app
sudo docker compose logs --since=30m --tail=300 app
```

Look for `[google-ai]` entries. HTTP 500/503 suggests provider failures; 429 suggests quotas; timeout entries show a request exceeded its deadline. A successful fallback names `gemma-4-26b-a4b-it`. For a consistently faster primary on your own traffic, you can set `GOOGLE_AI_MODEL_NAME=gemma-4-26b-a4b-it` and redeploy, while comparing the quality of generated materials.

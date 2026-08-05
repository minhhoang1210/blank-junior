# Blank Junior

A TypeScript Discord bot with five slash commands. Three are powered by the free
tier of the Google Gemini API; the other two need no API key at all — one
scrapes a WordPress story into an EPUB, the other just picks between things.
**It replies in Vietnamese** — both the model's answers and the bot's own
messages.

The model's output language is `RESPONSE_LANGUAGE` in `.env` (default
`Vietnamese`), so switching it needs no code change. The bot's own text — command
descriptions, error messages, embed labels — is hardcoded Vietnamese in `src/`;
changing that means editing the strings.

```
/tldr messages:200
```

```
/ask question:is tomorrow gonna be sunny?
```

```
/epub url:https://ten-mien.wordpress.com/ten-truyen/
```

```
/ocr image:[đính kèm ảnh]
```

```
/choose options:a | b | c
```

## Commands

### `/tldr` — summarise recent messages

| Option     | Type    | Required | Description                                           |
| ---------- | ------- | -------- | ----------------------------------------------------- |
| `messages` | integer | no       | How many recent messages to read (1–200, default 100) |

Reads the most recent messages in the current channel, oldest first, and posts a
briefing: the most important thing first, then the rest grouped by topic, with
decisions made and questions still open called out.

Discord caps a history fetch at 100 messages, so anything above that is
paginated automatically. The bot's own messages are skipped, so previous
summaries never feed into new ones.

### `/ask` — ask a question

| Option     | Type   | Required | Description           |
| ---------- | ------ | -------- | --------------------- |
| `question` | string | yes      | What you want to know |

Gemini answers with **Google Search grounding enabled**, so time-sensitive
questions like the example above get a real answer instead of "I don't have
real-time access". When it searches, the sources it grounded on are listed under
the reply.

Grounding has its own free-tier quota, separate from the model's, and plenty of
free keys have none for it. When a grounded call is refused, `/ask` retries once
without search rather than failing: you still get an answer, the footer says the
answer wasn't searched, and the model is told to admit it can't check live
sources instead of guessing at current facts. Run `npm run probe` to see whether
your key has grounding quota, and set `ENABLE_SEARCH_GROUNDING=false` to skip the
wasted first attempt if it doesn't.

### `/epub` — download a WordPress story as an EPUB

| Option | Type   | Required | Description                                             |
| ------ | ------ | -------- | ------------------------------------------------------- |
| `url`  | string | yes      | The story's table-of-contents page, or a one-page story |

Reads the index page, follows every chapter link on it, and uploads the result
as an EPUB attachment. No Gemini involved — this command costs no quota.

A link counts as a chapter when its URL or anchor text contains `chương`,
`chap`, `chapter`, `phiên ngoại`, `ngoại truyện` or `vĩ thanh`, compared with
diacritics stripped so `Chương 12` and `chuong-12` are the same thing. Links to
other hosts are ignored. A page with no chapter links at all is not an error: it
becomes a one-chapter book, which is what a one-shot posted as a single
WordPress post should be.

**Chapters keep the order the links appear in on the page**, top to bottom. The
book is not re-sorted by the number in the link, because side stories restart
their own numbering: on a real index of 41 chapters plus 5 extras, sorting
numerically pairs `PN 1` with `Chương 01`, `PN 2` with `Chương 02`, and threads
the extras through the middle of the story. The page already lists chapters in
reading order.

Each chapter page is reduced to its `<article>` and stripped of the usual
WordPress furniture — sharing widgets, related posts, comments, navigation,
scripts — then sanitised down to an attribute allowlist. Illustrations are
downloaded and embedded so the book reads offline, `data-orig-file` lazy-loading
attributes included. The book gets a generated cover, a synopsis page built from
the index page, and both an EPUB 3 nav document and an EPUB 2 NCX so old readers
still get a table of contents.

Practical limits, all in [Configuration](#configuration): at most
`EPUB_MAX_CHAPTERS` chapters, `EPUB_TIME_BUDGET_MS` of wall clock, and
`EPUB_MAX_UPLOAD_MB` of attachment. Hitting the first two truncates the book and
says so in the reply; a book that is still too big after being repacked without
images is refused rather than silently cut short. Fetches run four at a time
with a 250 ms pause between them — enough to build a long book in a few minutes
without hammering someone's blog.

To try a source site without going through Discord:

```bash
npm run epub -- https://ten-mien.wordpress.com/ten-truyen/ --max 20
```

**On the serverless deployment this command is close to useless.** Vercel kills
the function after 60 seconds (`maxDuration` in `vercel.json`), so `/epub`
budgets 40 of them and uploads whatever it managed to read. That is a handful of
chapters. Long stories need the gateway shape — see
[Running it 24/7](#running-it-247).

### `/ocr` — read the text in an image

| Option  | Type       | Required | Description                            |
| ------- | ---------- | -------- | -------------------------------------- |
| `image` | attachment | yes      | The image to read (PNG, JPEG, WebP, HEIC) |

Downloads the attachment, sends it to Gemini as an inline image part, and posts
back a transcription with the source image shown under it. Image input is not
gated behind a paid tier and has no separate quota of its own — unlike search
grounding, if your key can call the model at all it can send it an image. The
image does consume tokens against the same per-minute budget as everything else.

The reply re-uploads the image rather than linking the one on Discord's CDN:
those URLs carry an expiry signature and would leave a broken embed behind
within a day. The bytes are already in hand by then, so it costs one upload and
the message stands on its own afterwards. HEIC is the one accepted format
browsers won't render — it still uploads, it just shows as a plain attachment.

**This is the one command that ignores `RESPONSE_LANGUAGE`.** Rendering an
English sign in Vietnamese would be translation, not transcription, so the
result keeps the image's own language; only the bot's text around it stays
Vietnamese. `temperature` is 0 — this is the only task here with a single
correct answer.

It's a language model reading an image, not a dedicated OCR engine, so it will
occasionally tidy up what it sees. The system instruction pushes hard against
that: transcribe verbatim, keep line breaks, mark genuinely illegible text
rather than guessing at it, and treat any text in the image as data — an image
that says "ignore previous instructions" gets transcribed, not obeyed. An image
with no text in it comes back as a fixed sentinel rather than free prose, since
"there is no text here" is otherwise indistinguishable from a photo of that
sentence.

Attachments are vetted before the command defers, so the wrong file type earns a
private one-liner instead of replacing a "thinking…" placeholder. Images are
capped at 8 MB: inline data shares a request-wide ceiling of roughly 20 MB and
base64 inflates the bytes by a third on the way up. The host is checked against
Discord's own CDN — not the SSRF guard `/epub` needs, since the URL arrives in a
signature-verified payload, but it keeps the trust boundary visible.

Unlike `/epub`, this one is fine on Vercel: one download plus one model call
finishes well inside `maxDuration`.

**Worth deciding deliberately.** Images go to Gemini under the same free-tier
terms as the text does — see [Notes](#notes). A command that reads pictures gets
fed screenshots of private chats, ID cards and bank statements without anyone
thinking about it, which is a larger exposure than `/tldr` reading a public
channel.

### `/choose` — pick one at random

| Option    | Type   | Required | Description                                    |
| --------- | ------ | -------- | ---------------------------------------------- |
| `options` | string | yes      | The candidates, separated by `\|` (2–20 of them) |

Splits the input on `|`, draws one uniformly at random, and posts it with the
full list underneath. No Gemini, no network, no quota — and it is the only
command that answers without deferring, because there is nothing to wait for.

Blank entries are ignored, so `a||b` and a trailing separator are both fine.
Duplicates are kept rather than collapsed: repeating an option is the only way
to weight it, and de-duplicating would quietly change the odds. Only `|` splits
— commas don't — because options in Vietnamese contain commas often enough that
guessing would be worse than asking.

The draw uses `crypto.randomInt`, not `Math.random`, which skews when the range
doesn't divide evenly into its output. The bias is negligible anywhere else in
this bot; being fair is the entire job of this command.

Mentions are disarmed on the reply. The options are the user's own text echoed
back by the bot, so without that an `@everyone` tucked into one of them would
ping the whole server with the bot's permissions rather than the author's.

## Setup

**1. Get a free Gemini API key.** Sign in at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey) and create a
key. No billing setup is required for the free tier.

**2. Create the Discord application.** At the
[Discord Developer Portal](https://discord.com/developers/applications), create
an application, open the **Bot** tab and reset the token to reveal it. Copy the
**Application ID** from **General Information**.

**3. Enable the Message Content intent.** On the same **Bot** tab, scroll to
**Privileged Gateway Intents** and turn on **Message Content**. Without it
`/tldr` reads every message as empty — this is the single most common reason
the command comes back with nothing to summarise.

**4. Configure.**

```bash
cp .env.example .env
```

Fill in `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` and `GEMINI_API_KEY`. Set
`DISCORD_GUILD_ID` to your test server's id so command changes appear instantly —
global registration can take up to an hour.

**5. Install and register the commands.**

```bash
npm install
```

```bash
npm run deploy
```

**6. Invite the bot.** Under **OAuth2 → URL Generator**, tick the `bot` and
`applications.commands` scopes, plus the **View Channel**, **Send Messages**,
and **Read Message History** permissions. Open the generated URL.

**7. Run it.**

```bash
npm run dev
```

For production:

```bash
npm run build && npm start
```

## Configuration

| Variable                  | Default            | Purpose                                                               |
| ------------------------- | ------------------ | --------------------------------------------------------------------- |
| `GEMINI_MODEL`            | `gemini-2.5-flash` | Model to use — see below                                              |
| `DISCORD_GUILD_ID`        | —                  | Register commands to one server for instant updates                   |
| `RESPONSE_LANGUAGE`       | `Vietnamese`       | Language the model answers in                                         |
| `ENABLE_SEARCH_GROUNDING` | `true`             | Google Search on `/ask` — has its own quota                           |
| `DEFAULT_TLDR_MESSAGES`   | `100`              | `/tldr` message count when the option is omitted                      |
| `GEMINI_TIMEOUT_MS`       | `120000`           | Per-request timeout against the Gemini API                            |
| `EPUB_MAX_CHAPTERS`       | `400`              | Most chapters `/epub` will download from one story                    |
| `EPUB_CONCURRENCY`        | `4`                | Parallel chapter fetches — raising it leans harder on the source site |
| `EPUB_TIME_BUDGET_MS`     | `780000`           | Wall clock `/epub` may spend on one book (capped at 14 min)           |
| `EPUB_MAX_UPLOAD_MB`      | `9`                | Attachment ceiling — raise it on a boosted server                     |

## Choosing a model

Google retires models on its own schedule. A retired model keeps working for
keys that already used it while returning **404** to newer keys, so a model name
that works for one person can fail for another — and any default hard-coded here
will eventually go stale.

Ask your own key what it can use:

```bash
npm run models
```

That prints every model your key can call, then set `GEMINI_MODEL` in `.env` to
one of them. If the bot ever replies that a model isn't available, this is the
fix, and the error message says so.

Prefer a `flash`-class model: they're the fastest and have the most generous
free-tier limits, which suits both commands here. A `pro`-class model writes
better summaries of long or messy transcripts but burns free quota much faster.

## Free-tier limits

The free tier is rate-limited per minute **and** per day, and the limits differ
by model. If you hit them the bot replies with a clear quota message rather than
a stack trace — that's an HTTP 429, not a bug. When Google includes a suggested
wait in the error, the reply quotes it; when it doesn't, a short wait that
doesn't help means the daily cap is spent.

Your key's actual limits are only visible at
[aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit) — the
public docs no longer publish per-model numbers.

**Find out what's consuming the quota.** Every call logs its real token usage:

```
INFO /tldr (200 messages) tokens — prompt=4132, thinking=890, output=412, total=5434
INFO /ask tokens — prompt=61, thinking=204, output=298, search=1840, total=2403
```

Because limits are enforced on tokens per minute as well as requests, those
numbers tell you which command to rein in. The levers, roughly in order:

1. Lower `DEFAULT_TLDR_MESSAGES` — `/tldr` dominates prompt tokens.
2. Set `ENABLE_SEARCH_GROUNDING=false` — grounding has its own separate quota
   and shows up as `search=` in the `/ask` line. Costs you answers to
   time-sensitive questions.
3. Move to a lighter model with `npm run models`.

## How it works

```
/tldr  ─ history.ts    fetch N messages (paginated), skip own posts, build transcript
       └ summarize.ts  Gemini, system instruction + transcript
       └ reply.ts      post, splitting across messages past Discord's 2000-char cap

/ask   ─ ask.ts        Gemini with the googleSearch tool, one server-side call
       └ reply.ts      post the answer plus a sources embed

/epub  ─ scrape.ts     read the index page, fetch chapters 4-at-a-time
       └ parser.ts     strip WordPress furniture, sanitise, resolve URLs
       └ build.ts      XHTML + OPF + NCX + cover, zipped as EPUB 3
       └ reply.ts      upload the book as an attachment

/ocr   ─ attachment.ts vet the upload, download it from Discord's CDN
       └ ocr.ts        Gemini, image part inline, transcribe-don't-translate
       └ reply.ts      post the transcription, split if it's long

/choose ─ choose.ts    split on |, draw with crypto.randomInt, answer in place
```

**Blocked responses.** Gemini's safety filters return a normal HTTP 200 with an
empty candidate rather than an error, so both commands check `promptFeedback`
and the candidate's `finishReason` _before_ reading the text. A filtered prompt
or response surfaces as a clear message instead of a blank reply.

**Output budget.** On Gemini 2.5 models thinking tokens count against
`maxOutputTokens`, so it's set to 16384 — far above what a reply needs — and a
response that still runs out is reported rather than silently truncated.

**Prompt injection.** Channel messages are untrusted input, so the summariser is
told to treat every transcript line as data to summarise, never as instructions.
The transcript is also fenced in `<transcript>` tags. Text inside an image is
untrusted the same way, so `/ocr` is told to transcribe an instruction rather
than follow it.

**Mentions.** Every reply is built from something a user supplied — channel
messages, model output, the text inside an uploaded image — so all four send
paths disarm mentions. Without that, an `@everyone` arriving by any of those
routes would ping the server with the *bot's* permissions rather than the
author's.

**Limits handled.** Individual messages are clipped at 1500 characters and the
whole transcript at 120k, dropping oldest-first with a marker so a single wall of
text can't crowd out the conversation. Replies longer than Discord's
2000-character limit are split at paragraph, then line, then word boundaries.

**Concurrency.** One job per user per command, so a single person can't queue up
model calls.

**Untrusted URLs.** `/epub` fetches whatever anyone in the server types, from a
host that can usually see a private subnet and a cloud metadata endpoint. Every
hop of every request — including each redirect, followed by hand for exactly
this reason — is checked against loopback, private, link-local and CGNAT ranges,
in IPv4 and IPv6 alike; hostnames are resolved first, so a public domain
pointing at `127.0.0.1` is refused too. Pages are decoded using the charset the
server or the document declares rather than assuming UTF-8, and content
documents are serialised as XHTML by hand so a malformed page cannot produce a
book that fails to open.

## Running it 24/7

The bot ships in **two interchangeable shapes**, sharing the same commands,
prompts and Gemini layer:

| Shape                              | Entrypoint            | Where it runs             |
| ---------------------------------- | --------------------- | ------------------------- |
| **HTTP interactions** (serverless) | `api/interactions.ts` | Vercel                    |
| **Gateway** (always-on process)    | `src/index.ts`        | VPS, Docker, Fly.io, a Pi |

Discord pushes slash commands to an HTTPS endpoint in the first shape, and the
bot holds an outbound WebSocket open in the second. Only the gateway shape can
ever react to non-interaction events (messages, reactions, joins); for these two
commands, both are equivalent.

Whatever you pick, register the commands once after the first deploy:

```bash
npm run deploy:prod
```

That runs the compiled `dist/deploy-commands.js`, so it needs no dev
dependencies. It is not needed on every restart — only when a command's name,
description, or options change.

### Option A — Vercel (serverless, HTTP interactions)

Vercel cannot run the gateway bot — there is no always-on process — so this uses
`api/interactions.ts`, which Discord calls over HTTPS.

**1. Set the environment variables** in the Vercel project (Settings →
Environment Variables): `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`,
`DISCORD_PUBLIC_KEY`, `GEMINI_API_KEY`, plus any optional ones. The public key
is on the Developer Portal's General Information page and is what proves an
inbound request really came from Discord.

**2. Deploy.** `npx` avoids installing the CLI globally; the first run prompts
for scope and project name and writes a `.vercel/` link folder.

```bash
npx vercel login
```

```bash
npx vercel --prod
```

**3. Point Discord at it.** In the Developer Portal → General Information, set
**Interactions Endpoint URL** to `https://<your-project>.vercel.app/api/interactions`
and save. Discord immediately sends a signed `PING` plus deliberately invalid
probes; saving only succeeds if signature verification is correct, so a failure
here means the public key is wrong or missing.

**4. Register the commands** once, from your machine:

```bash
npm run deploy
```

**Why `vercel.json` skips the build.** `package.json`'s `build` script compiles
the _gateway_ bot into `dist/`, which Vercel has no use for — it builds `api/`
itself. Left alone, Vercel would run that script and then fail with _"No Output
Directory named `public` found"_, because it assumes a build script means a
static site. So [vercel.json](vercel.json) replaces the build command with a
no-op and points `outputDirectory` at [public/](public), which holds a single
placeholder page. Nothing about the bot is served from there.

**How it copes with the 3-second rule.** Discord drops an interaction that isn't
acknowledged within 3 seconds, and neither command finishes that fast. Both
reply immediately with a deferred "thinking…" response, then finish the real
work under Vercel's `waitUntil` and edit the placeholder via the follow-up
webhook.

**The one limit to watch.** That background work still has to finish inside the
function's `maxDuration` — set to 60s in [vercel.json](vercel.json). A
`/tldr messages:200` does two Discord fetches plus a Gemini call; if Gemini is
slow the invocation can be cut off, leaving "thinking…" that never updates. If
you see that, lower `DEFAULT_TLDR_MESSAGES` or raise `maxDuration` if your plan
allows it.

`/epub` is the command that limit really hurts: a full story is minutes of
fetching, so here it stops after 40 seconds and sends whatever it has. If you
want that command for real, use one of the shapes below.

### Option B — Linux VPS with systemd (most control, cheapest reliable)

Works on any small VPS; the bot idles at well under 150 MB, so the smallest
instance is fine. Oracle Cloud's Always Free ARM VM also works.

```bash
git clone <your-repo> /opt/blank-junior && cd /opt/blank-junior
npm ci && npm run build
cp .env.example .env && $EDITOR .env
npm run deploy:prod
```

```bash
sudo cp deploy/blank-junior.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now blank-junior
```

Logs with `journalctl -u blank-junior -f`. Edit `User` and `WorkingDirectory` in
the unit file first if you cloned elsewhere. It restarts on crash and starts on
boot, with a crash-loop limit so a bad config can't hammer Discord's API.

To update: `git pull && npm ci && npm run build && sudo systemctl restart blank-junior`.

### Option C — Docker (Fly.io, Railway, or your own box)

A multi-stage [Dockerfile](Dockerfile) is included; the runtime image carries
only `dist/` and production dependencies.

```bash
docker build -t blank-junior .
```

```bash
docker run -d --name blank-junior --restart unless-stopped --env-file .env blank-junior
```

On Fly.io or Railway, set the environment variables as platform secrets rather
than shipping a `.env`, and deploy it as a **worker/background** service, not a
web service — there is no port to health-check.

### Option D — a machine you already leave on

A Raspberry Pi or spare PC is free and perfectly adequate. Use the systemd unit
above on Linux. On Windows, `pm2 start dist/index.js --name blank-junior` plus
`pm2 save` and `pm2-startup` gets restart-on-boot.

### Operational notes

- **Node 18.17 or newer**, matching the `engines` field.
- **Never commit `.env`.** It is gitignored; put the secrets in the host's own
  secret storage where the platform offers it.
- **Discord.js reconnects by itself** after network blips; the process manager
  is there for outright crashes.
- **Running 24/7 does not change your Gemini quota** — that is per API key, not
  per host. More users reaching the bot does.

## Development

```bash
npm run typecheck
```

```bash
npm run smoke
```

```bash
npm run models
```

```bash
npm run probe
```

`npm run models` lists the Gemini models your API key can call — the only
reliable way to pick a `GEMINI_MODEL`, since availability varies by key.

`npm run probe` sends two tiny requests to your configured model, one plain and
one with Google Search grounding, and reports which quota refuses you. Use it
when a 429 appears but AI Studio shows no usage: that combination means a quota
of _zero_ rather than a spent one, and the two are indistinguishable from the
error alone.

`npm run smoke` runs both offline suites, 117 checks in all, against fakes — no
Discord connection or API key needed. `scripts/smoke.ts` covers reply chunking,
transcript building, history pagination (including the >100-message pagination
path), `/ocr` attachment vetting and the `/choose` draw; `scripts/smoke-http.ts`
covers the serverless entrypoint — Ed25519 signature verification against a real
keypair, and command routing.
Either can be run on its own with `npx tsx scripts/<name>.ts`.

## Notes

**Free-tier data use.** Google's free Gemini tier is free because usage may be
reviewed and used to improve their models; the paid tier carries different terms.
`/tldr` sends the channel's recent messages to that API, so anyone running this
should decide deliberately which channels it points at, and tell their members.
Check the current [terms](https://ai.google.dev/gemini-api/terms) before using it
on anything sensitive — this is the main tradeoff versus a paid API tier.

**Search suggestions.** Google's grounding terms ask applications to display the
Search Suggestions chips returned in `searchEntryPoint`. Those are HTML and can't
render in Discord, so the bot lists the grounded source links instead. Worth
reviewing against the current terms if you deploy this publicly.

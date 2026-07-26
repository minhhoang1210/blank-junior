/**
 * Offline test suite: exercises chunking, transcript building and history
 * pagination against fakes. No Discord connection, no Claude API calls.
 *
 *   npm run smoke
 */
import { Collection, type Message, type TextBasedChannel } from "discord.js";
import {
  buildTranscript,
  fetchRecentMessages,
  type CapturedMessage,
} from "../src/discord/history.js";
import { strings } from "../src/core/strings.js";
import { chunkForDiscord, truncate } from "../src/util/text.js";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}` +
      (ok ? "" : `\n      got      ${JSON.stringify(actual)}\n      expected ${JSON.stringify(expected)}`),
  );
}

function checkThat(label: string, condition: boolean): void {
  if (!condition) failures++;
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
}

// --- Discord chunking -------------------------------------------------------
console.log("--- Discord chunking");

check("empty input yields no chunks", chunkForDiscord(""), []);
check("short text stays whole", chunkForDiscord("hello world"), ["hello world"]);
check("text exactly at the limit stays whole", chunkForDiscord("a".repeat(2000)).length, 1);

const paragraphs = Array.from(
  { length: 40 },
  (_, i) => `Paragraph ${i} ${"filler ".repeat(20)}`.trim(),
).join("\n\n");
const chunks = chunkForDiscord(paragraphs);

checkThat("long text is split into multiple chunks", chunks.length > 1);
checkThat("every chunk respects the 2000-char limit", chunks.every((c) => c.length <= 2000));
check(
  "no words are lost or reordered when splitting",
  chunks.join(" ").split(/\s+/).filter(Boolean),
  paragraphs.split(/\s+/).filter(Boolean),
);

// A single unbroken run has no boundary to prefer — it must still be split.
const unbroken = "x".repeat(5000);
const unbrokenChunks = chunkForDiscord(unbroken);
checkThat("unbroken text is hard-split", unbrokenChunks.length === 3);
checkThat(
  "hard-split chunks respect the limit",
  unbrokenChunks.every((c) => c.length <= 2000),
);
check("hard-split preserves every character", unbrokenChunks.join("").length, 5000);

check("truncate leaves short strings alone", truncate("abc", 10), "abc");
check("truncate clips with an ellipsis", truncate("abcdefghij", 5), "abcd…");

// --- Transcript building ----------------------------------------------------
console.log("\n--- Transcript building");

function captured(overrides: Partial<CapturedMessage>): CapturedMessage {
  return {
    id: "1",
    author: "Alice",
    isBot: false,
    createdAt: new Date(Date.UTC(2026, 6, 25, 8, 31)),
    content: "hello",
    attachments: 0,
    ...overrides,
  };
}

check(
  "renders timestamp, author and content",
  buildTranscript([captured({})]),
  "[07-25 08:31] Alice: hello",
);
check(
  "labels bot authors",
  buildTranscript([captured({ author: "Helper", isBot: true })]),
  "[07-25 08:31] Helper [bot]: hello",
);
check(
  "notes attachments",
  buildTranscript([captured({ attachments: 2 })]),
  "[07-25 08:31] Alice: hello <2 attachments>",
);
check(
  "keeps messages in the given order",
  buildTranscript([
    captured({ id: "1", content: "first" }),
    captured({ id: "2", content: "second" }),
  ]),
  "[07-25 08:31] Alice: first\n[07-25 08:31] Alice: second",
);

// 200 messages of ~1200 chars each blows past the 120k ceiling.
const oversized = Array.from({ length: 200 }, (_, i) =>
  captured({ id: String(i), content: `${i} ${"y".repeat(1200)}` }),
);
const trimmedTranscript = buildTranscript(oversized);
checkThat("oversized transcript is capped", trimmedTranscript.length <= 120_000 + 100);
checkThat(
  "oversized transcript says what was dropped",
  trimmedTranscript.startsWith("[…") && trimmedTranscript.includes("older message"),
);
checkThat(
  "oversized transcript keeps the newest message",
  trimmedTranscript.includes(`199 ${"y".repeat(20)}`),
);

// --- Summary title ----------------------------------------------------------
console.log("\n--- Summary title");

check("names the channel when it is known", strings.tldr.title("general"), "Tóm tắt — #general");
check("keeps unicode channel names", strings.tldr.title("thảo-luận"), "Tóm tắt — #thảo-luận");
check("omits the channel when unknown", strings.tldr.title(undefined), "Tóm tắt");
checkThat(
  "never prints the placeholder as a channel name",
  !strings.tldr.title(undefined).includes(strings.tldr.thisChannel),
);

// --- History pagination -----------------------------------------------------
console.log("\n--- History pagination");

const BOT_ID = "bot-self";

/** Newest message is id 999, descending — matching Discord's ordering. */
function makeFakeMessage(index: number, authorId = "user-1"): Message {
  return {
    id: String(index).padStart(4, "0"),
    author: { id: authorId, bot: authorId === BOT_ID, displayName: `User ${authorId}`, username: `u${authorId}` },
    member: null,
    cleanContent: `message ${index}`,
    attachments: new Collection(),
    embeds: [],
    createdAt: new Date(Date.UTC(2026, 6, 25, 8, 0)),
  } as unknown as Message;
}

interface FetchCall {
  limit: number;
  before?: string;
}

function makeFakeChannel(total: number, botEvery = 0): {
  channel: TextBasedChannel;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  // Descending ids, newest first, like the real API.
  const all = Array.from({ length: total }, (_, i) =>
    makeFakeMessage(total - 1 - i, botEvery > 0 && i % botEvery === 0 ? BOT_ID : "user-1"),
  );

  const channel = {
    isTextBased: () => true,
    messages: {
      fetch: async ({ limit, before }: { limit: number; before?: string }) => {
        calls.push({ limit, ...(before ? { before } : {}) });
        const startAt = before ? all.findIndex((m) => m.id === before) + 1 : 0;
        const slice = all.slice(startAt, startAt + limit);
        return new Collection(slice.map((m) => [m.id, m] as const));
      },
    },
  } as unknown as TextBasedChannel;

  return { channel, calls };
}

// 200 messages exceeds Discord's 100-per-fetch cap — the case the user asked for.
const { channel: big, calls: bigCalls } = makeFakeChannel(500);
const fetched200 = await fetchRecentMessages(big, 200, BOT_ID);

check("200 requested returns 200 messages", fetched200.length, 200);
check("200 requested takes two paginated fetches", bigCalls.length, 2);
check("both fetches use the 100-message cap", bigCalls.map((c) => c.limit), [100, 100]);
checkThat("the second fetch passes a before cursor", bigCalls[1]?.before !== undefined);
check("results are oldest-first", fetched200[0]?.content, "message 300");
check("newest message comes last", fetched200[199]?.content, "message 499");

const { channel: small, calls: smallCalls } = makeFakeChannel(500);
const single = await fetchRecentMessages(small, 50, BOT_ID);
check("50 requested returns 50 messages", single.length, 50);
check("under 100 requested takes a single fetch", smallCalls.length, 1);
check("a partial batch asks for exactly what's needed", smallCalls[0]?.limit, 50);

// A channel with fewer messages than requested must not loop forever.
const { channel: shallow, calls: shallowCalls } = makeFakeChannel(30);
const fetchedShallow = await fetchRecentMessages(shallow, 200, BOT_ID);
check("short channel returns what exists", fetchedShallow.length, 30);
checkThat("short channel stops fetching promptly", shallowCalls.length <= 2);

// The bot's own messages must not feed back into new summaries.
const { channel: mixed } = makeFakeChannel(100, 2);
const fetchedMixed = await fetchRecentMessages(mixed, 100, BOT_ID);
check("own-bot messages are excluded", fetchedMixed.length, 50);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

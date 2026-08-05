/**
 * Offline test suite: exercises chunking, transcript building and history
 * pagination against fakes. No Discord connection, no Gemini API calls.
 *
 *   npm run smoke
 */
import { Collection, type Message, type TextBasedChannel } from "discord.js";
import {
  buildTranscript,
  fetchRecentMessages,
  type CapturedMessage,
} from "../src/discord/history.js";
import {
  chooseCommand,
  formatChoice,
  MAX_CHOICES,
  MIN_CHOICES,
  parseChoices,
  pickIndex,
} from "../src/core/choose.js";
import { strings } from "../src/core/strings.js";
import {
  type AttachmentRef,
  describeImageProblem,
  MAX_IMAGE_BYTES,
  uploadNameFor,
} from "../src/discord/attachment.js";
import { chunkForDiscord, truncate } from "../src/util/text.js";
import { check, checkThat, report } from "./harness.js";

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

// --- /ocr attachment vetting ------------------------------------------------
console.log("\n--- /ocr attachment vetting");

function attached(overrides: Partial<AttachmentRef> = {}): AttachmentRef {
  return {
    url: "https://cdn.discordapp.com/attachments/1/2/menu.png",
    filename: "menu.png",
    contentType: "image/png",
    size: 120_000,
    ...overrides,
  };
}

check("a normal PNG is accepted", describeImageProblem(attached()), undefined);
check(
  "media.discordapp.net is accepted too",
  describeImageProblem(attached({ url: "https://media.discordapp.net/attachments/1/2/a.jpg" })),
  undefined,
);
check(
  "a charset parameter doesn't confuse the type check",
  describeImageProblem(attached({ contentType: "image/jpeg; charset=binary" })),
  undefined,
);
check(
  "an uppercase type is still recognised",
  describeImageProblem(attached({ contentType: "IMAGE/PNG" })),
  undefined,
);
check("size is optional", describeImageProblem(attached({ size: undefined })), undefined);

checkThat("a PDF is refused", describeImageProblem(attached({ contentType: "application/pdf" })) !== undefined);
checkThat("an SVG is refused", describeImageProblem(attached({ contentType: "image/svg+xml" })) !== undefined);
checkThat("an unknown type is refused", describeImageProblem(attached({ contentType: undefined })) !== undefined);
checkThat(
  "an oversized image is refused before it is downloaded",
  describeImageProblem(attached({ size: MAX_IMAGE_BYTES + 1 })) !== undefined,
);
checkThat(
  "an image exactly at the ceiling is allowed",
  describeImageProblem(attached({ size: MAX_IMAGE_BYTES })) === undefined,
);

// The URL is Discord's own, but the host is checked so the trust boundary is
// explicit rather than assumed.
checkThat(
  "a non-Discord host is refused",
  describeImageProblem(attached({ url: "https://evil.example.com/a.png" })) !== undefined,
);
checkThat(
  "a lookalike host is refused",
  describeImageProblem(attached({ url: "https://cdn.discordapp.com.evil.example/a.png" })) !==
    undefined,
);
checkThat(
  "a file:// url is refused",
  describeImageProblem(attached({ url: "file:///etc/passwd" })) !== undefined,
);
checkThat("a malformed url is refused", describeImageProblem(attached({ url: "not a url" })) !== undefined);

// The embed points at `attachment://<filename>`, so the name the reply uploads
// under has to be predictable — a mismatch renders as a broken image.
check("a PNG is re-uploaded as .png", uploadNameFor("image/png"), "anh.png");
check("a JPEG gets the short extension", uploadNameFor("image/jpeg"), "anh.jpg");
check("WebP keeps its own", uploadNameFor("image/webp"), "anh.webp");
checkThat(
  "the upload name is safe for an attachment:// reference",
  /^[a-z0-9.]+$/.test(uploadNameFor("image/heic")),
);

// --- /choose ----------------------------------------------------------------
console.log("\n--- /choose");

check("splits on the separator", parseChoices("a|b|c"), ["a", "b", "c"]);
check("trims spacing around each option", parseChoices(" a | b "), ["a", "b"]);
check("drops empty entries", parseChoices("a||b|"), ["a", "b"]);
check("keeps duplicates, which are how an option is weighted", parseChoices("a|a|b").length, 3);
check("a single option is not yet a choice", parseChoices("a").length, 1);
check("separators alone yield nothing", parseChoices("|||"), []);
check("keeps diacritics intact", parseChoices("Chương|Phiên ngoại"), ["Chương", "Phiên ngoại"]);

// The draw must stay inside the list, and must be able to reach either end of it.
const draws = Array.from({ length: 2000 }, () => pickIndex(3));
checkThat("every draw is a valid index", draws.every((index) => index >= 0 && index < 3));
check("every option can be drawn", [...new Set(draws)].sort(), [0, 1, 2]);

// 2000 uniform draws over 3 options land near 667 each; 500 is far outside the
// noise but loose enough that a fair picker will not trip it.
const tally = [0, 1, 2].map((index) => draws.filter((draw) => draw === index).length);
checkThat("the draw is not visibly skewed", tally.every((count) => count > 500));

const picked = formatChoice(["a", "b", "c"], 1);
check("announces the option at the drawn index", picked.text, "🎲 Mình chọn: **b**");
check("lists every candidate", picked.embeds[0]?.fields?.[0]?.value, "• a\n• **b**\n• c");
check("footer counts the candidates", picked.embeds[0]?.footer?.text, "3 phương án · chọn ngẫu nhiên");

const longOption = "x".repeat(200);
const clipped = formatChoice([longOption, "b"], 0);
checkThat(
  "the candidate list clips a long option",
  (clipped.embeds[0]?.fields?.[0]?.value.length ?? 0) < 100,
);
checkThat("but the drawn option is announced in full", clipped.text.includes(longOption));

const many = formatChoice(Array.from({ length: MAX_CHOICES }, (_, i) => `option ${i}`), 0);
checkThat(
  "a full list still fits Discord's 1024-char field cap",
  (many.embeds[0]?.fields?.[0]?.value.length ?? 0) <= 1024,
);

const drawn = chooseCommand(["a", "b"]);
checkThat(
  "the reply always names one of the options",
  drawn.text === "🎲 Mình chọn: **a**" || drawn.text === "🎲 Mình chọn: **b**",
);
checkThat("two is enough to choose between", MIN_CHOICES === 2);

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

report();

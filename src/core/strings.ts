/**
 * Command and interface text, in one place.
 *
 * The bot speaks Vietnamese, and the same messages are shown from two
 * transports (gateway client and serverless webhook). Keeping them here is what
 * stops the two paths drifting apart.
 *
 * Gemini's own error messages deliberately live in `gemini/client.ts` instead,
 * next to the status-code branching that chooses between them — they are
 * single-use and only make sense beside that logic.
 */
export const strings = {
  emptyResponse: "_(phản hồi trống)_",

  tldr: {
    command: "Tóm tắt các tin nhắn gần đây trong kênh này",
    option: (min: number, max: number, fallback: number) =>
      `Số tin nhắn gần đây cần tóm tắt (${min}-${max}, mặc định ${fallback})`,
    textChannelsOnly: "Mình chỉ tóm tắt được kênh văn bản thôi.",
    alreadyRunning:
      "Bạn đang có một bản tóm tắt đang chạy. Đợi nó xong đã nhé.",
    nothingToSummarise:
      "Không có gì để tóm tắt — mình không đọc được tin nhắn nào ở đây.",
    /** Used in the prompt when the channel's name could not be resolved. */
    thisChannel: "kênh này",
    /** Drops the "#name" part entirely rather than printing "#kênh này". */
    title: (channelName?: string) =>
      channelName ? `Tóm tắt — #${channelName}` : "Tóm tắt",
    /** Shown when the channel held fewer messages than were asked for. */
    footer: (read: number, requested: number) =>
      read < requested
        ? `${read} tin nhắn (tất cả những gì đọc được trong ${requested} tin đã yêu cầu) · tóm tắt bởi Gemini`
        : `${read} tin nhắn · tóm tắt bởi Gemini`,
  },

  ask: {
    command: "Hỏi Gemini một câu hỏi",
    option: "Bạn muốn biết điều gì?",
    blankQuestion: "Bạn hãy đặt một câu hỏi cụ thể nhé.",
    alreadyRunning: "Bạn đang có một câu hỏi đang xử lý. Đợi nó xong đã nhé.",
    sources: "Nguồn",
    grounded: "Gemini · có tra cứu Google Search",
    ungrounded: "Gemini · trả lời không tra cứu web",
    plain: "Gemini",
  },

  epub: {
    command: "Tải một truyện trên WordPress về dưới dạng EPUB",
    option: "Liên kết tới trang mục lục của truyện (hoặc tới một truyện ngắn một trang)",
    alreadyRunning: "Bạn đang có một truyện đang tải. Đợi nó xong đã nhé.",
    invalidUrl: "Đó không phải là một liên kết http/https hợp lệ.",

    readingIndex: "📖 Đang đọc trang mục lục…",
    downloading: (done: number, total: number) =>
      `📖 Đang tải chương ${done}/${total}…`,
    packing: "📦 Đang đóng gói EPUB…",
    retryingWithoutImages: "📦 Tệp quá lớn — đang đóng gói lại, bỏ ảnh minh hoạ…",

    ready: (title: string) => `📖 **${title}**`,
    /** Appended when the download did not cover the whole story. */
    truncated: (fetched: number, discovered: number) =>
      `\n⚠️ Mới tải được ${fetched}/${discovered} chương (hết thời gian hoặc chạm giới hạn).`,
    someFailed: (failed: number) => `\n⚠️ ${failed} chương không tải được và đã bị bỏ qua.`,

    chapters: "Chương",
    words: "Số từ",
    size: "Dung lượng",
    source: (host: string) => `Nguồn: ${host}`,

    tooLarge: (size: string, limit: string) =>
      `Tệp EPUB nặng ${size}, vượt quá giới hạn ${limit} của Discord. ` +
      "Hãy tải truyện này bằng công cụ trên máy, hoặc nâng `EPUB_MAX_UPLOAD_MB` " +
      "nếu máy chủ Discord của bạn cho phép tệp lớn hơn.",
    /** The serverless deployment cannot outlive its function timeout. */
    serverlessLimited:
      "Bản chạy trên Vercel chỉ có 60 giây cho mỗi lệnh, nên `/epub` ở đây chỉ tải được " +
      "truyện rất ngắn. Truyện dài cần bản bot chạy thường trực (gateway).",
  },

  unknownCommand: "Lệnh này mình chưa hỗ trợ.",
  commandFailed: "❌ Đã có lỗi khi xử lý lệnh này.",

  /** Raised when the channel's history can't be read. */
  missingHistoryPermission:
    "Mình không đọc được lịch sử của kênh này. Hãy chắc chắn mình có quyền **Xem kênh** " +
    "và **Đọc lịch sử tin nhắn** ở đây.",
} as const;

/** Prefix used on any error shown to a user. */
export function asError(message: string): string {
  return `❌ ${message}`;
}

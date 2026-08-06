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

  ocr: {
    command: "Đọc chữ trong một tấm ảnh",
    option: "Ảnh cần đọc chữ (PNG, JPEG, WebP, HEIC)",
    alreadyRunning: "Bạn đang có một ảnh đang được đọc. Đợi nó xong đã nhé.",
    missingImage: "Bạn hãy đính kèm một tấm ảnh nhé.",
    reading: "🔍 Đang đọc ảnh…",
    noText: "Mình không thấy chữ nào trong ảnh này.",
    footer: "Đọc bởi Gemini · giữ nguyên ngôn ngữ trong ảnh",
  },

  choose: {
    command: "Chọn ngẫu nhiên giúp bạn một trong nhiều phương án",
    option: "Các phương án, ngăn cách bằng dấu | — ví dụ: a | b | c",
    tooFew:
      "Hãy đưa ít nhất 2 phương án, ngăn cách bằng dấu `|`. " +
      "Ví dụ: `a | b | c`",
    tooMany: (max: number) =>
      `Nhiều quá — mình chỉ chọn được trong tối đa ${max} phương án.`,
    result: (choice: string) => `🎲 Mình chọn: **${choice}**`,
    candidates: "Các phương án",
    footer: (count: number) => `${count} phương án · chọn ngẫu nhiên`,
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

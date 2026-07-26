type Level = "info" | "warn" | "error";

function emit(level: Level, message: string, meta?: unknown): void {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  const stream = level === "info" ? console.log : level === "warn" ? console.warn : console.error;
  if (meta === undefined) stream(line);
  else stream(line, meta);
}

export const logger = {
  info: (message: string, meta?: unknown) => emit("info", message, meta),
  warn: (message: string, meta?: unknown) => emit("warn", message, meta),
  error: (message: string, meta?: unknown) => emit("error", message, meta),
};

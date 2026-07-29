/**
 * The three lines every smoke script needs: assert, count, exit.
 *
 * Shared so the two suites report failures identically and, more to the point,
 * so neither can quietly stop exiting non-zero — a test script that always
 * exits 0 looks exactly like a passing one.
 */
let failures = 0;

/** Compares by JSON shape, so arrays and objects can be asserted inline. */
export function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}` +
      (ok
        ? ""
        : `\n      got      ${JSON.stringify(actual)}\n      expected ${JSON.stringify(expected)}`),
  );
}

/** For conditions that don't reduce to an equality. */
export function checkThat(label: string, condition: boolean): void {
  if (!condition) failures++;
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
}

/** Prints the tally and sets the exit code. Call once, at the end of a suite. */
export function report(): void {
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

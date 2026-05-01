/** POSIX single-quote escaping for shell argument interpolation. */
export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

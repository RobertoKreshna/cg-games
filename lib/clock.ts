/** Wall-clock time in ms. A function (not an inline Date.now()) so event handlers can use it. */
export function now(): number {
  return Date.now()
}

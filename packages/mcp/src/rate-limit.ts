/**
 * Soft client-side limiter so a runaway agent loop doesn't hammer the upstream API.
 * Hard limits live in churnkey-api; this is just a courtesy throttle.
 */
export class RateLimiter {
  private timestamps: number[] = []

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  async acquire(): Promise<void> {
    const now = Date.now()
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs)
    if (this.timestamps.length >= this.maxRequests) {
      const wait = this.windowMs - (now - this.timestamps[0]!)
      await new Promise((r) => setTimeout(r, wait))
      return this.acquire()
    }
    this.timestamps.push(now)
  }
}

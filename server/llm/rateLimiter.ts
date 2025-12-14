/**
 * Rate Limiter for Gemini API
 * Limit: 7 requests per minute (user requirement)
 * Implements a token bucket algorithm with queue
 */

interface QueuedRequest<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

class RateLimiter {
  private queue: QueuedRequest<any>[] = [];
  private requestTimes: number[] = [];
  private maxRequests = 2;
  private windowMs = 60000; // 1 minute
  private processing = false;

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      // Clean up old requests outside the window
      const now = Date.now();
      this.requestTimes = this.requestTimes.filter(time => now - time < this.windowMs);

      // Check if we can make a request
      if (this.requestTimes.length < this.maxRequests) {
        const request = this.queue.shift();
        if (!request) break;

        this.requestTimes.push(now);
        
        try {
          const result = await request.fn();
          request.resolve(result);
        } catch (error) {
          request.reject(error instanceof Error ? error : new Error(String(error)));
        }
      } else {
        // Wait before trying again
        const oldestRequest = this.requestTimes[0];
        const waitTime = Math.max(100, this.windowMs - (now - oldestRequest));
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    this.processing = false;
  }
}

// Global instance
export const geminiRateLimiter = new RateLimiter();

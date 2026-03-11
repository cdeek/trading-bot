import logger from "./logger.ts";

export class CircuitBreaker {
  private failures = 0;
  private maxFailures: number;
  private isTripped = false;

  constructor(maxFailures: number = 3) {
    this.maxFailures = maxFailures;
  }

  recordFailure(error: any) {
    this.failures++;
    logger.error(
      `[Breaker] Failure #${this.failures}:`,
      error?.message || error
    );

    if (this.failures >= this.maxFailures) {
      this.isTripped = true;
      logger.error(
        "!!! CIRCUIT BREAKER TRIPPED: Bot Halted to protect SOL balance !!!"
      );
    }
  }

  recordSuccess() {
    this.failures = 0; // Reset on any successful trade
  }

  check() {
    if (this.isTripped) {
      throw new Error(
        "Cannot execute: Circuit breaker is OPEN. Please check logs and restart."
      );
    }
  }
}

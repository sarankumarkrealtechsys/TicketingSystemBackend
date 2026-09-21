/**
 * Ticket Aging Calculation and Bucketing Helper
 * Reusable utility across Ticket List (Phase 13), Aging Report (Phase 15), and Dashboard Widgets (Phase 14).
 */

const AGING_BUCKETS = ["0-24h", "1-3 days", "3-7 days", "7+ days"];

/**
 * Calculates ticket age in total hours, days, formatted string, and elapsed milliseconds.
 *
 * @param {Date|string} createdAt - Ticket creation timestamp
 * @param {Date|string|null} [closedAt=null] - Ticket closure timestamp (if closed)
 * @param {number} [referenceTimestamp=Date.now()] - Baseline timestamp for calculation
 * @returns {{ hours: number, days: number, formatted: string, diffMs: number }}
 */
const calculateTicketAge = (
  createdAt,
  closedAt = null,
  referenceTimestamp = Date.now(),
) => {
  const endMs = closedAt ? new Date(closedAt).getTime() : referenceTimestamp;
  const startMs = new Date(createdAt).getTime();
  const diffMs = Math.max(0, endMs - startMs);

  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  return {
    hours: totalHours,
    days,
    formatted: days > 0 ? `${days}d ${hours}h` : `${totalHours}h`,
    diffMs,
  };
};

/**
 * Maps total age in hours to one of the four standard aging report buckets:
 * - "0-24h": 0 to <24 hours
 * - "1-3 days": 24 to <72 hours (1 to <3 days)
 * - "3-7 days": 72 to <168 hours (3 to <7 days)
 * - "7+ days": >=168 hours (7+ days)
 *
 * @param {number} totalHours
 * @returns {"0-24h" | "1-3 days" | "3-7 days" | "7+ days"}
 */
const getAgingBucket = (totalHours) => {
  if (totalHours < 24) {
    return "0-24h";
  }
  if (totalHours < 72) {
    return "1-3 days";
  }
  if (totalHours < 168) {
    return "3-7 days";
  }
  return "7+ days";
};

module.exports = {
  AGING_BUCKETS,
  calculateTicketAge,
  getAgingBucket,
};

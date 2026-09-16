/**
 * Ticket Number Generation Service (Isolated)
 *
 * Enforces format: RTS-DDMMYYC
 * Uses PostgreSQL atomic UPSERT with row locking on DailyTicketSequence:
 *   INSERT ... ON CONFLICT ("sequenceDate") DO UPDATE SET "lastValue" = daily_ticket_sequences."lastValue" + 1 RETURNING "lastValue"
 * Guarantees zero race conditions, zero duplicate ticket numbers under concurrency,
 * and automatic sequence reset on each calendar day.
 */

const generateTicketNumber = async (tx, date = new Date()) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year2 = String(date.getFullYear()).slice(-2);
  const ddmmyy = `${day}${month}${year2}`;

  const sequenceDateStr = `${date.getFullYear()}-${month}-${day}`;

  const [row] = await tx.$queryRawUnsafe(
    `
    INSERT INTO daily_ticket_sequences ("sequenceDate", "lastValue")
    VALUES ($1::date, 1)
    ON CONFLICT ("sequenceDate")
    DO UPDATE SET "lastValue" = daily_ticket_sequences."lastValue" + 1
    RETURNING "lastValue";
  `,
    sequenceDateStr,
  );

  const counter = Number(row.lastValue);
  const ticketNumber = `RTS-${ddmmyy}${counter}`;

  return {
    ticketNumber,
    counter,
    sequenceDate: sequenceDateStr,
  };
};

module.exports = {
  generateTicketNumber,
};

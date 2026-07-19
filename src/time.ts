import type { TimeSlot } from "./types";

export const FIVE_MINUTES = 5 * 60 * 1000;

export function floorToFiveMinutes(timestamp: number): number {
  return Math.floor(timestamp / FIVE_MINUTES) * FIVE_MINUTES;
}

export function nextFiveMinuteSlot(timestamp: number): number {
  return Math.ceil(timestamp / FIVE_MINUTES) * FIVE_MINUTES;
}

export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

export function buildTimeSlots(now: number, count = 25): TimeSlot[] {
  const start = floorToFiveMinutes(now);
  return Array.from({ length: count }, (_, index) => {
    const timestamp = start + index * FIVE_MINUTES;
    return {
      timestamp,
      label: formatTime(timestamp),
      isPast: timestamp < now,
    };
  });
}

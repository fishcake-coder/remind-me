import type { TimeSlot } from "./types";

export const ONE_MINUTE = 60 * 1000;
export const FIVE_MINUTES = 5 * 60 * 1000;

export function floorToInterval(timestamp: number, intervalMinutes: number): number {
  const interval = intervalMinutes * ONE_MINUTE;
  return Math.floor(timestamp / interval) * interval;
}

export function nextIntervalSlot(timestamp: number, intervalMinutes: number): number {
  const interval = intervalMinutes * ONE_MINUTE;
  return Math.ceil(timestamp / interval) * interval;
}

export function floorToFiveMinutes(timestamp: number): number {
  return floorToInterval(timestamp, 5);
}

export function nextFiveMinuteSlot(timestamp: number): number {
  return nextIntervalSlot(timestamp, 5);
}

export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

export function buildTimeSlots(
  now: number,
  intervalMinutes = 5,
  durationMinutes = 90,
  includedTimestamps: number[] = [],
): TimeSlot[] {
  const interval = intervalMinutes * ONE_MINUTE;
  const start = floorToInterval(now, intervalMinutes);
  const end = now + durationMinutes * ONE_MINUTE;
  const timestamps = new Set<number>();

  for (let timestamp = start; timestamp <= end; timestamp += interval) {
    timestamps.add(timestamp);
  }
  for (const timestamp of includedTimestamps) {
    if (timestamp >= start && timestamp <= end) timestamps.add(timestamp);
  }

  return [...timestamps]
    .sort((left, right) => left - right)
    .map((timestamp) => ({
      timestamp,
      label: formatTime(timestamp),
      isPast: timestamp < now,
    }));
}

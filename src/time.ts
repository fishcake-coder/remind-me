import type { TimeSlot } from "./types";

export const ONE_MINUTE = 60 * 1000;
export const FIVE_MINUTES = 5 * 60 * 1000;
export const TIMELINE_SLOT_COUNT = 90;

export function timelineDurationMinutes(intervalMinutes: number): number {
  return intervalMinutes * TIMELINE_SLOT_COUNT;
}

export function formatTimelineDuration(durationMinutes: number): string {
  if (durationMinutes < 120) return `${durationMinutes} min`;
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

export function floorToInterval(timestamp: number, intervalMinutes: number): number {
  const interval = intervalMinutes * ONE_MINUTE;
  return Math.floor(timestamp / interval) * interval;
}

export function nextIntervalSlot(timestamp: number, intervalMinutes: number): number {
  const interval = intervalMinutes * ONE_MINUTE;
  return Math.floor(timestamp / interval) * interval + interval;
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
  const start = nextIntervalSlot(now, intervalMinutes);
  const end = now + durationMinutes * ONE_MINUTE;
  const timestamps = new Set<number>();

  for (let timestamp = start; timestamp <= end; timestamp += interval) {
    timestamps.add(timestamp);
  }
  for (const timestamp of includedTimestamps) {
    if (timestamp > now && timestamp <= end) timestamps.add(timestamp);
  }

  return [...timestamps]
    .sort((left, right) => left - right)
    .map((timestamp) => ({
      timestamp,
      label: formatTime(timestamp),
    }));
}

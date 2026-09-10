import type { TimeSlot } from "./types";

export const ONE_MINUTE = 60 * 1000;
export const FIVE_MINUTES = 5 * 60 * 1000;
export const TIMELINE_SLOT_COUNT = 90;

// Labels change on minute boundaries. Exact reminder times can also enter or
// leave the visible window between minutes, so wake at those boundaries too.
export function nextTimelineRefresh(now: number, durationMinutes: number, timestamps: number[]): number {
  let next = Math.floor(now / ONE_MINUTE) * ONE_MINUTE + ONE_MINUTE;
  for (const timestamp of timestamps) {
    for (const boundary of [timestamp, timestamp - durationMinutes * ONE_MINUTE]) {
      if (boundary > now && boundary < next) next = boundary;
    }
  }
  return Math.max(1, next - now);
}

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

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatTime(timestamp: number): string {
  return timeFormatter.format(timestamp);
}

export function formatTimeAgo(timestamp: number, now: number): string {
  const elapsedMinutes = Math.max(0, Math.floor((now - timestamp) / ONE_MINUTE));
  if (elapsedMinutes < 1) return "now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  if (elapsedMinutes < 24 * 60) return `${Math.floor(elapsedMinutes / 60)}h ago`;
  return `${Math.floor(elapsedMinutes / (24 * 60))}d ago`;
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
  const included = includedTimestamps.filter((timestamp) => timestamp > now && timestamp <= end);
  const includedLabels = new Set(included.map(formatTime));

  for (let timestamp = start; timestamp <= end; timestamp += interval) {
    if (!includedLabels.has(formatTime(timestamp))) timestamps.add(timestamp);
  }
  for (const timestamp of included) timestamps.add(timestamp);

  return [...timestamps]
    .sort((left, right) => left - right)
    .map((timestamp) => ({
      timestamp,
      label: formatTime(timestamp),
    }));
}

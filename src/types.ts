export type Reminder = {
  id: string;
  title: string;
  scheduledAt: number;
  completed: boolean;
  notifiedAt: number | null;
};

export type DragPayload =
  | { type: "create" }
  | { type: "move"; id: string };

export type TimeSlot = {
  timestamp: number;
  label: string;
  isPast: boolean;
};

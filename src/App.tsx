import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { CheckIcon, CloseIcon, GripIcon } from "./icons";
import { reminderApi } from "./reminderApi";
import { buildTimeSlots, formatTime, nextFiveMinuteSlot } from "./time";
import type { DragPayload, Reminder } from "./types";
import { UpdateDialog } from "./UpdateDialog";
import { updateApi } from "./updateApi";
import "./styles.css";

const REFRESH_INTERVAL = 15_000;
const UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1_000;
const SLOT_COUNT = 19;

type PointerDrag = {
  payload: DragPayload;
  label: string;
  pointerId: number;
  source: HTMLElement;
  startX: number;
  startY: number;
  moved: boolean;
};

type DragPosition = {
  x: number;
  y: number;
  label: string;
};

function ReminderChip({ reminder, onPointerDrag, onComplete, onDelete }: {
  reminder: Reminder;
  onPointerDrag: (event: ReactPointerEvent<HTMLElement>, payload: DragPayload, label: string) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="reminder-chip">
      <button
        className="chip-grip"
        type="button"
        onPointerDown={(event) => onPointerDrag(event, { type: "move", id: reminder.id }, reminder.title)}
        aria-label={`Move ${reminder.title}`}
      >
        <GripIcon size={15} />
      </button>
      <span className="chip-title">{reminder.title}</span>
      <button className="chip-action" type="button" onClick={() => onComplete(reminder.id)} aria-label={`Complete ${reminder.title}`}>
        <CheckIcon size={16} />
      </button>
      <button className="chip-action is-delete" type="button" onClick={() => onDelete(reminder.id)} aria-label={`Delete ${reminder.title}`}>
        <CloseIcon size={16} />
      </button>
    </div>
  );
}

export default function App() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [title, setTitle] = useState("");
  const [now, setNow] = useState(Date.now());
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [dragPosition, setDragPosition] = useState<DragPosition | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [availableUpdate, setAvailableUpdate] = useState<Awaited<ReturnType<typeof updateApi.check>>>(null);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const activeDragRef = useRef<PointerDrag | null>(null);
  const dragTargetRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const dismissedUpdateRef = useRef<string | null>(null);

  const slots = useMemo(() => buildTimeSlots(now, SLOT_COUNT), [now]);
  const remindersByTime = useMemo(() => {
    const map = new Map<number, Reminder[]>();
    for (const reminder of reminders) {
      if (reminder.completed) continue;
      const group = map.get(reminder.scheduledAt);
      if (group) group.push(reminder);
      else map.set(reminder.scheduledAt, [reminder]);
    }
    return map;
  }, [reminders]);

  const refresh = useCallback(async () => {
    try {
      setReminders(await reminderApi.list());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load reminders");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, REFRESH_INTERVAL);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 2400);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    let disposed = false;

    const checkForUpdates = async () => {
      try {
        const update = await updateApi.check();
        if (!disposed && update && update.version !== dismissedUpdateRef.current) {
          setAvailableUpdate(update);
        }
      } catch {
        // Update checks are deliberately silent so offline use is never interrupted.
      }
    };

    const startupTimer = window.setTimeout(() => void checkForUpdates(), 1_500);
    const interval = window.setInterval(() => void checkForUpdates(), UPDATE_CHECK_INTERVAL);
    return () => {
      disposed = true;
      window.clearTimeout(startupTimer);
      window.clearInterval(interval);
    };
  }, []);

  const installUpdate = async () => {
    if (!availableUpdate || installingUpdate) return;
    setInstallingUpdate(true);
    try {
      await availableUpdate.install();
    } catch {
      setInstallingUpdate(false);
      setMessage("Update could not be installed. Try again later.");
    }
  };

  const dismissUpdate = () => {
    if (!availableUpdate || installingUpdate) return;
    dismissedUpdateRef.current = availableUpdate.version;
    setAvailableUpdate(null);
  };

  const createAt = async (scheduledAt: number) => {
    const cleanTitle = title.trim() || "Reminder";
    setSaving(true);
    try {
      const created = await reminderApi.create(cleanTitle, scheduledAt);
      setReminders((current) => [...current, created]);
      setTitle("");
      setMessage(`Set for ${formatTime(scheduledAt)}`);
      inputRef.current?.focus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save reminder");
    } finally {
      setSaving(false);
    }
  };

  const moveTo = async (id: string, scheduledAt: number) => {
    const before = reminders;
    setReminders((current) => current.map((item) => item.id === id ? { ...item, scheduledAt } : item));
    try {
      const moved = await reminderApi.move(id, scheduledAt);
      setReminders((current) => current.map((item) => item.id === id ? moved : item));
      setMessage(`Moved to ${formatTime(scheduledAt)}`);
    } catch (error) {
      setReminders(before);
      setMessage(error instanceof Error ? error.message : "Could not move reminder");
    }
  };

  const complete = async (id: string) => {
    const before = reminders;
    setReminders((current) => current.map((item) => item.id === id ? { ...item, completed: true } : item));
    try {
      await reminderApi.complete(id);
    } catch {
      setReminders(before);
      setMessage("Could not complete reminder");
    }
  };

  const remove = async (id: string) => {
    const before = reminders;
    setReminders((current) => current.filter((item) => item.id !== id));
    try {
      await reminderApi.remove(id);
    } catch {
      setReminders(before);
      setMessage("Could not delete reminder");
    }
  };

  const beginPointerDrag = (
    event: ReactPointerEvent<HTMLElement>,
    payload: DragPayload,
    label: string,
  ) => {
    if (saving || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activeDragRef.current = {
      payload,
      label,
      pointerId: event.pointerId,
      source: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    dragTargetRef.current = null;
    setDragPosition({ x: event.clientX, y: event.clientY, label });
  };

  const updatePointerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = activeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (distance > 5) drag.moved = true;

    const hovered = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-slot-time]");
    const validTarget = hovered?.dataset.slotPast !== "true";
    const timestamp = hovered && validTarget ? Number(hovered.dataset.slotTime) : null;
    const target = timestamp !== null && Number.isFinite(timestamp) ? timestamp : null;
    dragTargetRef.current = target;
    setDragOver(target);
    setDragPosition({ x: event.clientX, y: event.clientY, label: drag.label });

    const timeline = timelineRef.current;
    if (!timeline) return;
    const bounds = timeline.getBoundingClientRect();
    if (event.clientY < bounds.top + 44) timeline.scrollBy({ top: -16 });
    else if (event.clientY > bounds.bottom - 44) timeline.scrollBy({ top: 16 });
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLElement>, cancelled = false) => {
    const drag = activeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const target = dragTargetRef.current;
    suppressClickRef.current = drag.moved;
    if (drag.source.hasPointerCapture(drag.pointerId)) drag.source.releasePointerCapture(drag.pointerId);
    activeDragRef.current = null;
    dragTargetRef.current = null;
    setDragPosition(null);
    setDragOver(null);
    if (cancelled || target === null || saving) return;
    if (drag.payload.type === "move") void moveTo(drag.payload.id, target);
    else void createAt(target);
  };

  const scheduleNext = () => void createAt(nextFiveMinuteSlot(Date.now()));

  return (
    <main
      className={`app-shell${dragPosition ? " is-dragging" : ""}`}
      onPointerMove={updatePointerDrag}
      onPointerUp={(event) => finishPointerDrag(event)}
      onPointerCancel={(event) => finishPointerDrag(event, true)}
    >
      <header className="utility-header">
        <h1>Remind me</h1>
        <kbd title="Global shortcut">Ctrl Alt R</kbd>
      </header>

      <section className="composer" aria-label="New reminder">
        <input
          ref={inputRef}
          id="reminder-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !saving) scheduleNext();
          }}
          placeholder="What needs remembering?"
          maxLength={160}
          autoFocus
        />
        <button
          className="composer-grip"
          type="button"
          onPointerDown={(event) => beginPointerDrag(event, { type: "create" }, title.trim() || "Reminder")}
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            if (!saving) scheduleNext();
          }}
          disabled={saving}
          aria-label="Drag to a time, or click to schedule at the next five-minute slot"
        >
          <GripIcon size={18} />
        </button>
      </section>

      <section className="timeline-section" aria-labelledby="timeline-title">
        <h2 id="timeline-title">Next 90 min</h2>
        <div ref={timelineRef} className="timeline" role="list" aria-label="Five-minute reminder slots">
          <div className="now-line" aria-hidden="true"><span /></div>
          {slots.map((slot) => {
            const slotReminders = remindersByTime.get(slot.timestamp) ?? [];
            const highlighted = dragOver === slot.timestamp;
            return (
              <div
                className={`time-slot${slot.isPast ? " is-past" : ""}${highlighted ? " is-target" : ""}`}
                key={slot.timestamp}
                role="listitem"
                data-slot-time={slot.timestamp}
                data-slot-past={slot.isPast}
              >
                <time dateTime={new Date(slot.timestamp).toISOString()}>{slot.label}</time>
                <span className="rail-dot" aria-hidden="true" />
                <div className="slot-content">
                  {slotReminders.map((reminder) => (
                    <ReminderChip
                      key={reminder.id}
                      reminder={reminder}
                      onPointerDrag={beginPointerDrag}
                      onComplete={complete}
                      onDelete={remove}
                    />
                  ))}
                  {highlighted && slotReminders.length === 0 && <span className="drop-hint">Drop here</span>}
                  {!slot.isPast && slotReminders.length === 0 && !highlighted && (
                    <button
                      className="slot-quick-add"
                      type="button"
                      onClick={() => void createAt(slot.timestamp)}
                      aria-label={`Set reminder for ${slot.label}`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {dragPosition && (
        <div
          className="drag-ghost"
          style={{ transform: `translate3d(${dragPosition.x + 12}px, ${dragPosition.y + 12}px, 0)` }}
          aria-hidden="true"
        >
          {dragPosition.label}
        </div>
      )}
      {availableUpdate && (
        <UpdateDialog
          version={availableUpdate.version}
          notes={availableUpdate.notes}
          installing={installingUpdate}
          onInstall={() => void installUpdate()}
          onLater={dismissUpdate}
        />
      )}
      <div className={`toast${message ? " is-visible" : ""}`} role="status" aria-live="polite">{message}</div>
    </main>
  );
}

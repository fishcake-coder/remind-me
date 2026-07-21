import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { dragAutoScrollVelocity } from "./drag";
import { CheckIcon, CloseIcon, GripIcon, SettingsIcon } from "./icons";
import { reminderApi } from "./reminderApi";
import { SettingsDialog } from "./SettingsDialog";
import type { ManualUpdateStatus } from "./SettingsDialog";
import { loadSettings, saveSettings } from "./settings";
import type { NotificationSound } from "./settings";
import { soundApi } from "./soundApi";
import { buildTimeSlots, formatTime, formatTimelineDuration, nextIntervalSlot, timelineDurationMinutes } from "./time";
import type { DragPayload, Reminder } from "./types";
import { UpdateDialog } from "./UpdateDialog";
import { updateApi } from "./updateApi";
import type { AvailableUpdate } from "./updateApi";
import "./styles.css";

const REFRESH_INTERVAL = 15_000;
const CLOCK_INTERVAL = 1_000;
const UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1_000;

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

function ReminderChip({ reminder, onPointerDrag, onEdit, onComplete, onDelete }: {
  reminder: Reminder;
  onPointerDrag: (event: ReactPointerEvent<HTMLElement>, payload: DragPayload, label: string) => void;
  onEdit: (reminder: Reminder) => void;
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
      <button className="chip-title" type="button" onClick={() => onEdit(reminder)} aria-label={`Edit ${reminder.title}`}>
        {reminder.title}
      </button>
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
  const [settings, setSettings] = useState(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [manualUpdateStatus, setManualUpdateStatus] = useState<ManualUpdateStatus>("idle");
  const [soundSaving, setSoundSaving] = useState(false);
  const [timelineAdvancing, setTimelineAdvancing] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const activeDragRef = useRef<PointerDrag | null>(null);
  const dragTargetRef = useRef<number | null>(null);
  const dragPointerRef = useRef<{ x: number; y: number } | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const dismissedUpdateRef = useRef<string | null>(null);
  const updateCheckRef = useRef<Promise<AvailableUpdate | null> | null>(null);
  const previousSlotsRef = useRef<number[]>([]);
  const previousSlotHeightsRef = useRef(new Map<number, number>());

  const timelineDuration = timelineDurationMinutes(settings.slotInterval);

  const pendingTimestamps = useMemo(
    () => reminders.filter((reminder) => !reminder.completed).map((reminder) => reminder.scheduledAt),
    [reminders],
  );
  const slots = useMemo(
    () => buildTimeSlots(now, settings.slotInterval, timelineDuration, pendingTimestamps),
    [now, pendingTimestamps, settings.slotInterval, timelineDuration],
  );
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
    const clockTimer = window.setInterval(() => setNow(Date.now()), CLOCK_INTERVAL);
    const refreshTimer = window.setInterval(() => void refresh(), REFRESH_INTERVAL);
    return () => {
      window.clearInterval(clockTimer);
      window.clearInterval(refreshTimer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!reminderApi.isNative) return;
    let unlisten: (() => void) | undefined;
    void listen("reminders-changed", () => void refresh())
      .then((stopListening) => {
        unlisten = stopListening;
      })
      .catch(() => undefined);
    return () => unlisten?.();
  }, [refresh]);

  useLayoutEffect(() => {
    const previous = previousSlotsRef.current;
    const current = slots.map((slot) => slot.timestamp);
    const previousFirst = previous[0];
    const currentFirst = current[0];
    let animationFrame: number | undefined;

    if (previousFirst !== undefined && currentFirst !== undefined && currentFirst > previousFirst) {
      const timeline = timelineRef.current;
      if (timeline && timeline.scrollTop > 1) {
        const removedHeight = previous
          .filter((timestamp) => timestamp < currentFirst)
          .reduce((total, timestamp) => total + (previousSlotHeightsRef.current.get(timestamp) ?? 39), 0);
        timeline.scrollTop = Math.max(0, timeline.scrollTop - removedHeight);
      } else {
        setTimelineAdvancing(true);
        animationFrame = window.requestAnimationFrame(() => setTimelineAdvancing(false));
      }
    }
    const timeline = timelineRef.current;
    if (timeline) {
      previousSlotHeightsRef.current = new Map(
        [...timeline.querySelectorAll<HTMLElement>("[data-slot-time]")]
          .map((element) => [Number(element.dataset.slotTime), element.offsetHeight]),
      );
    }
    previousSlotsRef.current = current;
    return () => {
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
    };
  }, [slots]);

  useEffect(() => () => {
    if (autoScrollFrameRef.current !== null) window.cancelAnimationFrame(autoScrollFrameRef.current);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 2400);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    let disposed = false;
    void soundApi.get()
      .then((notificationSound) => {
        if (!disposed) setSettings((current) => ({ ...current, notificationSound }));
      })
      .catch(() => {
        if (!disposed) setMessage("Could not load notification sound");
      });
    return () => {
      disposed = true;
    };
  }, []);

  const checkForUpdates = useCallback(async (manual: boolean) => {
    if (manual) setManualUpdateStatus("checking");
    let checkPromise = updateCheckRef.current;
    if (!checkPromise) {
      checkPromise = updateApi.check();
      updateCheckRef.current = checkPromise;
    }

    try {
      const update = await checkPromise;
      if (update && (manual || update.version !== dismissedUpdateRef.current)) {
        setAvailableUpdate(update);
        if (manual) {
          setManualUpdateStatus("idle");
          setSettingsOpen(false);
        }
      } else if (manual) {
        setManualUpdateStatus("upToDate");
      }
    } catch {
      if (manual) setManualUpdateStatus("error");
    } finally {
      if (updateCheckRef.current === checkPromise) updateCheckRef.current = null;
    }
  }, []);

  useEffect(() => {
    const startupTimer = window.setTimeout(() => void checkForUpdates(false), 1_500);
    const interval = window.setInterval(() => void checkForUpdates(false), UPDATE_CHECK_INTERVAL);
    return () => {
      window.clearTimeout(startupTimer);
      window.clearInterval(interval);
    };
  }, [checkForUpdates]);

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

  const beginEditingReminder = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setTitle(reminder.title);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const cancelEditingReminder = () => {
    setEditingReminder(null);
    setTitle("");
    inputRef.current?.focus();
  };

  const saveReminderEdit = async () => {
    if (!editingReminder || saving) return;
    const updatedTitle = title.trim();
    if (!updatedTitle) {
      setMessage("Type something to remember");
      inputRef.current?.focus();
      return;
    }
    const scheduledAt = reminders.find((item) => item.id === editingReminder.id)?.scheduledAt
      ?? editingReminder.scheduledAt;
    setSaving(true);
    try {
      const updated = await reminderApi.update(editingReminder.id, updatedTitle, scheduledAt);
      setReminders((current) => current.map((item) => item.id === editingReminder.id ? updated : item));
      setEditingReminder(null);
      setTitle("");
      setMessage("Reminder updated");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update reminder");
      inputRef.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  const complete = async (id: string) => {
    const before = reminders;
    setReminders((current) => current.filter((item) => item.id !== id));
    try {
      await reminderApi.complete(id);
    } catch {
      setReminders(before);
      setMessage("Could not complete reminder");
    }
  };

  const changeNotificationSound = async (notificationSound: NotificationSound) => {
    if (soundSaving || notificationSound === settings.notificationSound) return;
    setSoundSaving(true);
    try {
      await soundApi.set(notificationSound);
      setSettings((current) => ({ ...current, notificationSound }));
    } catch {
      setMessage("Could not save notification sound");
    } finally {
      setSoundSaving(false);
    }
  };

  const previewNotificationSound = async (notificationSound: NotificationSound) => {
    try {
      await soundApi.preview(notificationSound);
    } catch {
      setMessage("Could not play notification sound");
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
    dragPointerRef.current = { x: event.clientX, y: event.clientY };
    dragTargetRef.current = null;
    setDragPosition({ x: event.clientX, y: event.clientY, label });
    if (autoScrollFrameRef.current === null) {
      autoScrollFrameRef.current = window.requestAnimationFrame(runDragAutoScroll);
    }
  };

  const updateDragTarget = (clientX: number, clientY: number) => {
    const timeline = timelineRef.current;
    let sampleY = clientY;
    if (timeline) {
      const bounds = timeline.getBoundingClientRect();
      if (clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top - 24 && clientY <= bounds.bottom + 24) {
        sampleY = Math.min(bounds.bottom - 2, Math.max(bounds.top + 2, clientY));
      }
    }
    const hovered = document.elementFromPoint(clientX, sampleY)?.closest<HTMLElement>("[data-slot-time]");
    const timestamp = hovered ? Number(hovered.dataset.slotTime) : null;
    const target = timestamp !== null && Number.isFinite(timestamp) ? timestamp : null;
    dragTargetRef.current = target;
    setDragOver(target);
  };

  function runDragAutoScroll() {
    autoScrollFrameRef.current = null;
    const timeline = timelineRef.current;
    const pointer = dragPointerRef.current;
    if (!activeDragRef.current || !timeline || !pointer) return;
    const bounds = timeline.getBoundingClientRect();
    const velocity = dragAutoScrollVelocity(pointer.y, bounds.top, bounds.bottom);
    if (velocity !== 0) {
      const previousScrollTop = timeline.scrollTop;
      timeline.scrollTop += velocity;
      if (timeline.scrollTop !== previousScrollTop) updateDragTarget(pointer.x, pointer.y);
    }
    autoScrollFrameRef.current = window.requestAnimationFrame(runDragAutoScroll);
  }

  const updatePointerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = activeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (distance > 5) drag.moved = true;
    dragPointerRef.current = { x: event.clientX, y: event.clientY };
    updateDragTarget(event.clientX, event.clientY);
    setDragPosition({ x: event.clientX, y: event.clientY, label: drag.label });
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLElement>, cancelled = false) => {
    const drag = activeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const target = dragTargetRef.current;
    suppressClickRef.current = drag.moved;
    if (drag.source.hasPointerCapture(drag.pointerId)) drag.source.releasePointerCapture(drag.pointerId);
    activeDragRef.current = null;
    dragPointerRef.current = null;
    dragTargetRef.current = null;
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
    setDragPosition(null);
    setDragOver(null);
    if (cancelled || target === null || saving) return;
    if (drag.payload.type === "move") void moveTo(drag.payload.id, target);
    else void createAt(target);
  };

  const scheduleNext = () => void createAt(nextIntervalSlot(Date.now(), settings.slotInterval));

  return (
    <main
      className={`app-shell${dragPosition ? " is-dragging" : ""}`}
      onPointerMove={updatePointerDrag}
      onPointerUp={(event) => finishPointerDrag(event)}
      onPointerCancel={(event) => finishPointerDrag(event, true)}
    >
      <header className="utility-header">
        <h1>Remind me</h1>
        <div className="utility-actions">
          <kbd title="Global shortcut">Ctrl Alt R</kbd>
          <button type="button" className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings">
            <SettingsIcon size={17} />
          </button>
        </div>
      </header>

      <section className={`composer${editingReminder ? " is-editing" : ""}`} aria-label={editingReminder ? "Edit reminder" : "New reminder"}>
        <input
          ref={inputRef}
          id="reminder-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && editingReminder) cancelEditingReminder();
            else if (event.key === "Enter" && !saving) {
              if (editingReminder) void saveReminderEdit();
              else scheduleNext();
            }
          }}
          placeholder={editingReminder ? "Edit reminder" : "What needs remembering?"}
          maxLength={160}
          autoFocus
        />
        {editingReminder && (
          <button
            className="composer-cancel"
            type="button"
            onClick={cancelEditingReminder}
            disabled={saving}
            aria-label="Cancel editing"
            title="Cancel editing (Esc)"
          >
            <CloseIcon size={15} />
          </button>
        )}
        <button
          className={`composer-grip${editingReminder ? " is-save" : ""}`}
          type="button"
          onPointerDown={(event) => {
            if (!editingReminder) beginPointerDrag(event, { type: "create" }, title.trim() || "Reminder");
          }}
          onClick={() => {
            if (editingReminder) {
              void saveReminderEdit();
              return;
            }
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            if (!saving) scheduleNext();
          }}
          disabled={saving}
          aria-label={editingReminder
            ? `Save changes to ${editingReminder.title}`
            : `Drag to a time, or click to schedule at the next ${settings.slotInterval}-minute slot`}
        >
          {editingReminder ? <CheckIcon size={17} /> : <GripIcon size={18} />}
        </button>
      </section>

      <section className="timeline-section" aria-labelledby="timeline-title">
        <h2 id="timeline-title">Next {formatTimelineDuration(timelineDuration)}</h2>
        <div ref={timelineRef} className="timeline" role="list" aria-label={`${settings.slotInterval}-minute reminder slots`}>
          <div className={`timeline-track${timelineAdvancing ? " is-advancing" : ""}`}>
          {slots.map((slot) => {
            const slotReminders = remindersByTime.get(slot.timestamp) ?? [];
            const highlighted = dragOver === slot.timestamp;
            return (
              <div
                className={`time-slot${highlighted ? " is-target" : ""}`}
                key={slot.timestamp}
                role="listitem"
                data-slot-time={slot.timestamp}
              >
                <time dateTime={new Date(slot.timestamp).toISOString()}>{slot.label}</time>
                <span className="rail-dot" aria-hidden="true" />
                <div className="slot-content">
                  {slotReminders.length > 0 && <div className="slot-reminders" aria-label={`${slotReminders.length} ${slotReminders.length === 1 ? "reminder" : "reminders"} at ${slot.label}`}>
                    {slotReminders.map((reminder) => (
                      <ReminderChip
                        key={reminder.id}
                        reminder={reminder}
                        onPointerDrag={beginPointerDrag}
                        onEdit={beginEditingReminder}
                        onComplete={complete}
                        onDelete={remove}
                      />
                    ))}
                  </div>}
                  {highlighted && slotReminders.length === 0 && <span className="drop-hint">Drop here</span>}
                  {slotReminders.length === 0 && !highlighted && (
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
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          manualUpdateStatus={manualUpdateStatus}
          soundSaving={soundSaving}
          onChange={setSettings}
          onSoundChange={(sound) => void changeNotificationSound(sound)}
          onPreviewSound={(sound) => void previewNotificationSound(sound)}
          onCheckForUpdates={() => void checkForUpdates(true)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      <div className={`toast${message ? " is-visible" : ""}`} role="status" aria-live="polite">{message}</div>
    </main>
  );
}

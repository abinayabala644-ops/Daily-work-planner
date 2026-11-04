/**
 * Daily Work Planner - Pure Vanilla JavaScript Implementation
 *
 * Rules:
 * - Plans are saved in the Supabase table "planner_days" (user_id, day, start_min, end_min, slots).
 * - Fallback to localStorage under "dailyPlanner:<userId>" when offline or unconfigured.
 * - Always opens on Settings page on every visit with TODAY selected, or Summary if today has saved slots.
 * - Times stored as minutes since midnight; single 12-hour AM/PM formatting helper.
 * - Slot start time is never stored (derived sequentially from day.startMinutes).
 * - Slots 1 to N: NO checkbox and NO Completed / Not Completed buttons on ANY slot page.
 * - The LAST slot (ending at day.endMinutes) has Next open the Summary page.
 * - DAILY WORK SUMMARY PAGE:
 *     1. Title "Daily Work Summary" with formatted date, day range, and slot count.
 *     2. Organized list of ALL slots in time order (each card has ✓ Completed and ✗ Not Completed buttons).
 *     3. Unfinished plan banner ("This plan is not finished." + "Continue planning" button) if incomplete.
 *     4. Result card at the very end when all slots completed AND plan is finished; otherwise small hint line.
 *     5. Existing buttons: Back, Edit times, Start New Day (clears only the selected date).
 * - Multi-day support:
 *     - Yesterday, Today, Tomorrow quick buttons on first page.
 *     - Monthly calendar native dialog with full completion status indicators:
 *       Fully completed (green ✓), Partly completed (amber –), Not completed (red ✗), Planned unmarked (outline circle).
 *     - Per-date schedules stored under state.days["YYYY-MM-DD"].
 */

(function () {
  'use strict';

  const MIN_WORK_TIME = 9 * 60;  // 540 (9:00 AM)
  const MAX_WORK_TIME = 18 * 60; // 1080 (6:00 PM)
  const MIN_SLOT_DURATION = 5;

  let currentUserId = "anonymous";
  let storageKey = "dailyPlanner:anonymous";

  // --- LOCAL DATE HELPERS (Never use toISOString to avoid UTC shift bugs) ---
  function getLocalDateKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseLocalDateKey(dateKey) {
    const parts = dateKey.split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }

  function addDays(dateObj, days) {
    const res = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    res.setDate(res.getDate() + days);
    return res;
  }

  function formatFullDisplayDate(dateObj) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${days[dateObj.getDay()]}, ${dateObj.getDate()} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
  }

  function formatShortDisplayDate(dateObj) {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[dateObj.getDay()]}, ${dateObj.getDate()} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
  }

  function formatMonthTitle(year, monthIndex) {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${months[monthIndex]} ${year}`;
  }

  // --- STATE ---
  let state = {
    lastTimes: {
      startMinutes: MIN_WORK_TIME,
      endMinutes: MAX_WORK_TIME,
    },
    days: {}, // keyed by "YYYY-MM-DD"
  };

  // Runtime date selection (always starts at TODAY on load)
  const todayDate = new Date();
  let selectedDateKey = getLocalDateKey(todayDate);

  // Calendar modal viewing month/year
  let calendarViewYear = todayDate.getFullYear();
  let calendarViewMonth = todayDate.getMonth();

  let currentSlotIndex = 0;
  let unconfirmedSettingsChange = null;
  let durationChangeConfirm = null;
  let textSaveDebounceTimer = null;

  // DOM Views
  const views = {
    settings: document.getElementById('view-settings'),
    slot: document.getElementById('view-slot'),
    summary: document.getElementById('view-summary'),
  };

  // First Page Navigation Elements
  const btnYesterday = document.getElementById('btn-yesterday');
  const btnToday = document.getElementById('btn-today');
  const btnTomorrow = document.getElementById('btn-tomorrow');
  const selectedDateText = document.getElementById('selected-date-text');
  const calendarToggleBtn = document.getElementById('calendar-toggle-btn');

  // Settings Elements
  const startInput = document.getElementById('starting-time-input');
  const endInput = document.getElementById('ending-time-input');
  const settingsNextBtn = document.getElementById('settings-next-btn');
  const errorStartTime = document.getElementById('error-start-time');
  const errorEndTime = document.getElementById('error-end-time');

  // Slot Elements
  const slotBackBtn = document.getElementById('slot-back-btn');
  const slotBadge = document.getElementById('slot-badge');
  const slotDateDisplay = document.getElementById('slot-date-display');
  const slotLegacyNotice = document.getElementById('slot-legacy-notice');
  const slotStartDisplay = document.getElementById('slot-start-display');
  const slotStartHint = document.getElementById('slot-start-hint');
  const slotEndTimeInput = document.getElementById('slot-end-time');
  const slotRulesMessage = document.getElementById('slot-rules-message');
  const slotTaskInput = document.getElementById('slot-task-input');
  const slotNextBtn = document.getElementById('slot-next-btn');
  const slotEndLastHint = document.getElementById('slot-end-last-hint');

  // Summary Elements
  const summaryHeaderTitle = document.getElementById('summary-header-title');
  const summaryHeaderSubtitle = document.getElementById('summary-header-subtitle');
  const summaryUnfinishedBanner = document.getElementById('summary-unfinished-banner');
  const summaryContinuePlanningBtn = document.getElementById('summary-continue-planning-btn');
  const summaryEmptyState = document.getElementById('summary-empty-state');
  const summaryPlanThisDayBtn = document.getElementById('summary-plan-this-day-btn');
  const summaryCalendarToggleBtn = document.getElementById('summary-calendar-toggle-btn');
  const summaryBackBtn = document.getElementById('summary-back-btn');
  const summaryEditTimesBtn = document.getElementById('summary-edit-times-btn');
  const summaryStartNewDayBtn = document.getElementById('summary-start-new-day-btn');
  const summarySlotsList = document.getElementById('summary-slots-list');
  const summaryResultArea = document.getElementById('summary-result-area');
  const summaryFinishMessage = document.getElementById('summary-finish-message');
  const summarySaveSection = document.getElementById('summary-save-section');
  const summarySaveMessage = document.getElementById('summary-save-message');
  const summarySaveHint = document.getElementById('summary-save-hint');
  const summarySaveBtn = document.getElementById('summary-save-btn');

  // Calendar Dialog Elements
  const calendarDialog = document.getElementById('calendar-dialog');
  const calendarMonthTitle = document.getElementById('calendar-month-title');
  const calendarPrevMonthBtn = document.getElementById('calendar-prev-month-btn');
  const calendarNextMonthBtn = document.getElementById('calendar-next-month-btn');
  const calendarCloseBtn = document.getElementById('calendar-close-btn');
  const calendarDaysGrid = document.getElementById('calendar-days-grid');

  // Other Dialogs
  const newDayDialog = document.getElementById('new-day-dialog');
  const dialogCancelBtn = document.getElementById('dialog-cancel-btn');
  const dialogConfirmBtn = document.getElementById('dialog-confirm-btn');

  const settingsConfirmDialog = document.getElementById('settings-confirm-dialog');
  const settingsDialogCancel = document.getElementById('settings-dialog-cancel');
  const settingsDialogContinue = document.getElementById('settings-dialog-continue');

  const durationConfirmDialog = document.getElementById('duration-confirm-dialog');
  const durationDialogCancel = document.getElementById('duration-dialog-cancel');
  const durationDialogContinue = document.getElementById('duration-dialog-continue');

  // Log out button
  const btnLogout = document.getElementById('btn-logout');

  // --- TIME HELPERS ---
  function minutesToTimeString(minutes) {
    const norm = ((minutes % 1440) + 1440) % 1440;
    const h = Math.floor(norm / 60);
    const m = norm % 60;
    const hStr = h < 10 ? '0' + h : String(h);
    const mStr = m < 10 ? '0' + m : String(m);
    return `${hStr}:${mStr}`;
  }

  function timeStringToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const parts = timeStr.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
  }

  function formatMinutesTo12Hour(minutes) {
    const norm = ((minutes % 1440) + 1440) % 1440;
    let h = Math.floor(norm / 60);
    const m = norm % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    const mStr = m < 10 ? '0' + m : String(m);
    return `${h}:${mStr} ${ampm}`;
  }

  function formatRemainingTime(minutes) {
    if (minutes <= 0) return "0 min";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `${h} hr ${m} min`;
    if (h > 0 && m === 0) return `${h} hr`;
    return `${m} min`;
  }

  function parseFlexibleTime(input) {
    if (!input || typeof input !== 'string') {
      return { minutes: null, error: 'EMPTY' };
    }
    const raw = input.trim();
    if (!raw) {
      return { minutes: null, error: 'EMPTY' };
    }

    // Only allow digits, colon, dot, space, and a, p, m
    if (!/^[0-9:\.\sapmAPM]+$/.test(raw)) {
      return { minutes: null, error: 'INVALID' };
    }

    const lower = raw.toLowerCase().trim();

    let meridiem = null;
    let timePart = lower;
    if (lower.endsWith('am') || lower.endsWith('a.m.')) {
      meridiem = 'am';
      timePart = lower.replace(/a\.?m\.?$/, '').trim();
    } else if (lower.endsWith('pm') || lower.endsWith('p.m.')) {
      meridiem = 'pm';
      timePart = lower.replace(/p\.?m\.?$/, '').trim();
    } else if (/[a-z]/.test(lower)) {
      return { minutes: null, error: 'INVALID' };
    }

    let hour = null;
    let min = 0;

    if (/^(\d{1,2})[:\.\s]+(\d{1,2})$/.test(timePart)) {
      const match = timePart.match(/^(\d{1,2})[:\.\s]+(\d{1,2})$/);
      hour = parseInt(match[1], 10);
      min = parseInt(match[2], 10);
    } else if (/^\d{3,4}$/.test(timePart)) {
      if (timePart.length === 3) {
        hour = parseInt(timePart.slice(0, 1), 10);
        min = parseInt(timePart.slice(1), 10);
      } else {
        hour = parseInt(timePart.slice(0, 2), 10);
        min = parseInt(timePart.slice(2), 10);
      }
    } else if (/^\d{1,2}$/.test(timePart)) {
      hour = parseInt(timePart, 10);
      min = 0;
    } else {
      return { minutes: null, error: 'INVALID' };
    }

    if (isNaN(hour) || isNaN(min) || min < 0 || min > 59) {
      return { minutes: null, error: 'INVALID' };
    }

    if (meridiem) {
      if (hour < 1 || hour > 12) {
        return { minutes: null, error: 'INVALID' };
      }
      let h24 = hour % 12;
      if (meridiem === 'pm') {
        h24 += 12;
      }
      return { minutes: h24 * 60 + min, error: null };
    }

    // No am/pm specified
    if (hour >= 13 && hour <= 23) {
      return { minutes: hour * 60 + min, error: null };
    }

    if (hour === 0) {
      return { minutes: min, error: 'OUT_OF_RANGE' };
    }

    if (hour > 23) {
      return { minutes: null, error: 'INVALID' };
    }

    // Hour 1 to 12
    const morningHour = (hour === 12) ? 0 : hour;
    const afternoonHour = (hour === 12) ? 12 : (hour + 12);

    const morningMins = morningHour * 60 + min;
    const afternoonMins = afternoonHour * 60 + min;

    const morningInRange = morningMins >= 540 && morningMins <= 1080;
    const afternoonInRange = afternoonMins >= 540 && afternoonMins <= 1080;

    if (morningInRange && !afternoonInRange) {
      return { minutes: morningMins, error: null };
    }
    if (afternoonInRange && !morningInRange) {
      return { minutes: afternoonMins, error: null };
    }

    // Neither fits into 9:00 AM to 6:00 PM
    return { minutes: afternoonMins > 1080 ? afternoonMins : morningMins, error: 'OUT_OF_RANGE' };
  }


  // --- SUPABASE CLIENT HELPERS ---
  function areKeysPlaceholder() {
    return (
      typeof SUPABASE_URL === 'undefined' ||
      typeof SUPABASE_ANON_KEY === 'undefined' ||
      !SUPABASE_URL ||
      !SUPABASE_ANON_KEY ||
      SUPABASE_URL === 'PASTE_PROJECT_URL_HERE' ||
      SUPABASE_ANON_KEY === 'PASTE_ANON_KEY_HERE'
    );
  }

  function getSupabaseClient() {
    if (areKeysPlaceholder()) return null;
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      try {
        return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      } catch (e) {
        console.error('Supabase init error:', e);
        return null;
      }
    }
    return null;
  }

  const supabaseClient = getSupabaseClient();

  // --- STORAGE & PERSISTENCE ---
  function sanitizeSlots(slotsArray, dayStartMinutes = MIN_WORK_TIME) {
    if (!Array.isArray(slotsArray)) return [];
    let currentAccumulatedStart = typeof dayStartMinutes === "number" ? dayStartMinutes : MIN_WORK_TIME;

    return slotsArray.map((s, idx) => {
      let start = (typeof s?.start === "number" && !isNaN(s.start)) ? s.start : null;
      let end = (typeof s?.end === "number" && !isNaN(s.end)) ? s.end : null;

      // Backward compatibility: old saved slots with durationMinutes instead of start and end
      if (start === null && end === null && typeof s?.durationMinutes === "number" && !isNaN(s.durationMinutes) && s.durationMinutes > 0) {
        start = currentAccumulatedStart;
        end = start + s.durationMinutes;
        currentAccumulatedStart = end;
      }

      const taskText = typeof s?.taskText === "string" ? s.taskText : (typeof s?.text === "string" ? s.text : "");
      const status = (s?.status === "COMPLETED" || s?.status === "NOT_COMPLETED") ? s.status : "NONE";
      const markedAt = (status !== "NONE" && (typeof s?.markedAt === "string" || typeof s?.markedAt === "number")) ? s.markedAt : null;

      return {
        id: typeof s?.id === "string" ? s.id : `slot-${idx + 1}`,
        start,
        end,
        text: taskText,
        taskText,
        status,
        markedAt,
      };
    });
  }

  function loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          if (parsed.lastTimes && typeof parsed.lastTimes === "object") {
            state.lastTimes = {
              startMinutes: typeof parsed.lastTimes.startMinutes === "number" ? parsed.lastTimes.startMinutes : MIN_WORK_TIME,
              endMinutes: typeof parsed.lastTimes.endMinutes === "number" ? parsed.lastTimes.endMinutes : MAX_WORK_TIME,
            };
          }
          if (parsed.days && typeof parsed.days === "object") {
            Object.keys(parsed.days).forEach((dateKey) => {
              const d = parsed.days[dateKey];
              if (d && typeof d === "object") {
                state.days[dateKey] = {
                  startMinutes: typeof d.startMinutes === "number" ? d.startMinutes : state.lastTimes.startMinutes,
                  endMinutes: typeof d.endMinutes === "number" ? d.endMinutes : state.lastTimes.endMinutes,
                  slots: sanitizeSlots(d.slots),
                  savedAt: (typeof d.savedAt === "string" || typeof d.saved_at === "string") ? (d.savedAt || d.saved_at) : null,
                };
              }
            });
          }
        }
      }
    } catch (e) {
      console.warn("Local storage read error:", e);
    }
  }

  function saveToLocalStorage() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (e) {
      console.warn("Local storage write error:", e);
    }
  }

  async function syncDayToSupabase(dateKey) {
    if (!supabaseClient || !currentUserId || currentUserId === "anonymous") return;
    const dayData = state.days[dateKey];
    try {
      if (!dayData || !Array.isArray(dayData.slots) || dayData.slots.length === 0) {
        // Deleted or empty: delete row in database
        await supabaseClient
          .from('planner_days')
          .delete()
          .eq('user_id', currentUserId)
          .eq('day', dateKey);
      } else {
        // Upsert row
        const serializedSlots = (dayData.slots || []).map((s, idx) => ({
          id: s.id || `slot-${idx + 1}`,
          start: typeof s.start === "number" ? s.start : null,
          end: typeof s.end === "number" ? s.end : null,
          text: typeof s.taskText === "string" ? s.taskText : (s.text || ""),
          taskText: typeof s.taskText === "string" ? s.taskText : (s.text || ""),
          status: s.status || "NONE",
          markedAt: s.markedAt || null,
        }));

        await supabaseClient
          .from('planner_days')
          .upsert({
            user_id: currentUserId,
            day: dateKey,
            start_min: dayData.startMinutes,
            end_min: dayData.endMinutes,
            slots: serializedSlots,
            saved_at: dayData.savedAt || null,
          }, { onConflict: 'user_id,day' });
      }
    } catch (err) {
      console.warn("Supabase syncDay error:", err);
    }
  }

  async function loadPlans() {
    // 1. Load from user-scoped localStorage first
    loadFromLocalStorage();

    // 2. Fetch from Supabase planner_days if signed in
    if (supabaseClient && currentUserId && currentUserId !== "anonymous") {
      try {
        const { data, error } = await supabaseClient
          .from('planner_days')
          .select('day, start_min, end_min, slots, saved_at')
          .eq('user_id', currentUserId);

        if (!error && Array.isArray(data)) {
          data.forEach((row) => {
            if (row && typeof row.day === "string") {
              const sMin = typeof row.start_min === "number" ? row.start_min : MIN_WORK_TIME;
              const eMin = typeof row.end_min === "number" ? row.end_min : MAX_WORK_TIME;
              state.days[row.day] = {
                startMinutes: sMin,
                endMinutes: eMin,
                slots: sanitizeSlots(row.slots, sMin),
                savedAt: typeof row.saved_at === "string" ? row.saved_at : null,
              };
            }
          });
          // Update local cache
          saveToLocalStorage();
        }
      } catch (err) {
        console.warn("Supabase loadPlans error:", err);
      }
    }
  }

  function saveStorage(syncDateKey) {
    saveToLocalStorage();
    const dateToSync = syncDateKey || selectedDateKey;
    if (dateToSync) {
      syncDayToSupabase(dateToSync);
    }
  }

  function flushPendingDebouncedSave() {
    if (textSaveDebounceTimer) {
      clearTimeout(textSaveDebounceTimer);
      textSaveDebounceTimer = null;
      saveStorage(selectedDateKey);
    }
  }

  // --- DAY DATA GETTER & STATUS HELPERS ---
  function getCurrentDayData() {
    return state.days[selectedDateKey] || null;
  }

  function getExpectedSlotStart(dayData, slotIndex) {
    if (!dayData) return MIN_WORK_TIME;
    if (slotIndex === 0) {
      return typeof dayData.startMinutes === "number" ? dayData.startMinutes : MIN_WORK_TIME;
    }
    const prev = dayData.slots && dayData.slots[slotIndex - 1];
    if (prev && typeof prev.end === "number" && !isNaN(prev.end)) {
      return prev.end;
    }
    return typeof dayData.startMinutes === "number" ? dayData.startMinutes : MIN_WORK_TIME;
  }

  function getEffectiveSlotStart(dayData, slotIndex) {
    if (!dayData || !dayData.slots || !dayData.slots[slotIndex]) return MIN_WORK_TIME;
    const slot = dayData.slots[slotIndex];
    if (typeof slot.start === "number" && !isNaN(slot.start)) {
      return slot.start;
    }
    return getExpectedSlotStart(dayData, slotIndex);
  }

  function isSlotEmpty(slot) {
    if (!slot) return true;
    const noEnd = slot.end === null || slot.end === undefined || isNaN(slot.end);
    const textVal = (typeof slot.taskText === "string" ? slot.taskText : (slot.text || "")).trim();
    return noEnd && textVal === "";
  }

  function isSlotValid(slot, index, slots, dayStartMinutes, dayEndMinutes) {
    return getSlotValidationError(slot, index, slots, dayStartMinutes, dayEndMinutes) === null;
  }

  function getSlotValidationError(slot, index, slots, dayStartMinutes, dayEndMinutes) {
    if (!slot) return "Please choose an End time.";
    if (slot.invalidFormat) {
      return "Type a time like 2:00 or 9:30 AM.";
    }
    if (slot.end === null || slot.end === undefined || isNaN(slot.end)) {
      return "Please choose an End time.";
    }

    const slotStart = typeof slot.start === "number" && !isNaN(slot.start) ? slot.start : dayStartMinutes;

    if (slot.end < MIN_WORK_TIME || slot.end > MAX_WORK_TIME) {
      return "The day ends at " + formatMinutesTo12Hour(dayEndMinutes) + ". Choose an earlier End time.";
    }

    if (slot.end < slotStart + 5) {
      return "The End time must be at least 5 minutes after the Start time.";
    }

    if (slot.end > dayEndMinutes) {
      return `The day ends at ${formatMinutesTo12Hour(dayEndMinutes)}. Choose an earlier End time.`;
    }

    return null;
  }

  function areAllSlotsValid(dayData) {
    if (!dayData || !Array.isArray(dayData.slots) || dayData.slots.length === 0) return false;
    const { startMinutes, endMinutes, slots } = dayData;
    for (let i = 0; i < slots.length; i++) {
      if (isSlotEmpty(slots[i])) return false;
      if (!isSlotValid(slots[i], i, slots, startMinutes, endMinutes)) return false;
    }
    return true;
  }

  function isScheduleFinished(dayData) {
    return areAllSlotsValid(dayData);
  }

  function getFirstUnfinishedSlotIndex(dayData) {
    if (!dayData || !Array.isArray(dayData.slots) || dayData.slots.length === 0) return 0;
    const { startMinutes, endMinutes, slots } = dayData;
    for (let i = 0; i < slots.length; i++) {
      if (!isSlotValid(slots[i], i, slots, startMinutes, endMinutes)) {
        return i;
      }
    }
    return 0;
  }

  function getSlotsWithTimes() {
    const dayData = getCurrentDayData();
    if (!dayData || !Array.isArray(dayData.slots)) return [];
    return dayData.slots.map((slot, index) => {
      const s = getEffectiveSlotStart(dayData, index);
      const e = typeof slot.end === "number" ? slot.end : s;
      return {
        slot,
        slotNumber: index + 1,
        startMinutes: s,
        endMinutes: e,
      };
    });
  }

  function getDayCompletionStatus(dateKey) {
    const day = state.days[dateKey];
    if (!day || !day.slots || day.slots.length === 0) return "NONE";

    // If day is SAVED (savedAt is set)
    if (day.savedAt) {
      const total = day.slots.length;
      const completedCount = day.slots.filter(s => s.status === "COMPLETED").length;
      const notCompletedCount = day.slots.filter(s => s.status === "NOT_COMPLETED").length;

      if (completedCount === total) return "FULLY_COMPLETED";
      if (completedCount > 0 && notCompletedCount > 0) return "PARTLY_COMPLETED";
      if (completedCount > 0 && completedCount < total) return "PARTLY_COMPLETED";
      if (notCompletedCount > 0 && completedCount === 0) return "NOT_COMPLETED";

      return "PLANNED_UNMARKED"; // Saved but nothing is marked
    }

    // Days with only a draft show a plain outline
    return "PLANNED_UNMARKED";
  }

  // --- VIEW SWITCHING ---
  function clearSummarySaveMessage() {
    if (summarySaveMessage) {
      summarySaveMessage.innerHTML = "";
      summarySaveMessage.className = "";
      summarySaveMessage.style.display = "none";
    }
    if (summaryFinishMessage) {
      summaryFinishMessage.innerHTML = "";
      summaryFinishMessage.className = "";
      summaryFinishMessage.style.display = "none";
    }
  }

  function switchView(viewName) {
    if (viewName !== 'summary') {
      clearSummarySaveMessage();
    }
    Object.keys(views).forEach((name) => {
      views[name].classList.toggle('active', name === viewName);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // --- DATE NAVIGATION & SELECTION ---
  function updateDateButtonsState() {
    const todayStr = getLocalDateKey(todayDate);
    const yesterdayStr = getLocalDateKey(addDays(todayDate, -1));
    const tomorrowStr = getLocalDateKey(addDays(todayDate, 1));

    btnYesterday.setAttribute('aria-pressed', String(selectedDateKey === yesterdayStr));
    btnToday.setAttribute('aria-pressed', String(selectedDateKey === todayStr));
    btnTomorrow.setAttribute('aria-pressed', String(selectedDateKey === tomorrowStr));

    const selectedObj = parseLocalDateKey(selectedDateKey);
    selectedDateText.textContent = formatFullDisplayDate(selectedObj);
  }

  function handleSelectDate(dateKey) {
    flushPendingDebouncedSave();
    clearSummarySaveMessage();
    selectedDateKey = dateKey;
    updateDateButtonsState();

    const dayData = getCurrentDayData();
    const todayStr = getLocalDateKey(todayDate);
    const isPastDate = dateKey < todayStr;

    // PART 4: Opening a past date: selecting Yesterday (or any past date from the calendar) opens its Summary
    // when the day was saved (or when it has at least one valid slot).
    // Opening any saved day also opens Summary.
    const hasValidSlot = dayData && Array.isArray(dayData.slots) && dayData.slots.some((s, idx) => isSlotValid(s, idx, dayData.slots, dayData.startMinutes, dayData.endMinutes));
    const shouldOpenSummary = Boolean(dayData?.savedAt || (isPastDate && hasValidSlot));

    if (shouldOpenSummary) {
      renderSummaryView();
      switchView('summary');
      if (summaryHeaderTitle) {
        summaryHeaderTitle.focus();
      }
    } else {
      // If the day has draft slots or nothing: open the first page (settings) for that date
      initSettingsView();
      switchView('settings');
      if (startInput) {
        startInput.focus();
      }
    }
  }

  btnYesterday.addEventListener('click', () => {
    handleSelectDate(getLocalDateKey(addDays(todayDate, -1)));
  });

  btnToday.addEventListener('click', () => {
    handleSelectDate(getLocalDateKey(todayDate));
  });

  btnTomorrow.addEventListener('click', () => {
    handleSelectDate(getLocalDateKey(addDays(todayDate, 1)));
  });

  // --- SETTINGS VIEW LOGIC ---
  function initSettingsView() {
    updateDateButtonsState();

    const dayData = getCurrentDayData();
    const startMins = dayData ? dayData.startMinutes : state.lastTimes.startMinutes;
    const endMins = dayData ? dayData.endMinutes : state.lastTimes.endMinutes;

    startInput.value = formatMinutesTo12Hour(startMins || MIN_WORK_TIME);
    endInput.value = formatMinutesTo12Hour(endMins || MAX_WORK_TIME);

    clearSettingsErrors();
  }

  function clearSettingsErrors() {
    errorStartTime.style.display = "none";
    errorEndTime.style.display = "none";
  }

  function handleTimeFieldBlur(inputEl) {
    if (!inputEl) return;
    const val = inputEl.value.trim();
    if (!val) return;
    const parsed = parseFlexibleTime(val);
    if (!parsed.error && parsed.minutes !== null) {
      inputEl.value = formatMinutesTo12Hour(parsed.minutes);
    }
  }

  [startInput, endInput].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('blur', () => handleTimeFieldBlur(inp));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleTimeFieldBlur(inp);
        inp.blur();
      }
    });
  });

  settingsNextBtn.addEventListener('click', () => {
    clearSettingsErrors();
    let hasError = false;

    const startVal = startInput.value.trim();
    const endVal = endInput.value.trim();

    if (!startVal) {
      errorStartTime.textContent = "Please select a Starting Time.";
      errorStartTime.style.display = "block";
      hasError = true;
    }

    if (!endVal) {
      errorEndTime.textContent = "Please select an Ending Time.";
      errorEndTime.style.display = "block";
      hasError = true;
    }

    const startParsed = parseFlexibleTime(startVal);
    const endParsed = parseFlexibleTime(endVal);

    let startMins = startParsed.minutes;
    let endMins = endParsed.minutes;

    if (startVal) {
      if (startParsed.error === 'INVALID') {
        errorStartTime.textContent = "Type a time like 2:00 or 9:30 AM.";
        errorStartTime.style.display = "block";
        hasError = true;
      } else if (startParsed.error === 'OUT_OF_RANGE' || startMins < MIN_WORK_TIME || startMins > MAX_WORK_TIME) {
        errorStartTime.textContent = "Starting Time must be inside 9:00 AM to 6:00 PM.";
        errorStartTime.style.display = "block";
        hasError = true;
      } else {
        startInput.value = formatMinutesTo12Hour(startMins);
      }
    }

    if (endVal) {
      if (endParsed.error === 'INVALID') {
        errorEndTime.textContent = "Type a time like 2:00 or 9:30 AM.";
        errorEndTime.style.display = "block";
        hasError = true;
      } else if (endParsed.error === 'OUT_OF_RANGE' || endMins < MIN_WORK_TIME || endMins > MAX_WORK_TIME) {
        errorEndTime.textContent = "Ending Time must be inside 9:00 AM to 6:00 PM.";
        errorEndTime.style.display = "block";
        hasError = true;
      } else {
        endInput.value = formatMinutesTo12Hour(endMins);
      }
    }

    if (!hasError && endMins !== null && startMins !== null && endMins <= startMins) {
      errorEndTime.textContent = "Ending Time must be after Starting Time.";
      errorEndTime.style.display = "block";
      hasError = true;
    }

    if (hasError) return;

    const dayData = getCurrentDayData();
    const settingsChanged = dayData && (dayData.startMinutes !== startMins || dayData.endMinutes !== endMins);

    const hasSlotsOutside = Boolean(
      settingsChanged &&
      dayData &&
      Array.isArray(dayData.slots) &&
      dayData.slots.some(s => {
        if (isSlotEmpty(s)) return false;
        return (typeof s.start === "number" && s.start < startMins) || (typeof s.end === "number" && s.end > endMins);
      })
    );

    if (hasSlotsOutside) {
      unconfirmedSettingsChange = {
        startMinutes: startMins,
        endMinutes: endMins,
      };
      settingsConfirmDialog.showModal();
    } else {
      state.lastTimes = { startMinutes: startMins, endMinutes: endMins };
      if (!state.days[selectedDateKey]) {
        state.days[selectedDateKey] = {
          startMinutes: startMins,
          endMinutes: endMins,
          slots: [
            {
              id: "slot-1",
              start: startMins,
              end: null,
              taskText: "",
              status: "NONE",
              markedAt: null,
            },
          ],
        };
      } else {
        state.days[selectedDateKey].startMinutes = startMins;
        state.days[selectedDateKey].endMinutes = endMins;
        if (!state.days[selectedDateKey].slots || state.days[selectedDateKey].slots.length === 0) {
          state.days[selectedDateKey].slots = [
            {
              id: "slot-1",
              start: startMins,
              end: null,
              taskText: "",
              status: "NONE",
              markedAt: null,
            },
          ];
        }
      }
      saveStorage(selectedDateKey);
      currentSlotIndex = 0;
      renderSlotPage();
      switchView('slot');
    }
  });

  settingsDialogCancel.addEventListener('click', () => {
    settingsConfirmDialog.close();
    unconfirmedSettingsChange = null;
  });

  settingsDialogContinue.addEventListener('click', () => {
    if (!unconfirmedSettingsChange) return;
    const { startMinutes: newStart, endMinutes: newEnd } = unconfirmedSettingsChange;
    state.lastTimes = { startMinutes: newStart, endMinutes: newEnd };

    const dayData = getCurrentDayData();
    if (dayData) {
      dayData.startMinutes = newStart;
      dayData.endMinutes = newEnd;
      // Continue removes only the slots that are outside. Nothing else is cleared.
      dayData.slots = (dayData.slots || []).filter(s => {
        if (isSlotEmpty(s)) return false;
        const outStart = typeof s.start === "number" && s.start < newStart;
        const outEnd = typeof s.end === "number" && s.end > newEnd;
        return !(outStart || outEnd);
      });

      if (dayData.slots.length === 0) {
        dayData.slots = [
          {
            id: "slot-1",
            start: newStart,
            end: null,
            taskText: "",
            status: "NONE",
            markedAt: null,
          },
        ];
      }
    }
    saveStorage(selectedDateKey);
    settingsConfirmDialog.close();
    unconfirmedSettingsChange = null;
    currentSlotIndex = 0;
    renderSlotPage();
    switchView('slot');
  });

  // --- SLOT VIEW LOGIC ---
  function renderSlotPage() {
    const dayData = getCurrentDayData();
    if (!dayData) return;

    if (!Array.isArray(dayData.slots) || dayData.slots.length === 0) {
      dayData.slots = [
        {
          id: "slot-1",
          start: dayData.startMinutes,
          end: null,
          taskText: "",
          status: "NONE",
          markedAt: null,
        },
      ];
    }

    if (currentSlotIndex >= dayData.slots.length) {
      currentSlotIndex = Math.max(0, dayData.slots.length - 1);
    }

    const slot = dayData.slots[currentSlotIndex];
    if (!slot) return;

    // 1. "Slot N" and the selected date.
    slotBadge.textContent = `Slot ${currentSlotIndex + 1}`;
    const selectedObj = parseLocalDateKey(selectedDateKey);
    slotDateDisplay.textContent = formatFullDisplayDate(selectedObj);

    // Rule 1: Start time is automatic and read-only on every slot page
    const expectedStart = getExpectedSlotStart(dayData, currentSlotIndex);
    const isLegacy = typeof slot.start === "number" && !isNaN(slot.start) && slot.start !== expectedStart;

    if (isLegacy) {
      if (slotLegacyNotice) slotLegacyNotice.style.display = "block";
    } else {
      if (slotLegacyNotice) slotLegacyNotice.style.display = "none";
      slot.start = expectedStart; // enforce automatic start for new / updated slots
    }

    const effectiveStart = getEffectiveSlotStart(dayData, currentSlotIndex);
    const startStr = formatMinutesTo12Hour(effectiveStart);
    if (slotStartDisplay) {
      slotStartDisplay.textContent = startStr;
      slotStartDisplay.setAttribute('aria-label', `Start time ${startStr}`);
    }

    if (slotStartHint) {
      if (currentSlotIndex === 0) {
        slotStartHint.textContent = "Your day starts at this time.";
      } else {
        slotStartHint.textContent = `Starts when Slot ${currentSlotIndex} ends.`;
      }
    }

    // 2. End time: empty for new slot, never pre-filled
    slotEndTimeInput.value = (typeof slot.end === "number" && !isNaN(slot.end)) ? formatMinutesTo12Hour(slot.end) : "";

    // 3. Work for this slot
    slotTaskInput.value = slot.taskText || slot.text || "";

    // Update validation and buttons state
    updateSlotValidationUI();
  }

  function updateSlotValidationUI(showErrorAlways = false) {
    const dayData = getCurrentDayData();
    if (!dayData) return;

    const slot = dayData.slots[currentSlotIndex];
    if (!slot) return;

    const error = getSlotValidationError(
      slot,
      currentSlotIndex,
      dayData.slots,
      dayData.startMinutes,
      dayData.endMinutes
    );

    const hasTypedEnd = Boolean(slotEndTimeInput.value);
    const isEndValid = Boolean(hasTypedEnd && !error);

    // Next is disabled until the slot is valid
    if (slotNextBtn) {
      slotNextBtn.disabled = !isEndValid;
    }

    const isLastSlot = isEndValid && slot.end === dayData.endMinutes;
    if (slotEndLastHint) {
      slotEndLastHint.style.display = isLastSlot ? "block" : "none";
    }

    if (error && (showErrorAlways || hasTypedEnd)) {
      slotRulesMessage.textContent = error;
      slotRulesMessage.style.display = "block";
    } else {
      slotRulesMessage.textContent = "";
      slotRulesMessage.style.display = "none";
    }
  }

  function handleSlotEndTimeChange(newEndMinutes) {
    const dayData = getCurrentDayData();
    if (!dayData || !dayData.slots[currentSlotIndex]) return;

    const slot = dayData.slots[currentSlotIndex];
    const laterSlotsExist = dayData.slots.length > currentSlotIndex + 1;

    // Check if changing End time impacts later slots
    if (laterSlotsExist) {
      const savedEnd = slot.end;
      durationChangeConfirm = {
        slotIndex: currentSlotIndex,
        newEndMinutes,
        savedEndMinutes: savedEnd,
      };
      if (durationConfirmDialog) {
        durationConfirmDialog.showModal();
      }
    } else {
      slot.end = newEndMinutes;
      updateSlotValidationUI();
      if (textSaveDebounceTimer) {
        clearTimeout(textSaveDebounceTimer);
      }
      textSaveDebounceTimer = setTimeout(() => {
        textSaveDebounceTimer = null;
        saveStorage(selectedDateKey);
      }, 600);
    }
  }

  if (durationDialogCancel) {
    durationDialogCancel.addEventListener('click', () => {
      if (durationConfirmDialog) durationConfirmDialog.close();
      if (durationChangeConfirm) {
        const dayData = getCurrentDayData();
        if (dayData && dayData.slots[durationChangeConfirm.slotIndex]) {
          const slot = dayData.slots[durationChangeConfirm.slotIndex];
          slot.end = durationChangeConfirm.savedEndMinutes;
          slotEndTimeInput.value = (typeof slot.end === "number" && !isNaN(slot.end)) ? formatMinutesTo12Hour(slot.end) : "";
          updateSlotValidationUI();
        }
      }
      durationChangeConfirm = null;
    });
  }

  if (durationDialogContinue) {
    durationDialogContinue.addEventListener('click', () => {
      if (durationConfirmDialog) durationConfirmDialog.close();
      if (durationChangeConfirm) {
        const dayData = getCurrentDayData();
        if (dayData) {
          const { slotIndex, newEndMinutes } = durationChangeConfirm;
          dayData.slots = dayData.slots.slice(0, slotIndex + 1);
          dayData.slots[slotIndex].end = newEndMinutes;
          saveStorage(selectedDateKey);
          renderSlotPage();
        }
      }
      durationChangeConfirm = null;
    });
  }

  function handleSlotEndTimeBlur() {
    if (!slotEndTimeInput) return;
    const val = slotEndTimeInput.value.trim();
    if (!val) return;
    const parsed = parseFlexibleTime(val);
    if (!parsed.error && parsed.minutes !== null) {
      slotEndTimeInput.value = formatMinutesTo12Hour(parsed.minutes);
    }
  }

  slotEndTimeInput.addEventListener('blur', handleSlotEndTimeBlur);
  slotEndTimeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSlotEndTimeBlur();
      slotEndTimeInput.blur();
    }
  });

  slotEndTimeInput.addEventListener('input', () => {
    const dayData = getCurrentDayData();
    if (!dayData || !dayData.slots[currentSlotIndex]) return;

    const val = slotEndTimeInput.value.trim();
    const slot = dayData.slots[currentSlotIndex];

    if (!val) {
      slot.end = null;
      slot.invalidFormat = false;
      updateSlotValidationUI();
      return;
    }

    const parsed = parseFlexibleTime(val);
    if (parsed.error === 'INVALID') {
      slot.end = null;
      slot.invalidFormat = true;
      updateSlotValidationUI();
      return;
    }

    slot.invalidFormat = false;
    const endMinutes = parsed.minutes;

    const laterSlotsExist = dayData.slots.length > currentSlotIndex + 1;
    if (laterSlotsExist && endMinutes !== null) {
      handleSlotEndTimeChange(endMinutes);
    } else {
      slot.end = endMinutes;
      updateSlotValidationUI();

      if (textSaveDebounceTimer) {
        clearTimeout(textSaveDebounceTimer);
      }
      textSaveDebounceTimer = setTimeout(() => {
        textSaveDebounceTimer = null;
        saveStorage(selectedDateKey);
      }, 600);
    }
  });

  slotTaskInput.addEventListener('input', () => {
    clearSummarySaveMessage();
    const dayData = getCurrentDayData();
    if (dayData && dayData.slots[currentSlotIndex]) {
      dayData.slots[currentSlotIndex].taskText = slotTaskInput.value;
      dayData.slots[currentSlotIndex].text = slotTaskInput.value;

      if (textSaveDebounceTimer) {
        clearTimeout(textSaveDebounceTimer);
      }
      textSaveDebounceTimer = setTimeout(() => {
        textSaveDebounceTimer = null;
        saveStorage(selectedDateKey);
      }, 600);
    }
  });

  function cleanupTrailingEmptySlots(dayData) {
    if (!dayData || !Array.isArray(dayData.slots)) return;
    // A new empty slot exists only while the user is on its page. If the user leaves it (Back or leaving the page)
    // with End and text empty, delete it. Never keep an empty slot.
    while (dayData.slots.length > 1 && isSlotEmpty(dayData.slots[dayData.slots.length - 1])) {
      dayData.slots.pop();
    }
  }

  slotBackBtn.addEventListener('click', () => {
    flushPendingDebouncedSave();
    const dayData = getCurrentDayData();
    if (dayData) {
      if (isSlotEmpty(dayData.slots[currentSlotIndex])) {
        dayData.slots.splice(currentSlotIndex, 1);
        if (dayData.slots.length === 0) {
          dayData.slots = [
            {
              id: "slot-1",
              start: dayData.startMinutes,
              end: null,
              taskText: "",
              status: "NONE",
              markedAt: null,
            },
          ];
        }
        saveStorage(selectedDateKey);
      }
    }

    if (currentSlotIndex === 0) {
      initSettingsView();
      switchView('settings');
    } else {
      currentSlotIndex--;
      renderSlotPage();
    }
  });

  slotNextBtn.addEventListener('click', () => {
    flushPendingDebouncedSave();
    const dayData = getCurrentDayData();
    if (!dayData) return;

    const slot = dayData.slots[currentSlotIndex];
    const validationError = getSlotValidationError(slot, currentSlotIndex, dayData.slots, dayData.startMinutes, dayData.endMinutes);
    if (validationError) {
      updateSlotValidationUI(true);
      return;
    }

    // If this slot's End time EQUALS the day's Ending Time: Next saves the slot and opens the SUMMARY page
    if (slot.end === dayData.endMinutes) {
      cleanupTrailingEmptySlots(dayData);
      saveStorage(selectedDateKey);
      renderSummaryView();
      showSaveSuccessMessage();
      switchView('summary');
      return;
    }

    // If this slot's End time is LESS than the day's Ending Time:
    const nextIndex = currentSlotIndex + 1;
    if (nextIndex < dayData.slots.length) {
      currentSlotIndex = nextIndex;
      renderSlotPage();
    } else {
      // Next on the last slot creates a new empty slot whose Start time is this slot's End time and opens it
      if (dayData.slots.length >= 48) {
        slotRulesMessage.textContent = "Maximum 48 slots reached for this day.";
        slotRulesMessage.style.display = "block";
        return;
      }
      const newSlot = {
        id: `slot-${nextIndex + 1}`,
        start: slot.end,
        end: null,
        taskText: "",
        text: "",
        status: "NONE",
        markedAt: null,
      };
      dayData.slots.push(newSlot);
      currentSlotIndex = nextIndex;
      saveStorage(selectedDateKey);
      renderSlotPage();
    }
  });

  // --- SUMMARY VIEW LOGIC ---
  function renderSummaryView() {
    const dayData = getCurrentDayData();
    const selectedObj = parseLocalDateKey(selectedDateKey);
    const shortDateStr = formatShortDisplayDate(selectedObj);

    // If there is no saved plan for this date (or slots array is empty)
    if (!dayData || !Array.isArray(dayData.slots) || dayData.slots.length === 0) {
      summaryHeaderSubtitle.textContent = `${shortDateStr} - No slots planned`;
      if (summaryUnfinishedBanner) summaryUnfinishedBanner.style.display = "none";
      if (summaryEmptyState) summaryEmptyState.style.display = "block";
      summarySlotsList.innerHTML = "";
      if (summaryResultArea) summaryResultArea.innerHTML = "";
      if (summarySaveSection) summarySaveSection.style.display = "none";
      return;
    }

    if (summaryEmptyState) summaryEmptyState.style.display = "none";
    if (summarySaveSection) summarySaveSection.style.display = "flex";

    // Filter out trailing empty slots and sort by start time
    cleanupTrailingEmptySlots(dayData);
    const slotsWithTimes = getSlotsWithTimes()
      .filter(item => !isSlotEmpty(item.slot))
      .sort((a, b) => a.startMinutes - b.startMinutes);
    const totalSlots = slotsWithTimes.length;
    const startStr = formatMinutesTo12Hour(dayData.startMinutes);
    const endStr = formatMinutesTo12Hour(dayData.endMinutes);

    // Cards are sorted by start time. Subtitle shows selected date and number of slots.
    summaryHeaderSubtitle.textContent = `${shortDateStr} - ${startStr} - ${endStr}, ${totalSlots} ${totalSlots === 1 ? "slot" : "slots"}`;

    // Handle Unfinished Plan Banner
    const isFinished = isScheduleFinished(dayData);
    if (!isFinished) {
      if (summaryUnfinishedBanner) summaryUnfinishedBanner.style.display = "flex";
    } else {
      if (summaryUnfinishedBanner) summaryUnfinishedBanner.style.display = "none";
    }

    // Render cards using textContent exclusively for user text
    summarySlotsList.innerHTML = "";
    slotsWithTimes.forEach(({ slot, slotNumber, startMinutes, endMinutes }) => {
      const card = document.createElement('div');
      card.className = "summary-slot-card";

      const slotStartStr = formatMinutesTo12Hour(startMinutes);
      const slotEndStr = formatMinutesTo12Hour(endMinutes);

      const taskContainer = document.createElement('div');
      taskContainer.style.cssText = "font-size: 0.92rem; line-height: 1.5; color: var(--slate-800); white-space: pre-wrap; word-break: break-word;";

      if (slot.taskText && slot.taskText.trim().length > 0) {
        taskContainer.textContent = slot.taskText;
      } else {
        const emptySpan = document.createElement('span');
        emptySpan.style.cssText = "color: var(--slate-400); font-style: italic;";
        emptySpan.textContent = "No task written";
        taskContainer.appendChild(emptySpan);
      }

      const cardBody = document.createElement('div');

      const metaRow = document.createElement('div');
      metaRow.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;";

      const badgeSpan = document.createElement('span');
      badgeSpan.style.cssText = "font-size: 0.75rem; font-weight: 700; background: var(--slate-200); color: var(--slate-800); padding: 2px 8px; border-radius: 9999px;";
      badgeSpan.textContent = `Slot ${slotNumber}`;

      const durationMinutes = Math.max(0, endMinutes - startMinutes);
      const durSpan = document.createElement('span');
      durSpan.style.cssText = "font-size: 0.75rem; color: var(--slate-500); font-weight: 600;";
      durSpan.textContent = `${durationMinutes} min`;

      metaRow.appendChild(badgeSpan);
      metaRow.appendChild(durSpan);

      const timeRangeDiv = document.createElement('div');
      timeRangeDiv.style.cssText = "font-family: monospace; font-weight: 700; color: var(--slate-900); font-size: 1rem; margin-bottom: 8px;";
      timeRangeDiv.textContent = `${slotStartStr} – ${slotEndStr}`;

      cardBody.appendChild(metaRow);
      cardBody.appendChild(timeRangeDiv);
      cardBody.appendChild(taskContainer);
      card.appendChild(cardBody);

      // Status Buttons: ✓ Completed and ✗ Not Completed
      const btnGroup = document.createElement('div');
      btnGroup.className = "slot-status-btn-group";

      const btnCompleted = document.createElement('button');
      btnCompleted.type = "button";
      btnCompleted.className = "slot-status-btn";
      btnCompleted.innerHTML = `<span>✓ Completed</span>`;
      btnCompleted.setAttribute('aria-label', `Mark slot ${slotNumber} Completed`);

      const btnNotCompleted = document.createElement('button');
      btnNotCompleted.type = "button";
      btnNotCompleted.className = "slot-status-btn";
      btnNotCompleted.innerHTML = `<span>✗ Not Completed</span>`;
      btnNotCompleted.setAttribute('aria-label', `Mark slot ${slotNumber} Not Completed`);

      const markMessageEl = document.createElement('div');
      markMessageEl.style.cssText = "font-size: 0.82rem; font-weight: 600; margin-top: 6px; width: 100%;";

      function formatMarkedAtMessage(status, markedAt, planDateKey) {
        if (!status || status === "NONE") {
          return { text: "Not marked yet", muted: true };
        }
        if (!markedAt) {
          if (status === "COMPLETED") {
            return { text: "Marked Completed (time not recorded)", muted: false };
          } else {
            return { text: "Marked Not Completed (time not recorded)", muted: false };
          }
        }

        const markDate = new Date(markedAt);
        if (isNaN(markDate.getTime())) {
          return {
            text: status === "COMPLETED" ? "Marked Completed (time not recorded)" : "Marked Not Completed (time not recorded)",
            muted: false
          };
        }

        const markDayKey = getLocalDateKey(markDate);
        const timePart = formatMinutesTo12Hour(markDate.getHours() * 60 + markDate.getMinutes());

        const isDifferentDay = markDayKey !== planDateKey;
        const prefix = status === "COMPLETED" ? "✓ Marked Completed" : "✗ Marked Not Completed";

        if (isDifferentDay) {
          const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          const datePart = `${days[markDate.getDay()]}, ${markDate.getDate()} ${months[markDate.getMonth()]}`;
          return { text: `${prefix} on ${datePart} at ${timePart}`, muted: false };
        }

        return { text: `${prefix} at ${timePart}`, muted: false };
      }

      function updateSlotCardButtons() {
        const currentStatus = slot.status || "NONE";
        const isComp = currentStatus === "COMPLETED";
        const isNotComp = currentStatus === "NOT_COMPLETED";

        btnCompleted.classList.toggle('completed-active', isComp);
        btnCompleted.setAttribute('aria-pressed', String(isComp));

        btnNotCompleted.classList.toggle('not-completed-active', isNotComp);
        btnNotCompleted.setAttribute('aria-pressed', String(isNotComp));

        const msgInfo = formatMarkedAtMessage(currentStatus, slot.markedAt, selectedDateKey);
        markMessageEl.textContent = msgInfo.text;
        markMessageEl.style.color = msgInfo.muted ? "var(--slate-500)" : "var(--slate-800)";
      }

      btnCompleted.addEventListener('click', () => {
        clearSummarySaveMessage();
        if (slot.status === "COMPLETED") {
          slot.status = "NONE";
          slot.markedAt = null;
        } else {
          slot.status = "COMPLETED";
          slot.markedAt = new Date().toISOString();
        }
        saveStorage(selectedDateKey); // Immediate save
        updateSlotCardButtons();
        updateSummaryResult();
        updateSummarySaveState();
      });

      btnNotCompleted.addEventListener('click', () => {
        clearSummarySaveMessage();
        if (slot.status === "NOT_COMPLETED") {
          slot.status = "NONE";
          slot.markedAt = null;
        } else {
          slot.status = "NOT_COMPLETED";
          slot.markedAt = new Date().toISOString();
        }
        saveStorage(selectedDateKey); // Immediate save
        updateSlotCardButtons();
        updateSummaryResult();
        updateSummarySaveState();
      });

      updateSlotCardButtons();

      btnGroup.appendChild(btnCompleted);
      btnGroup.appendChild(btnNotCompleted);
      btnGroup.appendChild(markMessageEl);
      card.appendChild(btnGroup);

      summarySlotsList.appendChild(card);
    });

    updateSummaryResult();
    updateSummarySaveState();
  }

  summaryContinuePlanningBtn.addEventListener('click', () => {
    const dayData = getCurrentDayData();
    if (!dayData) return;
    currentSlotIndex = getFirstUnfinishedSlotIndex(dayData);
    renderSlotPage();
    switchView('slot');
  });

  if (summaryPlanThisDayBtn) {
    summaryPlanThisDayBtn.addEventListener('click', () => {
      initSettingsView();
      switchView('settings');
    });
  }

  function updateSummaryResult() {
    if (!summaryResultArea) return;
    summaryResultArea.innerHTML = "";

    const dayData = getCurrentDayData();
    if (!dayData || !dayData.slots) return;

    const validSlots = (dayData.slots || []).filter(s => !isSlotEmpty(s));
    const total = validSlots.length;
    const isFinished = areAllSlotsValid(dayData);
    const completedCount = validSlots.filter((s) => s.status === "COMPLETED").length;
    const notCompletedCount = validSlots.filter((s) => s.status === "NOT_COMPLETED").length;
    const allCompleted = total > 0 && completedCount === total;
    const allNotCompleted = total > 0 && notCompletedCount === total;
    const isHalfOrPartlyCompleted = total > 0 && ((completedCount > 0 && completedCount < total) || (notCompletedCount > 0 && notCompletedCount < total));

    function createResultCard(modifierClass, messageText, imgSrc, imgAlt) {
      const card = document.createElement('div');
      card.className = `result-card ${modifierClass}`.trim();

      const msg = document.createElement('h2');
      msg.className = "result-message";
      msg.textContent = messageText;

      const img = document.createElement('img');
      img.className = "result-image";
      img.alt = imgAlt;
      img.width = 440;
      img.height = 293;
      img.src = imgSrc;

      const imgWrapper = document.createElement('div');
      imgWrapper.className = "result-image-wrapper";
      imgWrapper.appendChild(img);

      card.appendChild(imgWrapper);
      card.appendChild(msg);
      return card;
    }

    // 1. Fully Completed: Smiley Emoji + "Work complete"
    if (allCompleted && isFinished) {
      const card = createResultCard(
        "",
        "Work complete! Excellent job!",
        "images/happy.png",
        "Happy smiley emoji: Work fully completed"
      );
      summaryResultArea.appendChild(card);
    }
    // 2. Half / Partly Completed: Encouraging Emoji + Encouraging Message
    else if (isHalfOrPartlyCompleted) {
      const card = createResultCard(
        "result-card-half-completed",
        `Great effort! ${completedCount} of ${total} slots completed. Keep going!`,
        "images/encouraging.png",
        "Encouraging emoji: Great progress made"
      );
      summaryResultArea.appendChild(card);
    }
    // 3. Not Full Completed / None Completed: Sad Emoji + Message
    else if (allNotCompleted) {
      const card = createResultCard(
        "result-card-not-completed",
        "Work not completed. Don't worry, tomorrow is a new day!",
        "images/sad.png",
        "Reflective sad emoji: Work not completed"
      );
      summaryResultArea.appendChild(card);
    }
    // 4. Any not completed (unmarked mix): Show Sad Emoji with supportive message
    else if (notCompletedCount > 0) {
      const card = createResultCard(
        "result-card-not-completed",
        "Some tasks were not completed. Stay positive and keep pushing!",
        "images/sad.png",
        "Reflective sad emoji: Work not fully completed"
      );
      summaryResultArea.appendChild(card);
    }
    // Neutral unmarked case: Prompt hint
    else {
      const hint = document.createElement('p');
      hint.className = "result-hint";
      hint.textContent = "Mark slots Completed or Not Completed to view your result.";
      summaryResultArea.appendChild(hint);
    }
  }

  summaryBackBtn.addEventListener('click', () => {
    const dayData = getCurrentDayData();
    if (dayData && dayData.slots.length > 0) {
      currentSlotIndex = dayData.slots.length - 1;
      renderSlotPage();
      switchView('slot');
    } else {
      initSettingsView();
      switchView('settings');
    }
  });

  summaryEditTimesBtn.addEventListener('click', () => {
    initSettingsView();
    switchView('settings');
  });

  summaryStartNewDayBtn.addEventListener('click', () => {
    newDayDialog.showModal();
    dialogCancelBtn.focus();
  });

  dialogCancelBtn.addEventListener('click', () => {
    newDayDialog.close();
    summaryStartNewDayBtn.focus();
  });

  dialogConfirmBtn.addEventListener('click', () => {
    newDayDialog.close();
    clearSummarySaveMessage();
    if (state.days[selectedDateKey]) {
      state.days[selectedDateKey].slots = [];
      state.days[selectedDateKey].savedAt = null;
    }
    currentSlotIndex = 0;
    saveStorage(selectedDateKey);
    initSettingsView();
    switchView('settings');
  });


  function updateSummarySaveState() {
    if (!summarySaveBtn || !summarySaveHint) return;
    const dayData = getCurrentDayData();
    const valid = areAllSlotsValid(dayData);

    if (valid) {
      summarySaveBtn.disabled = false;
      summarySaveBtn.textContent = "Save";
      summarySaveHint.textContent = "Press Save to store this day.";
    } else {
      summarySaveBtn.disabled = true;
      summarySaveBtn.textContent = "Save";
      summarySaveHint.textContent = "Finish the plan to save.";
    }
  }

  function showSaveSuccessMessage() {
    const selectedObj = parseLocalDateKey(selectedDateKey);
    const todayStr = getLocalDateKey(todayDate);
    const isToday = selectedDateKey === todayStr;

    let text = isToday
      ? "Today’s work has been saved successfully."
      : `Work for ${formatShortDisplayDate(selectedObj)} has been saved successfully.`;

    // Render message in summarySaveMessage (above Save button)
    if (summarySaveMessage) {
      summarySaveMessage.innerHTML = "";
      summarySaveMessage.className = "save-message-box save-message-success";
      summarySaveMessage.style.display = "flex";

      const checkIcon = document.createElement('span');
      checkIcon.setAttribute('aria-hidden', 'true');
      checkIcon.style.marginRight = "8px";
      checkIcon.textContent = "✓";

      const msgSpan = document.createElement('span');
      msgSpan.textContent = text;

      summarySaveMessage.appendChild(checkIcon);
      summarySaveMessage.appendChild(msgSpan);
    }

    // Also render prominent message in summaryFinishMessage (at top of summary cards)
    if (summaryFinishMessage) {
      summaryFinishMessage.innerHTML = "";
      summaryFinishMessage.className = "save-message-box save-message-success";
      summaryFinishMessage.style.display = "flex";

      const checkIconTop = document.createElement('span');
      checkIconTop.setAttribute('aria-hidden', 'true');
      checkIconTop.style.marginRight = "8px";
      checkIconTop.textContent = "✓";

      const msgSpanTop = document.createElement('span');
      msgSpanTop.textContent = text;

      summaryFinishMessage.appendChild(checkIconTop);
      summaryFinishMessage.appendChild(msgSpanTop);
    }
  }

  function showSaveErrorMessage() {
    if (!summarySaveMessage) return;
    summarySaveMessage.innerHTML = "";
    summarySaveMessage.className = "save-message-box save-message-error";
    summarySaveMessage.style.display = "flex";

    const errorSpan = document.createElement('span');
    errorSpan.textContent = "Could not save. Check your internet and try again.";

    const retryBtn = document.createElement('button');
    retryBtn.type = "button";
    retryBtn.className = "btn-save-retry";
    retryBtn.textContent = "Retry";
    retryBtn.setAttribute('aria-label', "Retry saving this day's work");
    retryBtn.addEventListener('click', () => {
      handleSaveDay();
    });

    summarySaveMessage.appendChild(errorSpan);
    summarySaveMessage.appendChild(retryBtn);
  }

  async function handleSaveDay() {
    const dayData = getCurrentDayData();
    if (!dayData || !areAllSlotsValid(dayData)) return;

    if (summarySaveBtn) {
      summarySaveBtn.disabled = true;
      summarySaveBtn.textContent = "Saving…";
    }

    try {
      const nowIso = new Date().toISOString();
      dayData.savedAt = nowIso;

      // 1. Save to local storage under key including signed-in user id
      saveToLocalStorage();

      // 2. Upsert to Supabase planner_days if signed in
      if (supabaseClient && currentUserId && currentUserId !== "anonymous") {
        const { error } = await supabaseClient
          .from('planner_days')
          .upsert({
            user_id: currentUserId,
            day: selectedDateKey,
            start_min: dayData.startMinutes,
            end_min: dayData.endMinutes,
            slots: dayData.slots,
            saved_at: nowIso,
          }, { onConflict: 'user_id,day' });

        if (error) {
          throw error;
        }
      }

      showSaveSuccessMessage();
    } catch (err) {
      console.warn("Save day error:", err);
      showSaveErrorMessage();
    } finally {
      if (summarySaveBtn) {
        summarySaveBtn.disabled = false;
        summarySaveBtn.textContent = "Save";
      }
    }
  }

  if (summarySaveBtn) {
    summarySaveBtn.addEventListener('click', handleSaveDay);
  }

  // --- MONTHLY CALENDAR DIALOG ---
  function renderCalendarGrid() {
    calendarMonthTitle.textContent = formatMonthTitle(calendarViewYear, calendarViewMonth);
    calendarDaysGrid.innerHTML = "";

    const firstDayIndex = new Date(calendarViewYear, calendarViewMonth, 1).getDay();
    const daysInMonth = new Date(calendarViewYear, calendarViewMonth + 1, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) {
      const emptyCell = document.createElement('div');
      emptyCell.className = "calendar-day-cell empty-slot";
      calendarDaysGrid.appendChild(emptyCell);
    }

    const todayStr = getLocalDateKey(todayDate);

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dateObj = new Date(calendarViewYear, calendarViewMonth, dayNum);
      const dateKey = getLocalDateKey(dateObj);

      const dayCell = document.createElement('button');
      dayCell.type = "button";
      dayCell.className = "calendar-day-cell";
      dayCell.setAttribute('data-date-key', dateKey);

      if (dateKey === selectedDateKey) {
        dayCell.classList.add('is-selected');
      }
      if (dateKey === todayStr) {
        dayCell.classList.add('is-today');
      }

      const numSpan = document.createElement('span');
      numSpan.className = "calendar-day-num";
      numSpan.textContent = String(dayNum);
      dayCell.appendChild(numSpan);

      const statusSpan = document.createElement('span');
      statusSpan.className = "calendar-status-indicator";

      const completion = getDayCompletionStatus(dateKey);
      if (completion === "FULLY_COMPLETED") {
        statusSpan.classList.add('cal-status-fully');
        statusSpan.textContent = "✓";
      } else if (completion === "PARTLY_COMPLETED") {
        statusSpan.classList.add('cal-status-partly');
        statusSpan.textContent = "–";
      } else if (completion === "NOT_COMPLETED") {
        statusSpan.classList.add('cal-status-not');
        statusSpan.textContent = "✗";
      } else if (completion === "PLANNED_UNMARKED") {
        const ring = document.createElement('span');
        ring.className = "cal-status-unmarked";
        statusSpan.appendChild(ring);
      }

      dayCell.appendChild(statusSpan);

      dayCell.addEventListener('click', () => {
        calendarDialog.close();
        handleSelectDate(dateKey);
      });

      calendarDaysGrid.appendChild(dayCell);
    }
  }

  function openCalendarDialog() {
    const selectedObj = parseLocalDateKey(selectedDateKey);
    calendarViewYear = selectedObj.getFullYear();
    calendarViewMonth = selectedObj.getMonth();
    renderCalendarGrid();
    calendarDialog.showModal();
  }

  calendarToggleBtn.addEventListener('click', openCalendarDialog);

  if (summaryCalendarToggleBtn) {
    summaryCalendarToggleBtn.addEventListener('click', openCalendarDialog);
  }

  calendarCloseBtn.addEventListener('click', () => {
    calendarDialog.close();
  });

  calendarPrevMonthBtn.addEventListener('click', () => {
    calendarViewMonth--;
    if (calendarViewMonth < 0) {
      calendarViewMonth = 11;
      calendarViewYear--;
    }
    renderCalendarGrid();
  });

  calendarNextMonthBtn.addEventListener('click', () => {
    calendarViewMonth++;
    if (calendarViewMonth > 11) {
      calendarViewMonth = 0;
      calendarViewYear++;
    }
    renderCalendarGrid();
  });

  // Dialog backdrop close listeners
  [newDayDialog, settingsConfirmDialog, durationConfirmDialog, calendarDialog].forEach((diag) => {
    diag.addEventListener('click', (e) => {
      const rect = diag.getBoundingClientRect();
      const isInDialog =
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width;
      if (!isInDialog) {
        diag.close();
      }
    });
  });

  // Log out button: signs out and clears in-memory state; NEVER deletes stored plans
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      flushPendingDebouncedSave();
      if (supabaseClient) {
        try {
          await supabaseClient.auth.signOut();
        } catch (e) {
          console.warn('SignOut error:', e);
        }
      }
      // Reset in-memory copy only
      state = { lastTimes: { startMinutes: MIN_WORK_TIME, endMinutes: MAX_WORK_TIME }, days: {} };
      window.location.replace('login.html');
    });
  }

  // Save when page is hidden or closed
  window.addEventListener('pagehide', flushPendingDebouncedSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingDebouncedSave();
    }
  });

  // --- INITIALIZE PLANNER CODE ONLY IF SESSION EXISTS ---
  async function checkAuthAndStart() {
    if (areKeysPlaceholder() || !supabaseClient) {
      window.location.replace('login.html');
      return;
    }

    try {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error || !data || !data.session || !data.session.user) {
        window.location.replace('login.html');
        return;
      }

      currentUserId = data.session.user.id;
      storageKey = `dailyPlanner:${currentUserId}`;

      // Load user's saved plans BEFORE revealing view
      await loadPlans();

      document.documentElement.classList.add('auth-ready');

      // PART 1: After sign-in (and when a signed-in user opens the site), open the first page with TODAY selected.
      selectedDateKey = getLocalDateKey(todayDate);
      initSettingsView();
      switchView('settings');
    } catch (e) {
      console.error('Auth verification error:', e);
      window.location.replace('login.html');
    }
  }

  checkAuthAndStart();
})();

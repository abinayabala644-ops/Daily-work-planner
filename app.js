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
 * - The LAST slot (ending at day.endMinutes) has its primary button read "Finish" which opens the Summary page.
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
  const slotTimeLeft = document.getElementById('slot-time-left');
  const slotBadge = document.getElementById('slot-badge');
  const slotEndLabel = document.getElementById('slot-end-label');
  const slotTimeRange = document.getElementById('slot-time-range');
  const slotDateDisplay = document.getElementById('slot-date-display');
  const slotWorkDurationInput = document.getElementById('slot-work-duration');
  const slotDurationError = document.getElementById('slot-duration-error');
  const slotTaskInput = document.getElementById('slot-task-input');
  const slotNextBtn = document.getElementById('slot-next-btn');

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
  function sanitizeSlots(slotsArray) {
    if (!Array.isArray(slotsArray)) return [];
    return slotsArray.map((s, idx) => ({
      id: typeof s?.id === "string" ? s.id : `slot-${idx + 1}`,
      durationMinutes: typeof s?.durationMinutes === "number" && !isNaN(s.durationMinutes) ? s.durationMinutes : null,
      taskText: typeof s?.taskText === "string" ? s.taskText : "",
      status: (s?.status === "COMPLETED" || s?.status === "NOT_COMPLETED") ? s.status : "NONE",
    }));
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
        await supabaseClient
          .from('planner_days')
          .upsert({
            user_id: currentUserId,
            day: dateKey,
            start_min: dayData.startMinutes,
            end_min: dayData.endMinutes,
            slots: dayData.slots,
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
          .select('day, start_min, end_min, slots')
          .eq('user_id', currentUserId);

        if (!error && Array.isArray(data)) {
          data.forEach((row) => {
            if (row && typeof row.day === "string") {
              state.days[row.day] = {
                startMinutes: typeof row.start_min === "number" ? row.start_min : MIN_WORK_TIME,
                endMinutes: typeof row.end_min === "number" ? row.end_min : MAX_WORK_TIME,
                slots: sanitizeSlots(row.slots),
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

  function hasSavedSlotsWithDuration(dayData) {
    if (!dayData || !Array.isArray(dayData.slots) || dayData.slots.length === 0) return false;
    return dayData.slots.some((s) => typeof s.durationMinutes === "number" && s.durationMinutes > 0);
  }

  function isScheduleFinished(dayData) {
    if (!dayData || !Array.isArray(dayData.slots) || dayData.slots.length === 0) return false;
    let currentStart = dayData.startMinutes;
    for (let i = 0; i < dayData.slots.length; i++) {
      const slot = dayData.slots[i];
      if (typeof slot.durationMinutes !== "number" || slot.durationMinutes === null) return false;
      currentStart += slot.durationMinutes;
    }
    return currentStart === dayData.endMinutes;
  }

  function getFirstUnfinishedSlotIndex(dayData) {
    if (!dayData || !Array.isArray(dayData.slots) || dayData.slots.length === 0) return 0;
    for (let i = 0; i < dayData.slots.length; i++) {
      if (typeof dayData.slots[i].durationMinutes !== "number" || dayData.slots[i].durationMinutes === null) {
        return i;
      }
    }
    // All existing slots have durations, but total does not reach endMinutes
    return dayData.slots.length - 1;
  }

  function getSlotsWithTimes() {
    const dayData = getCurrentDayData();
    if (!dayData) return [];
    let currentStart = dayData.startMinutes;
    return dayData.slots.map((slot, index) => {
      const start = currentStart;
      const duration = typeof slot.durationMinutes === "number" ? slot.durationMinutes : null;
      const end = duration !== null ? start + duration : start;
      currentStart = end;
      return {
        slot,
        slotNumber: index + 1,
        startMinutes: start,
        endMinutes: end,
      };
    });
  }

  function getDayCompletionStatus(dateKey) {
    const day = state.days[dateKey];
    if (!day || !day.slots || day.slots.length === 0) return "NONE";
    if (!isScheduleFinished(day)) return "NONE";

    const total = day.slots.length;
    const completedCount = day.slots.filter(s => s.status === "COMPLETED").length;
    const notCompletedCount = day.slots.filter(s => s.status === "NOT_COMPLETED").length;

    if (completedCount === total) return "FULLY_COMPLETED";
    if (notCompletedCount === total) return "NOT_COMPLETED";
    if (completedCount > 0 && notCompletedCount > 0) return "PARTLY_COMPLETED";
    if (completedCount > 0 && completedCount < total) return "PARTLY_COMPLETED";
    if (notCompletedCount > 0 && notCompletedCount < total) return "PARTLY_COMPLETED";

    return "PLANNED_UNMARKED";
  }

  // --- VIEW SWITCHING ---
  function switchView(viewName) {
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
    selectedDateKey = dateKey;
    updateDateButtonsState();

    // Opening a date (via Yesterday/Today/Tomorrow or calendar) always opens the Summary page
    renderSummaryView();
    switchView('summary');

    // Move focus to Summary page title for accessibility
    if (summaryHeaderTitle) {
      summaryHeaderTitle.focus();
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

    startInput.value = minutesToTimeString(startMins || MIN_WORK_TIME);
    endInput.value = minutesToTimeString(endMins || MAX_WORK_TIME);

    clearSettingsErrors();
  }

  function clearSettingsErrors() {
    errorStartTime.style.display = "none";
    errorEndTime.style.display = "none";
  }

  settingsNextBtn.addEventListener('click', () => {
    clearSettingsErrors();
    let hasError = false;

    const startVal = startInput.value;
    const endVal = endInput.value;

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

    const startMins = timeStringToMinutes(startVal);
    const endMins = timeStringToMinutes(endVal);

    if (startMins < MIN_WORK_TIME || startMins > MAX_WORK_TIME) {
      errorStartTime.textContent = "Starting Time must be inside 9:00 AM to 6:00 PM.";
      errorStartTime.style.display = "block";
      hasError = true;
    }

    if (endMins < MIN_WORK_TIME || endMins > MAX_WORK_TIME) {
      errorEndTime.textContent = "Ending Time must be inside 9:00 AM to 6:00 PM.";
      errorEndTime.style.display = "block";
      hasError = true;
    }

    if (!hasError && endMins <= startMins) {
      errorEndTime.textContent = "Ending Time must be after Starting Time.";
      errorEndTime.style.display = "block";
      hasError = true;
    }

    if (hasError) return;

    const dayData = getCurrentDayData();
    const settingsChanged = dayData && (dayData.startMinutes !== startMins || dayData.endMinutes !== endMins);

    if (dayData && dayData.slots.length > 0 && settingsChanged) {
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
              durationMinutes: null,
              taskText: "",
              status: "NONE",
            },
          ],
        };
      } else {
        state.days[selectedDateKey].startMinutes = startMins;
        state.days[selectedDateKey].endMinutes = endMins;
        if (state.days[selectedDateKey].slots.length === 0) {
          state.days[selectedDateKey].slots = [
            {
              id: "slot-1",
              durationMinutes: null,
              taskText: "",
              status: "NONE",
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
    state.lastTimes = { ...unconfirmedSettingsChange };
    state.days[selectedDateKey] = {
      startMinutes: unconfirmedSettingsChange.startMinutes,
      endMinutes: unconfirmedSettingsChange.endMinutes,
      slots: [
        {
          id: "slot-1",
          durationMinutes: null,
          taskText: "",
          status: "NONE",
        },
      ],
    };
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

    const slotsWithTimes = getSlotsWithTimes();
    const current = slotsWithTimes[currentSlotIndex];
    if (!current) return;

    const slot = current.slot;
    const dayEndMins = dayData.endMinutes;
    const availableMins = dayEndMins - current.startMinutes;

    slotBadge.textContent = `Slot ${current.slotNumber}`;

    const selectedObj = parseLocalDateKey(selectedDateKey);
    slotDateDisplay.textContent = formatFullDisplayDate(selectedObj);

    const currentEnd = typeof slot.durationMinutes === "number" && slot.durationMinutes !== null ? current.startMinutes + slot.durationMinutes : null;
    const isLastSlot = currentEnd !== null && currentEnd === dayEndMins;

    if (currentEnd !== null) {
      slotTimeRange.textContent = `${formatMinutesTo12Hour(current.startMinutes)} - ${formatMinutesTo12Hour(currentEnd)}`;
      slotEndLabel.textContent = `Ends at ${formatMinutesTo12Hour(currentEnd)}`;
    } else {
      slotTimeRange.textContent = `Starts at ${formatMinutesTo12Hour(current.startMinutes)}`;
      slotEndLabel.textContent = "";
    }

    const effectiveEnd = currentEnd !== null && currentEnd <= dayEndMins ? currentEnd : current.startMinutes;
    slotTimeLeft.textContent = formatRemainingTime(Math.max(0, dayEndMins - effectiveEnd));

    slotWorkDurationInput.value = typeof slot.durationMinutes === "number" && slot.durationMinutes !== null ? slot.durationMinutes : "";

    let durationError = "";
    if (typeof slot.durationMinutes === "number" && slot.durationMinutes !== null) {
      if (slot.durationMinutes < MIN_SLOT_DURATION) {
        durationError = `Duration must be a whole number of at least ${MIN_SLOT_DURATION} minutes.`;
      } else if (slot.durationMinutes > availableMins) {
        durationError = `Only ${availableMins} minutes are left. Choose ${availableMins} minutes or less.`;
      } else {
        const leftover = availableMins - slot.durationMinutes;
        if (leftover >= 1 && leftover < MIN_SLOT_DURATION) {
          durationError = `This leaves ${leftover} minute${leftover === 1 ? "" : "s"}, which is too short for a slot. Choose a different duration.`;
        }
      }
    }

    if (durationError) {
      slotDurationError.textContent = durationError;
      slotDurationError.style.display = "block";
    } else {
      slotDurationError.style.display = "none";
      slotDurationError.textContent = "";
    }

    const isDurationValid = typeof slot.durationMinutes === "number" && slot.durationMinutes !== null && durationError === "";

    slotTaskInput.value = slot.taskText || "";

    if (isLastSlot) {
      slotNextBtn.textContent = "Finish ✓";
      slotNextBtn.className = "btn btn-finish";
    } else {
      slotNextBtn.textContent = "Next →";
      slotNextBtn.className = "btn btn-primary";
    }

    slotNextBtn.disabled = !isDurationValid;
  }

  function handleSlotDurationChangeRequest(newDuration) {
    const dayData = getCurrentDayData();
    if (!dayData) return;

    const idx = currentSlotIndex;
    const laterSlotsExist = dayData.slots.length > idx + 1;

    if (laterSlotsExist) {
      durationChangeConfirm = {
        slotIndex: idx,
        newDuration,
      };
      durationConfirmDialog.showModal();
    } else {
      dayData.slots[idx].durationMinutes = newDuration;
      saveStorage(selectedDateKey);
      renderSlotPage();
    }
  }

  durationDialogCancel.addEventListener('click', () => {
    durationConfirmDialog.close();
    durationChangeConfirm = null;
    renderSlotPage();
  });

  durationDialogContinue.addEventListener('click', () => {
    if (!durationChangeConfirm) return;
    const dayData = getCurrentDayData();
    if (dayData) {
      const { slotIndex, newDuration } = durationChangeConfirm;
      dayData.slots = dayData.slots.slice(0, slotIndex + 1);
      dayData.slots[slotIndex].durationMinutes = newDuration;
      saveStorage(selectedDateKey);
    }
    durationConfirmDialog.close();
    durationChangeConfirm = null;
    renderSlotPage();
  });

  slotWorkDurationInput.addEventListener('input', () => {
    const val = slotWorkDurationInput.value.trim();
    if (!val) {
      const dayData = getCurrentDayData();
      if (dayData && dayData.slots[currentSlotIndex]) {
        dayData.slots[currentSlotIndex].durationMinutes = null;
        saveStorage(selectedDateKey);
        renderSlotPage();
      }
    } else {
      const num = parseInt(val, 10);
      if (!isNaN(num) && num > 0) {
        handleSlotDurationChangeRequest(num);
      }
    }
  });

  slotTaskInput.addEventListener('input', () => {
    const dayData = getCurrentDayData();
    if (dayData && dayData.slots[currentSlotIndex]) {
      dayData.slots[currentSlotIndex].taskText = slotTaskInput.value;
      // Save debounced after at most 600ms
      if (textSaveDebounceTimer) {
        clearTimeout(textSaveDebounceTimer);
      }
      textSaveDebounceTimer = setTimeout(() => {
        textSaveDebounceTimer = null;
        saveStorage(selectedDateKey);
      }, 500);
    }
  });

  slotBackBtn.addEventListener('click', () => {
    flushPendingDebouncedSave();
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

    const slotsWithTimes = getSlotsWithTimes();
    const current = slotsWithTimes[currentSlotIndex];
    if (!current || typeof current.slot.durationMinutes !== "number" || current.slot.durationMinutes === null) return;

    const dayEndMins = dayData.endMinutes;
    if (current.endMinutes === dayEndMins) {
      renderSummaryView();
      switchView('summary');
      return;
    }

    const nextIndex = currentSlotIndex + 1;
    if (dayData.slots[nextIndex]) {
      currentSlotIndex = nextIndex;
      renderSlotPage();
    } else {
      const newSlot = {
        id: `slot-${nextIndex + 1}`,
        durationMinutes: null,
        taskText: "",
        status: "NONE",
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
      return;
    }

    if (summaryEmptyState) summaryEmptyState.style.display = "none";

    const slotsWithTimes = getSlotsWithTimes();
    const totalSlots = slotsWithTimes.length;
    const startStr = formatMinutesTo12Hour(dayData.startMinutes);
    const endStr = formatMinutesTo12Hour(dayData.endMinutes);

    // Required Format: "Wed, 4 Mar 2026 - 9:00 AM - 6:00 PM, 7 slots"
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

      const durSpan = document.createElement('span');
      durSpan.style.cssText = "font-size: 0.75rem; color: var(--slate-500); font-weight: 600;";
      durSpan.textContent = typeof slot.durationMinutes === "number" && slot.durationMinutes ? `${slot.durationMinutes} min` : "No duration set";

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

      function updateSlotCardButtons() {
        const currentStatus = slot.status || "NONE";
        const isComp = currentStatus === "COMPLETED";
        const isNotComp = currentStatus === "NOT_COMPLETED";

        btnCompleted.classList.toggle('completed-active', isComp);
        btnCompleted.setAttribute('aria-pressed', String(isComp));

        btnNotCompleted.classList.toggle('not-completed-active', isNotComp);
        btnNotCompleted.setAttribute('aria-pressed', String(isNotComp));
      }

      btnCompleted.addEventListener('click', () => {
        slot.status = slot.status === "COMPLETED" ? "NONE" : "COMPLETED";
        saveStorage(selectedDateKey); // Immediate save
        updateSlotCardButtons();
        updateSummaryResult();
      });

      btnNotCompleted.addEventListener('click', () => {
        slot.status = slot.status === "NOT_COMPLETED" ? "NONE" : "NOT_COMPLETED";
        saveStorage(selectedDateKey); // Immediate save
        updateSlotCardButtons();
        updateSummaryResult();
      });

      updateSlotCardButtons();

      btnGroup.appendChild(btnCompleted);
      btnGroup.appendChild(btnNotCompleted);
      card.appendChild(btnGroup);

      summarySlotsList.appendChild(card);
    });

    updateSummaryResult();
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

    const total = dayData.slots.length;
    const isFinished = isScheduleFinished(dayData);
    const completedCount = dayData.slots.filter((s) => s.status === "COMPLETED").length;
    const notCompletedCount = dayData.slots.filter((s) => s.status === "NOT_COMPLETED").length;
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
    if (state.days[selectedDateKey]) {
      state.days[selectedDateKey].slots = [];
    }
    currentSlotIndex = 0;
    saveStorage(selectedDateKey);
    initSettingsView();
    switchView('settings');
  });

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

      // Check if Today has saved slots with duration
      const todayData = getCurrentDayData();
      if (hasSavedSlotsWithDuration(todayData)) {
        updateDateButtonsState();
        renderSummaryView();
        switchView('summary');
      } else {
        initSettingsView();
        switchView('settings');
      }
    } catch (e) {
      console.error('Auth verification error:', e);
      window.location.replace('login.html');
    }
  }

  checkAuthAndStart();
})();

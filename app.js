/**
 * Daily Work Planner - Pure Vanilla JavaScript Implementation
 *
 * Rules:
 * - One unified state object saved in localStorage under "dailyPlanner:v4".
 * - Always opens on Settings page on every visit with TODAY selected.
 * - Times stored as minutes since midnight; single 12-hour AM/PM formatting helper.
 * - Slot start time is never stored (derived sequentially from day.startMinutes).
 * - Slots 1 to N: NO checkbox and NO Completed / Not Completed buttons on ANY slot page.
 * - The LAST slot (ending at day.endMinutes) has its primary button read "Finish" which opens the Summary page.
 * - DAILY WORK SUMMARY PAGE:
 *     1. Title "Daily Work Summary" with formatted date, day range, and slot count.
 *     2. Organized list of ALL slots in time order (each card has ✓ Completed and ✗ Not Completed buttons).
 *     3. Result card at the very end when all slots completed / any not completed / hint when neutral.
 *     4. Existing buttons: Back, Edit times, Start New Day (clears only the selected date).
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

  const STORAGE_KEY = "dailyPlanner:v4";

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

  function formatMonthTitle(year, monthIndex) {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${months[monthIndex]} ${year}`;
  }

  // --- STATE ---
  // Unified state stored under "dailyPlanner:v4"
  let state = {
    lastTimes: {
      startMinutes: MIN_WORK_TIME,
      endMinutes: MAX_WORK_TIME,
    },
    days: {}, // keyed by "YYYY-MM-DD"
  };

  // Runtime date selection (always starts at TODAY on every load)
  const todayDate = new Date();
  let selectedDateKey = getLocalDateKey(todayDate);

  // Calendar modal viewing month/year
  let calendarViewYear = todayDate.getFullYear();
  let calendarViewMonth = todayDate.getMonth();

  let currentSlotIndex = 0;
  let unconfirmedSettingsChange = null;
  let durationChangeConfirm = null;

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
  const summaryHeaderSubtitle = document.getElementById('summary-header-subtitle');
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

  // --- STORAGE ---
  function loadStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
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
            state.days = {};
            Object.keys(parsed.days).forEach((dateKey) => {
              const d = parsed.days[dateKey];
              if (d && typeof d === "object") {
                state.days[dateKey] = {
                  startMinutes: typeof d.startMinutes === "number" ? d.startMinutes : state.lastTimes.startMinutes,
                  endMinutes: typeof d.endMinutes === "number" ? d.endMinutes : state.lastTimes.endMinutes,
                  slots: Array.isArray(d.slots)
                    ? d.slots.map((s, idx) => ({
                        id: typeof s.id === "string" ? s.id : `slot-${idx + 1}`,
                        durationMinutes: typeof s.durationMinutes === "number" ? s.durationMinutes : null,
                        taskText: typeof s.taskText === "string" ? s.taskText : "",
                        status: (s.status === "COMPLETED" || s.status === "NOT_COMPLETED") ? s.status : "NONE",
                      }))
                    : [],
                };
              }
            });
          }
        }
      }
    } catch (e) {
      console.warn("Storage read error:", e);
    }
  }

  function saveStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Storage write error:", e);
    }
  }

  // --- DAY DATA GETTER & HELPERS ---
  function getCurrentDayData() {
    if (!state.days[selectedDateKey]) {
      return null;
    }
    return state.days[selectedDateKey];
  }

  function isScheduleFinished(dayData) {
    if (!dayData || !Array.isArray(dayData.slots) || dayData.slots.length === 0) return false;
    let currentStart = dayData.startMinutes;
    for (let i = 0; i < dayData.slots.length; i++) {
      const slot = dayData.slots[i];
      if (slot.durationMinutes === null) return false;
      currentStart += slot.durationMinutes;
    }
    return currentStart === dayData.endMinutes;
  }

  function getSlotsWithTimes() {
    const dayData = getCurrentDayData();
    if (!dayData) return [];
    let currentStart = dayData.startMinutes;
    return dayData.slots.map((slot, index) => {
      const start = currentStart;
      const duration = slot.durationMinutes;
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

    // All slots are still unmarked ("NONE")
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
    selectedDateKey = dateKey;
    updateDateButtonsState();

    const dayData = getCurrentDayData();
    if (isScheduleFinished(dayData)) {
      renderSummaryView();
      switchView('summary');
    } else {
      initSettingsView();
      switchView('settings');
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

    // Check if settings changed for this date
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
      saveStorage();
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
    saveStorage();
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

    const currentEnd = slot.durationMinutes !== null ? current.startMinutes + slot.durationMinutes : null;
    const isLastSlot = currentEnd !== null && currentEnd === dayEndMins;

    if (currentEnd !== null) {
      slotTimeRange.textContent = `${formatMinutesTo12Hour(current.startMinutes)} - ${formatMinutesTo12Hour(currentEnd)}`;
      slotEndLabel.textContent = `Ends at ${formatMinutesTo12Hour(currentEnd)}`;
    } else {
      slotTimeRange.textContent = `Starts at ${formatMinutesTo12Hour(current.startMinutes)}`;
      slotEndLabel.textContent = "";
    }

    // Time left in day
    const effectiveEnd = currentEnd !== null && currentEnd <= dayEndMins ? currentEnd : current.startMinutes;
    slotTimeLeft.textContent = formatRemainingTime(Math.max(0, dayEndMins - effectiveEnd));

    // Number input value
    slotWorkDurationInput.value = slot.durationMinutes !== null ? slot.durationMinutes : "";

    // Duration validation
    let durationError = "";
    if (slot.durationMinutes !== null) {
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

    const isDurationValid = slot.durationMinutes !== null && durationError === "";

    // Text box
    slotTaskInput.value = slot.taskText || "";

    // Finish / Next Button
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
      saveStorage();
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
      saveStorage();
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
        saveStorage();
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
      saveStorage();
    }
  });

  slotBackBtn.addEventListener('click', () => {
    if (currentSlotIndex === 0) {
      initSettingsView();
      switchView('settings');
    } else {
      currentSlotIndex--;
      renderSlotPage();
    }
  });

  slotNextBtn.addEventListener('click', () => {
    const dayData = getCurrentDayData();
    if (!dayData) return;

    const slotsWithTimes = getSlotsWithTimes();
    const current = slotsWithTimes[currentSlotIndex];
    if (!current || current.slot.durationMinutes === null) return;

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
      saveStorage();
      renderSlotPage();
    }
  });

  // --- SUMMARY VIEW LOGIC ---
  function renderSummaryView() {
    const dayData = getCurrentDayData();
    if (!dayData) return;

    const slotsWithTimes = getSlotsWithTimes();
    const totalSlots = slotsWithTimes.length;
    const startStr = formatMinutesTo12Hour(dayData.startMinutes);
    const endStr = formatMinutesTo12Hour(dayData.endMinutes);

    const selectedObj = parseLocalDateKey(selectedDateKey);
    const dateStr = formatFullDisplayDate(selectedObj);

    // Header Subtitle: Date + Day range + slot count
    summaryHeaderSubtitle.textContent = `${dateStr} • ${startStr} - ${endStr}, ${totalSlots} ${totalSlots === 1 ? "slot" : "slots"}`;

    // Render cards
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
      cardBody.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-size: 0.75rem; font-weight: 700; background: var(--slate-200); color: var(--slate-800); padding: 2px 8px; border-radius: 9999px;">Slot ${slotNumber}</span>
          <span style="font-size: 0.75rem; color: var(--slate-500); font-weight: 600;">${slot.durationMinutes ? slot.durationMinutes + " min" : ""}</span>
        </div>
        <div style="font-family: monospace; font-weight: 700; color: var(--slate-900); font-size: 1rem; margin-bottom: 8px;">
          ${slotStartStr} – ${slotEndStr}
        </div>
      `;
      cardBody.appendChild(taskContainer);
      card.appendChild(cardBody);

      // Slot Card Status Buttons: ✓ Completed and ✗ Not Completed
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
        saveStorage();
        updateSlotCardButtons();
        updateSummaryResult();
      });

      btnNotCompleted.addEventListener('click', () => {
        slot.status = slot.status === "NOT_COMPLETED" ? "NONE" : "NOT_COMPLETED";
        saveStorage();
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

  function updateSummaryResult() {
    if (!summaryResultArea) return;
    summaryResultArea.innerHTML = "";

    const dayData = getCurrentDayData();
    if (!dayData || !dayData.slots) return;

    const total = dayData.slots.length;
    const anyNotCompleted = dayData.slots.some((s) => s.status === "NOT_COMPLETED");
    const allCompleted = total > 0 && dayData.slots.every((s) => s.status === "COMPLETED");

    if (allCompleted) {
      const card = document.createElement('div');
      card.className = "result-card";

      const msg = document.createElement('h2');
      msg.className = "result-message";
      msg.textContent = "Work complete";

      const img = document.createElement('img');
      img.className = "result-image";
      img.alt = "Happy smiley with two thumbs up: Work Completed";
      img.width = 440;
      img.height = 293;
      img.src = "images/happy.png";

      let fileMissingNotified = false;
      img.onerror = () => {
        if (img.src.endsWith(".png")) {
          img.src = "images/happy.jpg";
        } else if (img.src.endsWith(".jpg")) {
          img.src = "images/happy.jpeg";
        } else if (img.src.endsWith(".jpeg")) {
          img.src = "images/happy.webp";
        } else if (img.src.endsWith(".webp")) {
          img.src = "images/happy.gif";
        } else {
          if (imgWrapper && imgWrapper.parentNode) {
            imgWrapper.parentNode.removeChild(imgWrapper);
          }
          if (!fileMissingNotified) {
            console.warn("The file images/happy.* is missing.");
            fileMissingNotified = true;
          }
        }
      };

      const imgWrapper = document.createElement('div');
      imgWrapper.className = "result-image-wrapper";
      imgWrapper.appendChild(img);

      card.appendChild(imgWrapper);
      card.appendChild(msg);
      summaryResultArea.appendChild(card);
    } else if (anyNotCompleted) {
      const card = document.createElement('div');
      card.className = "result-card result-card-not-completed";

      const msg = document.createElement('h2');
      msg.className = "result-message";
      msg.textContent = "Work not complete";

      card.appendChild(msg);
      summaryResultArea.appendChild(card);
    } else {
      const hint = document.createElement('p');
      hint.className = "result-hint";
      hint.textContent = "Mark every slot Completed to see your result.";
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
    // Clear only this date's slots
    if (state.days[selectedDateKey]) {
      state.days[selectedDateKey].slots = [];
    }
    currentSlotIndex = 0;
    saveStorage();
    initSettingsView();
    switchView('settings');
  });

  // --- MONTHLY CALENDAR DIALOG ---
  function renderCalendarGrid() {
    calendarMonthTitle.textContent = formatMonthTitle(calendarViewYear, calendarViewMonth);
    calendarDaysGrid.innerHTML = "";

    const firstDayIndex = new Date(calendarViewYear, calendarViewMonth, 1).getDay();
    const daysInMonth = new Date(calendarViewYear, calendarViewMonth + 1, 0).getDate();

    // Leading empty cells
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

  calendarToggleBtn.addEventListener('click', () => {
    // Center calendar view on selected date
    const selectedObj = parseLocalDateKey(selectedDateKey);
    calendarViewYear = selectedObj.getFullYear();
    calendarViewMonth = selectedObj.getMonth();
    renderCalendarGrid();
    calendarDialog.showModal();
  });

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

  // Close native dialogs on outside click
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

  // INITIALIZE APP
  loadStorage();
  initSettingsView();
  switchView('settings');
})();

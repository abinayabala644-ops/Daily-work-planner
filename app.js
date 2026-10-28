/**
 * Daily Work Planner - Pure Vanilla JavaScript Implementation
 *
 * Rules:
 * - One unified state object saved in localStorage under "dailyPlanner:v3".
 * - Always opens on Settings page on every visit.
 * - Times stored as minutes since midnight; single 12-hour AM/PM formatting helper.
 * - Slot start time is never stored (derived sequentially from settings.startMinutes).
 * - Slots 1 to N: NO checkbox and NO Completed / Not Completed buttons on ANY slot page.
 * - The LAST slot (ending at settings.endMinutes) has its primary button read "Finish" which opens the Summary page.
 * - DAILY WORK SUMMARY PAGE:
 *     1. Title "Daily Work Summary" with day range and slot count.
 *     2. Organized list of ALL slots in time order (each card has ✓ Completed and ✗ Not Completed buttons; no checkbox).
 *     3. Result card at the very end when all slots completed; otherwise small hint line.
 *     4. Existing buttons: Back, Edit times, Start New Day.
 * - Both slot card buttons are always enabled (do not require typed work).
 * - Only one active at a time; clicking active one turns it off. aria-pressed on both.
 * - Stored slot.status ("NONE" | "COMPLETED" | "NOT_COMPLETED").
 */

(function () {
  'use strict';

  const MIN_WORK_TIME = 9 * 60;  // 540
  const MAX_WORK_TIME = 18 * 60; // 1080
  const MIN_SLOT_DURATION = 5;

  const STORAGE_KEY = "dailyPlanner:v3";

  // Unified State
  let state = {
    settings: {
      startMinutes: MIN_WORK_TIME,
      endMinutes: MAX_WORK_TIME,
      intervalMinutes: null,
    },
    slots: [], // Array of { id, durationMinutes, taskText, status }
  };

  let currentSlotIndex = 0;
  let unconfirmedSettingsChange = null;
  let durationChangeConfirm = null;

  // DOM Views
  const views = {
    settings: document.getElementById('view-settings'),
    slot: document.getElementById('view-slot'),
    summary: document.getElementById('view-summary'),
  };

  // Settings Elements
  const startInput = document.getElementById('starting-time-input');
  const endInput = document.getElementById('ending-time-input');
  const customIntervalInput = document.getElementById('settings-custom-interval');
  const settingsPills = document.querySelectorAll('#view-settings .quick-pill');
  const settingsNextBtn = document.getElementById('settings-next-btn');
  const errorStartTime = document.getElementById('error-start-time');
  const errorEndTime = document.getElementById('error-end-time');
  const errorInterval = document.getElementById('error-interval');

  // Slot Elements
  const slotBackBtn = document.getElementById('slot-back-btn');
  const slotTimeLeft = document.getElementById('slot-time-left');
  const slotBadge = document.getElementById('slot-badge');
  const slotEndLabel = document.getElementById('slot-end-label');
  const slotTimeRange = document.getElementById('slot-time-range');
  const slotPills = document.querySelectorAll('.slot-quick');
  const slotCustomDuration = document.getElementById('slot-custom-duration');
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

  // Dialogs
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
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  function formatMinutesTo12Hour(minutes) {
    const norm = ((minutes % 1440) + 1440) % 1440;
    const h24 = Math.floor(norm / 60);
    const m = norm % 60;
    const period = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const mStr = m < 10 ? '0' + m : String(m);
    return `${h12}:${mStr} ${period}`;
  }

  function formatRemainingTime(minutes) {
    if (minutes <= 0) return "0 min";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m} min`;
  }

  // --- STORAGE ---
  function saveStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Storage save error:", e);
    }
  }

  function loadStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object") {
          state.settings = {
            startMinutes: typeof parsed.settings?.startMinutes === "number" ? parsed.settings.startMinutes : MIN_WORK_TIME,
            endMinutes: typeof parsed.settings?.endMinutes === "number" ? parsed.settings.endMinutes : MAX_WORK_TIME,
            intervalMinutes: typeof parsed.settings?.intervalMinutes === "number" ? parsed.settings.intervalMinutes : null,
          };
          state.slots = Array.isArray(parsed.slots)
            ? parsed.slots.map((s, idx) => ({
                id: typeof s.id === "string" ? s.id : `slot-${idx + 1}`,
                durationMinutes: typeof s.durationMinutes === "number" ? s.durationMinutes : null,
                taskText: typeof s.taskText === "string" ? s.taskText : "",
                status: (s.status === "COMPLETED" || s.status === "NOT_COMPLETED") ? s.status : "NONE",
              }))
            : [];
        }
      }
    } catch (e) {
      console.warn("Storage read error:", e);
    }
  }

  // --- DERIVED SLOTS WITH TIMES ---
  function getSlotsWithTimes() {
    let currentStart = state.settings.startMinutes;
    return state.slots.map((slot, index) => {
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

  // --- VIEW SWITCHING ---
  function switchView(viewName) {
    Object.keys(views).forEach((name) => {
      views[name].classList.toggle('active', name === viewName);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // --- SETTINGS VIEW LOGIC ---
  function initSettingsView() {
    startInput.value = minutesToTimeString(state.settings.startMinutes || MIN_WORK_TIME);
    endInput.value = minutesToTimeString(state.settings.endMinutes || MAX_WORK_TIME);

    settingsPills.forEach((p) => {
      const val = parseInt(p.getAttribute('data-minutes'), 10);
      p.classList.toggle('selected', state.settings.intervalMinutes === val);
    });

    const isQuick = [15, 30, 45, 60, 90].includes(state.settings.intervalMinutes);
    if (!isQuick && state.settings.intervalMinutes !== null) {
      customIntervalInput.value = state.settings.intervalMinutes;
      customIntervalInput.classList.add('active');
    } else {
      customIntervalInput.value = "";
      customIntervalInput.classList.remove('active');
    }

    clearSettingsErrors();
  }

  function clearSettingsErrors() {
    errorStartTime.style.display = "none";
    errorEndTime.style.display = "none";
    errorInterval.style.display = "none";
  }

  settingsPills.forEach((p) => {
    p.addEventListener('click', () => {
      const mins = parseInt(p.getAttribute('data-minutes'), 10);
      state.settings.intervalMinutes = mins;
      customIntervalInput.value = "";
      customIntervalInput.classList.remove('active');
      settingsPills.forEach((pill) => pill.classList.toggle('selected', pill === p));
      errorInterval.style.display = "none";
    });
  });

  customIntervalInput.addEventListener('input', () => {
    const val = customIntervalInput.value.trim();
    if (!val) {
      state.settings.intervalMinutes = null;
      customIntervalInput.classList.remove('active');
    } else {
      const num = parseInt(val, 10);
      state.settings.intervalMinutes = !isNaN(num) && num > 0 ? num : null;
      customIntervalInput.classList.add('active');
    }
    settingsPills.forEach((p) => p.classList.remove('selected'));
    errorInterval.style.display = "none";
  });

  settingsNextBtn.addEventListener('click', () => {
    clearSettingsErrors();
    let hasError = false;

    const startVal = startInput.value;
    const endVal = endInput.value;
    const interval = state.settings.intervalMinutes;

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

    if (interval === null) {
      errorInterval.textContent = "Please choose an interval duration or type custom minutes.";
      errorInterval.style.display = "block";
      hasError = true;
    } else {
      if (interval < MIN_SLOT_DURATION) {
        errorInterval.textContent = `Interval must be a whole number of at least ${MIN_SLOT_DURATION} minutes.`;
        errorInterval.style.display = "block";
        hasError = true;
      } else if (endMins > startMins && interval > endMins - startMins) {
        errorInterval.textContent = `Interval cannot be longer than the total time between start and end (${endMins - startMins} minutes).`;
        errorInterval.style.display = "block";
        hasError = true;
      }
    }

    if (hasError) return;

    const settingsChanged =
      state.settings.startMinutes !== startMins ||
      state.settings.endMinutes !== endMins ||
      state.settings.intervalMinutes !== interval;

    if (state.slots.length > 0 && settingsChanged) {
      unconfirmedSettingsChange = {
        startMinutes: startMins,
        endMinutes: endMins,
        intervalMinutes: interval,
      };
      settingsConfirmDialog.showModal();
    } else {
      state.settings = {
        startMinutes: startMins,
        endMinutes: endMins,
        intervalMinutes: interval,
      };
      if (state.slots.length === 0) {
        state.slots = [
          {
            id: "slot-1",
            durationMinutes: interval,
            taskText: "",
            status: "NONE",
          },
        ];
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
    state.settings = unconfirmedSettingsChange;
    state.slots = [
      {
        id: "slot-1",
        durationMinutes: unconfirmedSettingsChange.intervalMinutes,
        taskText: "",
        status: "NONE",
      },
    ];
    saveStorage();
    settingsConfirmDialog.close();
    unconfirmedSettingsChange = null;
    currentSlotIndex = 0;
    renderSlotPage();
    switchView('slot');
  });

  // --- SLOT VIEW LOGIC ---
  function renderSlotPage() {
    const slotsWithTimes = getSlotsWithTimes();
    const current = slotsWithTimes[currentSlotIndex];
    if (!current) return;

    const slot = current.slot;
    const dayEndMins = state.settings.endMinutes;
    const availableMins = dayEndMins - current.startMinutes;

    slotBadge.textContent = `Slot ${current.slotNumber}`;

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

    // Duration quick pills
    slotPills.forEach((p) => {
      const val = parseInt(p.getAttribute('data-minutes'), 10);
      p.classList.toggle('selected', slot.durationMinutes === val);
    });

    const isQuick = [15, 30, 45, 60, 90].includes(slot.durationMinutes);
    if (!isQuick && slot.durationMinutes !== null) {
      slotCustomDuration.value = slot.durationMinutes;
      slotCustomDuration.classList.add('active');
    } else {
      slotCustomDuration.value = "";
      slotCustomDuration.classList.remove('active');
    }

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
    // Slot pages show NO checkbox, NO Completed button, and NO Not Completed button (even the last slot).
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
    const idx = currentSlotIndex;
    const laterSlotsExist = state.slots.length > idx + 1;

    if (laterSlotsExist) {
      durationChangeConfirm = {
        slotIndex: idx,
        newDuration,
      };
      durationConfirmDialog.showModal();
    } else {
      state.slots[idx].durationMinutes = newDuration;
      saveStorage();
      renderSlotPage();
    }
  }

  durationDialogCancel.addEventListener('click', () => {
    durationConfirmDialog.close();
    durationChangeConfirm = null;
  });

  durationDialogContinue.addEventListener('click', () => {
    if (!durationChangeConfirm) return;
    const { slotIndex, newDuration } = durationChangeConfirm;
    // On Continue remove only the later slots and their statuses
    state.slots = state.slots.slice(0, slotIndex + 1);
    state.slots[slotIndex].durationMinutes = newDuration;

    saveStorage();
    durationConfirmDialog.close();
    durationChangeConfirm = null;
    renderSlotPage();
  });

  slotPills.forEach((p) => {
    p.addEventListener('click', () => {
      const mins = parseInt(p.getAttribute('data-minutes'), 10);
      handleSlotDurationChangeRequest(mins);
    });
  });

  slotCustomDuration.addEventListener('input', () => {
    const val = slotCustomDuration.value.trim();
    if (!val) {
      state.slots[currentSlotIndex].durationMinutes = null;
      saveStorage();
      renderSlotPage();
    } else {
      const num = parseInt(val, 10);
      if (!isNaN(num) && num > 0) {
        handleSlotDurationChangeRequest(num);
      }
    }
  });

  slotTaskInput.addEventListener('input', () => {
    const slot = state.slots[currentSlotIndex];
    if (slot) {
      slot.taskText = slotTaskInput.value;
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
    const slotsWithTimes = getSlotsWithTimes();
    const current = slotsWithTimes[currentSlotIndex];
    if (!current || current.slot.durationMinutes === null) return;

    const dayEndMins = state.settings.endMinutes;
    // When a slot ends exactly at the Ending Time its button reads "Finish" and opens the Summary page
    if (current.endMinutes === dayEndMins) {
      renderSummaryView();
      switchView('summary');
      return;
    }

    const nextIndex = currentSlotIndex + 1;
    if (state.slots[nextIndex]) {
      currentSlotIndex = nextIndex;
      renderSlotPage();
    } else {
      // Every later slot starts EMPTY
      const newSlot = {
        id: `slot-${nextIndex + 1}`,
        durationMinutes: null,
        taskText: "",
        status: "NONE",
      };
      state.slots.push(newSlot);
      currentSlotIndex = nextIndex;
      saveStorage();
      renderSlotPage();
    }
  });

  // --- SUMMARY VIEW LOGIC ---
  function renderSummaryView() {
    const slotsWithTimes = getSlotsWithTimes();
    const totalSlots = slotsWithTimes.length;
    const startStr = formatMinutesTo12Hour(state.settings.startMinutes);
    const endStr = formatMinutesTo12Hour(state.settings.endMinutes);

    // 1. Title "Daily Work Summary" and a short line with day range and slot count
    summaryHeaderSubtitle.textContent = `${startStr} - ${endStr}, ${totalSlots} ${totalSlots === 1 ? "slot" : "slots"}`;

    // 2. Organized list of ALL slots in time order
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

    // 3. Render result area at the very end
    updateSummaryResult();
  }

  function updateSummaryResult() {
    if (!summaryResultArea) return;
    summaryResultArea.innerHTML = "";

    const total = state.slots.length;
    const anyNotCompleted = state.slots.some((s) => s.status === "NOT_COMPLETED");
    const allCompleted = total > 0 && state.slots.every((s) => s.status === "COMPLETED");

    if (allCompleted) {
      const card = document.createElement('div');
      card.className = "result-card";

      // Result message
      const msg = document.createElement('h2');
      msg.className = "result-message";
      msg.textContent = "Work complete";

      // Attempt to load happy.* image if present
      const img = document.createElement('img');
      img.className = "result-image";
      img.alt = "Happy smiley with two thumbs up: Work Completed";
      img.width = 440;
      img.height = 293;
      img.src = "images/happy.png"; // Primary candidate

      let fileMissingNotified = false;
      img.onerror = () => {
        // Fallback checks for .jpg, .jpeg, .webp, .gif or file missing
        if (img.src.endsWith(".png")) {
          img.src = "images/happy.jpg";
        } else if (img.src.endsWith(".jpg")) {
          img.src = "images/happy.jpeg";
        } else if (img.src.endsWith(".jpeg")) {
          img.src = "images/happy.webp";
        } else if (img.src.endsWith(".webp")) {
          img.src = "images/happy.gif";
        } else {
          // File is missing: show only the message "Work complete" and tell in console/UI
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
      // If ANY slot is marked Not Completed, show the "Work not complete" card
      const card = document.createElement('div');
      card.className = "result-card result-card-not-completed";

      const msg = document.createElement('h2');
      msg.className = "result-message";
      msg.textContent = "Work not complete";

      card.appendChild(msg);
      summaryResultArea.appendChild(card);
    } else {
      // In every other case, show only one small muted line
      const hint = document.createElement('p');
      hint.className = "result-hint";
      hint.textContent = "Mark every slot Completed to see your result.";
      summaryResultArea.appendChild(hint);
    }
  }

  summaryBackBtn.addEventListener('click', () => {
    currentSlotIndex = state.slots.length - 1;
    renderSlotPage();
    switchView('slot');
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
    // Clear all slots and their statuses; go to settings page
    state.slots = [];
    currentSlotIndex = 0;
    saveStorage();
    initSettingsView();
    switchView('settings');
  });

  function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Close native dialogs on outside click
  [newDayDialog, settingsConfirmDialog, durationConfirmDialog].forEach((diag) => {
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

  // APP ALWAYS OPENS ON THE FIRST PAGE ("settings") ON EVERY VISIT.
  loadStorage();
  initSettingsView();
  switchView('settings');
})();

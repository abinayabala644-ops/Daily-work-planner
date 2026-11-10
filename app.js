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

  // Safe ISO timestamp generator without using Date.prototype.toISOString directly for dates
  function getIsoTimestamp(d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    const padMs = (n) => String(n).padStart(3, '0');
    return d.getUTCFullYear() + '-' +
      pad(d.getUTCMonth() + 1) + '-' +
      pad(d.getUTCDate()) + 'T' +
      pad(d.getUTCHours()) + ':' +
      pad(d.getUTCMinutes()) + ':' +
      pad(d.getUTCSeconds()) + '.' +
      padMs(d.getUTCMilliseconds()) + 'Z';
  }

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
    home: document.getElementById('view-home'),
    prevSummary: document.getElementById('view-prev-summary'),
    prevDateSummary: document.getElementById('view-prev-date-summary'),
    upcomingDateSummary: document.getElementById('view-upcoming-date-summary'),
    settings: document.getElementById('view-settings'),
    slot: document.getElementById('view-slot'),
    summary: document.getElementById('view-summary'),
  };

  // Top Bar Navigation Elements
  const btnTopMyWorkBoard = document.getElementById('btn-top-my-work-board');
  const btnHomeNext = document.getElementById('btn-home-next');

  // Previous Work Summary Screen Elements
  const prevSummaryNextBtn = document.getElementById('prev-summary-next-btn');
  const prevSummaryContent = document.getElementById('prev-summary-content');

  // Previous Work Date Summary Screen Elements
  const prevDateSummaryBackBtn = document.getElementById('prev-date-summary-back-btn');
  const prevDateSummaryTitle = document.getElementById('prev-date-summary-title');
  const prevDateSummarySubtitle = document.getElementById('prev-date-summary-subtitle');
  const prevDateSummaryContent = document.getElementById('prev-date-summary-content');

  // Upcoming Work Date Summary Screen Elements
  const upcomingDateSummaryBackBtn = document.getElementById('upcoming-date-summary-back-btn');
  const upcomingDateSummaryTitle = document.getElementById('upcoming-date-summary-title');
  const upcomingDateSummarySubtitle = document.getElementById('upcoming-date-summary-subtitle');
  const upcomingDateSummaryContent = document.getElementById('upcoming-date-summary-content');

  // Home Page Elements
  const homeDailyProverb = document.getElementById('home-daily-proverb');
  const btnActivityPrev = document.getElementById('btn-activity-prev');
  const btnActivityToday = document.getElementById('btn-activity-today');
  const btnActivityUpcoming = document.getElementById('btn-activity-upcoming');
  const activityPanelTitle = document.getElementById('activity-panel-title');
  const activityPanelSubtitle = document.getElementById('activity-panel-subtitle');
  const activityPanelContent = document.getElementById('activity-panel-content');

  // In-app Reminder Banner Elements
  const appReminderBanner = document.getElementById('app-reminder-banner');
  const reminderBannerTask = document.getElementById('reminder-banner-task');
  const reminderBannerTiming = document.getElementById('reminder-banner-timing');
  const reminderDismissBtn = document.getElementById('reminder-dismiss-btn');

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
  const slotEndSelect = document.getElementById('slot-end-select');
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

  // Work Detail Dialog Elements
  const workDetailDialog = document.getElementById('work-detail-dialog');
  const detailDateVal = document.getElementById('detail-date-val');
  const detailTaskVal = document.getElementById('detail-task-val');
  const detailTimeVal = document.getElementById('detail-time-val');
  const detailStatusVal = document.getElementById('detail-status-val');
  const detailMarkRow = document.getElementById('detail-mark-row');
  const detailMarkVal = document.getElementById('detail-mark-val');
  const workDetailCloseBtn = document.getElementById('work-detail-close-btn');

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


  async function loadRange(fromKey, toKey) {
    if (!supabaseClient || !currentUserId || currentUserId === "anonymous") {
      return;
    }
    try {
      const pageSize = 1000;
      let page = 0;
      let keepFetching = true;

      while (keepFetching) {
        const fromIdx = page * pageSize;
        const toIdx = (page + 1) * pageSize - 1;

        const { data, error } = await supabaseClient
          .from('planner_days')
          .select('day, start_min, end_min, slots, saved_at')
          .eq('user_id', currentUserId)
          .gte('day', fromKey)
          .lte('day', toKey)
          .order('day', { ascending: false })
          .range(fromIdx, toIdx);

        if (error) {
          console.warn("loadRange error:", error);
          throw error;
        }

        if (Array.isArray(data)) {
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

          if (data.length < pageSize) {
            keepFetching = false;
          } else {
            page++;
          }
        } else {
          keepFetching = false;
        }
      }

      saveToLocalStorage();
    } catch (err) {
      console.warn("loadRange error:", err);
      throw err;
    }
  }


  async function loadAllSavedWorkUpToNow() {
    loadFromLocalStorage();

    if (supabaseClient && currentUserId && currentUserId !== "anonymous") {
      const todayStr = getLocalDateKey(todayDate);
      const pageSize = 1000;
      let page = 0;
      let keepFetching = true;

      while (keepFetching) {
        const fromIdx = page * pageSize;
        const toIdx = (page + 1) * pageSize - 1;

        const { data, error } = await supabaseClient
          .from('planner_days')
          .select('day, start_min, end_min, slots, saved_at')
          .eq('user_id', currentUserId)
          .lte('day', todayStr)
          .order('day', { ascending: false })
          .range(fromIdx, toIdx);

        if (error) {
          console.warn("loadAllSavedWorkUpToNow error:", error);
          throw error;
        }

        if (Array.isArray(data)) {
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

          if (data.length < pageSize) {
            keepFetching = false;
          } else {
            page++;
          }
        } else {
          keepFetching = false;
        }
      }

      saveToLocalStorage();
    }
  }


  async function loadAllUpcomingWork() {
    loadFromLocalStorage();

    if (supabaseClient && currentUserId && currentUserId !== "anonymous") {
      const todayStr = getLocalDateKey(todayDate);
      const pageSize = 1000;
      let page = 0;
      let keepFetching = true;

      while (keepFetching) {
        const fromIdx = page * pageSize;
        const toIdx = (page + 1) * pageSize - 1;

        const { data, error } = await supabaseClient
          .from('planner_days')
          .select('day, start_min, end_min, slots, saved_at')
          .eq('user_id', currentUserId)
          .gte('day', todayStr)
          .order('day', { ascending: true })
          .range(fromIdx, toIdx);

        if (error) {
          console.warn("loadAllUpcomingWork error:", error);
          throw error;
        }

        if (Array.isArray(data)) {
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

          if (data.length < pageSize) {
            keepFetching = false;
          } else {
            page++;
          }
        } else {
          keepFetching = false;
        }
      }

      saveToLocalStorage();
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


  // --- HOME VIEW (MY WORK BOARD) LOGIC ---
  const PROVERBS = [
    "Well begun is half done.",
    "A stitch in time saves nine.",
    "Slow and steady wins the race.",
    "Practice makes perfect.",
    "Rome was not built in a day.",
    "Where there is a will, there is a way.",
    "The early bird catches the worm.",
    "A journey of a thousand miles begins with a single step.",
    "Better late than never.",
    "Actions speak louder than words.",
    "Time and tide wait for no man.",
    "Many hands make light work."
  ];

  let currentActivityTab = null; // 'previous' | 'today' | 'upcoming' | null
  let selectedPreviousWorkDateKey = getLocalDateKey(addDays(todayDate, -1));

  if (workDetailCloseBtn && workDetailDialog) {
    workDetailCloseBtn.addEventListener('click', () => {
      workDetailDialog.close();
    });
  }

  function showWorkDetailModal(slotItem) {
    if (!workDetailDialog) return;
    const dObj = parseLocalDateKey(slotItem.dateKey);

    if (detailDateVal) {
      detailDateVal.textContent = formatFullDisplayDate(dObj);
    }
    if (detailTaskVal) {
      detailTaskVal.textContent = slotItem.taskText || "No task written";
    }
    if (detailTimeVal) {
      detailTimeVal.textContent = `${formatMinutesTo12Hour(slotItem.startMinutes)} - ${formatMinutesTo12Hour(slotItem.endMinutes)}`;
    }
    if (detailStatusVal) {
      const emoji = slotItem.status === 'COMPLETED' ? '😊 ' : (slotItem.status === 'NOT_COMPLETED' ? '😔 ' : '⏳ ');
      const statusLabel = slotItem.status === 'COMPLETED' ? 'Completed' : (slotItem.status === 'NOT_COMPLETED' ? 'Not Completed' : 'Not marked yet');
      detailStatusVal.textContent = emoji + statusLabel;
    }
    if (detailMarkRow && detailMarkVal) {
      const markMsg = formatMarkedAtMessage(slotItem.status, slotItem.markedAt, slotItem.dateKey);
      if (markMsg && !markMsg.muted) {
        detailMarkVal.textContent = markMsg.text;
        detailMarkRow.style.display = 'flex';
      } else {
        detailMarkRow.style.display = 'none';
      }
    }

    workDetailDialog.showModal();
  }

  function updateHomeProverb() {
    if (!homeDailyProverb) return;
    const now = new Date();
    // Choose by LOCAL calendar date (day number since a fixed date modulo 12, never random)
    const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const fixedEpoch = new Date(2026, 0, 1);
    const diffDays = Math.floor((localMidnight.getTime() - fixedEpoch.getTime()) / 86400000);
    const proverbIndex = ((diffDays % 12) + 12) % 12;
    homeDailyProverb.textContent = PROVERBS[proverbIndex];
  }

  function updateActivityNavButtonsState(activeTab) {
    if (btnActivityPrev) {
      btnActivityPrev.setAttribute('aria-pressed', String(activeTab === 'previous'));
    }
    if (btnActivityUpcoming) {
      btnActivityUpcoming.setAttribute('aria-pressed', String(activeTab === 'upcoming'));
    }
  }

  function createSlotTileElement(slotItem, includeDate = true, isPlannedContext = false) {
    const li = document.createElement('li');
    let statusClass = 'unmarked';
    if (slotItem.status === 'COMPLETED') {
      statusClass = 'comp';
    } else if (slotItem.status === 'NOT_COMPLETED') {
      statusClass = 'not-comp';
    } else if (isPlannedContext) {
      statusClass = 'planned';
    }
    li.className = 'home-tile-card ' + statusClass;
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `View details for ${slotItem.taskText || 'task'} on ${slotItem.dateKey}`);

    // Date
    if (includeDate) {
      const dateEl = document.createElement('div');
      dateEl.className = 'home-tile-date';
      dateEl.style.fontSize = '0.85rem';
      dateEl.style.fontWeight = '700';
      dateEl.style.color = 'var(--slate-700)';
      const dObj = parseLocalDateKey(slotItem.dateKey);
      dateEl.textContent = formatShortDisplayDate(dObj);
      li.appendChild(dateEl);
    }

    // Work / Task Name
    const taskDiv = document.createElement('div');
    if (slotItem.taskText) {
      taskDiv.className = 'home-tile-task';
      taskDiv.textContent = slotItem.taskText;
    } else {
      taskDiv.className = 'home-tile-task muted';
      taskDiv.textContent = 'No task written';
    }
    li.appendChild(taskDiv);

    // Starting Time and Finished By Time
    const timeSpan = document.createElement('div');
    timeSpan.className = 'home-tile-time';
    timeSpan.textContent = `${formatMinutesTo12Hour(slotItem.startMinutes)} - ${formatMinutesTo12Hour(slotItem.endMinutes)}`;
    li.appendChild(timeSpan);

    // Completion Status + Relevant completion symbol and words
    const statusDiv = document.createElement('div');
    statusDiv.className = 'home-tile-status ' + statusClass;
    if (isPlannedContext && (!slotItem.status || slotItem.status === 'NONE')) {
      const dot = document.createElement('span');
      dot.className = 'cal-status-planned-icon';
      dot.setAttribute('aria-hidden', 'true');
      statusDiv.appendChild(dot);
      const txt = document.createTextNode(' Planned');
      statusDiv.appendChild(txt);
    } else {
      let emoji = '⏳';
      let statusText = 'Not marked yet';
      if (slotItem.status === 'COMPLETED') {
        emoji = '😊';
        statusText = 'Completed';
      } else if (slotItem.status === 'NOT_COMPLETED') {
        emoji = '😔';
        statusText = 'Not Completed';
      }
      statusDiv.textContent = `${emoji} ${statusText}`;
    }
    li.appendChild(statusDiv);

    // Mark message if recorded
    if (slotItem.markedAt) {
      const markMsg = formatMarkedAtMessage(slotItem.status, slotItem.markedAt, slotItem.dateKey);
      if (markMsg && !markMsg.muted) {
        const markDiv = document.createElement('div');
        markDiv.className = 'home-tile-markmsg';
        markDiv.textContent = markMsg.text;
        li.appendChild(markDiv);
      }
    }

    // Click handler to open saved details modal
    li.addEventListener('click', () => {
      showWorkDetailModal(slotItem);
    });
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showWorkDetailModal(slotItem);
      }
    });

    return li;
  }

  function formatDayHeadingWithDate(dateKey) {
    const todayStr = getLocalDateKey(todayDate);
    const yesterdayStr = getLocalDateKey(addDays(todayDate, -1));
    const tomorrowStr = getLocalDateKey(addDays(todayDate, 1));
    const dObj = parseLocalDateKey(dateKey);

    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const formattedDate = `${days[dObj.getDay()]}, ${dObj.getDate()} ${months[dObj.getMonth()]} ${dObj.getFullYear()}`;

    if (dateKey === todayStr) {
      return `Today - ${formattedDate}`;
    }
    if (dateKey === yesterdayStr) {
      return `Yesterday - ${formattedDate}`;
    }
    if (dateKey === tomorrowStr) {
      return `Tomorrow - ${formattedDate}`;
    }
    return formattedDate;
  }

  function getValidSlotsForDay(dayData, dateKey) {
    if (!dayData || !Array.isArray(dayData.slots)) return [];
    const validSlots = [];
    dayData.slots.forEach((s, idx) => {
      const sStart = getEffectiveSlotStart(dayData, idx);
      const sEnd = typeof s.end === "number" ? s.end : null;
      if (sEnd !== null && !isNaN(sEnd) && sStart !== null && !isNaN(sStart)) {
        const text = (typeof s.taskText === "string" ? s.taskText : (s.text || "")).trim();
        const status = s.status || "NONE";
        validSlots.push({
          dateKey,
          startMinutes: sStart,
          endMinutes: sEnd,
          taskText: text,
          status,
          markedAt: s.markedAt || null,
        });
      }
    });
    validSlots.sort((a, b) => a.startMinutes - b.startMinutes);
    return validSlots;
  }

  let activePreviousSummaryDateKey = null;

  function renderPreviousWork7Days(daysList, fromKey, toKey) {
    if (!prevSummaryContent) return;
    prevSummaryContent.innerHTML = "";

    // 1. Toolbar with calendar icon and date selector
    const toolbar = document.createElement('div');
    toolbar.className = 'prev-work-toolbar';

    const dateLabel = document.createElement('label');
    dateLabel.className = 'prev-work-date-label';
    dateLabel.htmlFor = 'prev-work-date-selector';
    dateLabel.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>Select Date:`;

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.id = 'prev-work-date-selector';
    dateInput.className = 'prev-work-date-input';
    dateInput.value = selectedPreviousWorkDateKey;
    // Restrict previous work date selector to past dates (yesterday and earlier)
    const yesterdayStr = getLocalDateKey(addDays(todayDate, -1));
    dateInput.max = yesterdayStr;
    dateInput.addEventListener('change', () => {
      if (dateInput.value) {
        selectedPreviousWorkDateKey = dateInput.value;
        loadAndShowActivity('previous');
      }
    });

    const rangeInfo = document.createElement('p');
    rangeInfo.className = 'prev-work-range-info';
    const fromObj = parseLocalDateKey(fromKey);
    const toObj = parseLocalDateKey(toKey);
    rangeInfo.textContent = `Showing previous 6 calendar days plus selected date (7 days total: ${formatShortDisplayDate(fromObj)} – ${formatShortDisplayDate(toObj)})`;

    toolbar.appendChild(dateLabel);
    toolbar.appendChild(dateInput);
    toolbar.appendChild(rangeInfo);
    prevSummaryContent.appendChild(toolbar);

    // If the 7 days have no valid work: show only "No previous work found in these 7 days."
    if (!daysList || daysList.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.className = 'activity-panel-message';
      emptyMsg.style.textAlign = 'left';
      emptyMsg.style.padding = '16px 0';
      emptyMsg.textContent = "No previous work found in these 7 days.";
      prevSummaryContent.appendChild(emptyMsg);
      return;
    }

    // 2. Row of date buttons (No "All dates" button - click any date button navigates to separate date summary page)
    const jumpRow = document.createElement('div');
    jumpRow.className = 'prev-work-jump-row';
    jumpRow.setAttribute('role', 'group');
    jumpRow.setAttribute('aria-label', 'Available dates');

    daysList.forEach(dayItem => {
      const dObj = parseLocalDateKey(dayItem.dateKey);
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const shortLabel = `${days[dObj.getDay()]} ${dObj.getDate()} ${months[dObj.getMonth()]}`;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-jump-date';
      const isSelected = activePreviousSummaryDateKey === dayItem.dateKey;
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      btn.textContent = `${shortLabel} - ${dayItem.slots.length}`;
      btn.dataset.dateKey = dayItem.dateKey;
      btn.addEventListener('click', () => {
        activePreviousSummaryDateKey = dayItem.dateKey;
        openPreviousWorkDateSummary(dayItem);
      });
      jumpRow.appendChild(btn);
    });

    prevSummaryContent.appendChild(jumpRow);
  }

  function openPreviousWorkDateSummary(dayItem) {
    if (!prevDateSummaryContent) return;
    prevDateSummaryContent.innerHTML = "";

    const dObj = parseLocalDateKey(dayItem.dateKey);
    const fullDateText = formatFullDisplayDate(dObj);
    if (prevDateSummaryTitle) {
      prevDateSummaryTitle.textContent = "Previous Work Date Summary";
    }
    if (prevDateSummarySubtitle) {
      prevDateSummarySubtitle.textContent = `All activities for ${fullDateText}`;
    }

    // ONE clean, professional summary tile containing all work activities together
    const tile = document.createElement('div');
    tile.className = 'date-summary-tile';

    const tileHeader = document.createElement('div');
    tileHeader.className = 'date-summary-tile-header';

    const dateHeading = document.createElement('h2');
    dateHeading.className = 'date-summary-tile-date';
    dateHeading.textContent = fullDateText;
    tileHeader.appendChild(dateHeading);

    const compCount = dayItem.slots.filter(s => s.status === 'COMPLETED').length;
    const notCompCount = dayItem.slots.filter(s => s.status === 'NOT_COMPLETED').length;
    const unmarkedCount = dayItem.slots.filter(s => s.status !== 'COMPLETED' && s.status !== 'NOT_COMPLETED').length;

    const countP = document.createElement('p');
    countP.className = 'date-summary-tile-count';
    countP.textContent = `${dayItem.slots.length} ${dayItem.slots.length === 1 ? 'activity' : 'activities'} (${compCount} Completed, ${notCompCount} Not Completed, ${unmarkedCount} Not marked yet)`;
    tileHeader.appendChild(countP);
    tile.appendChild(tileHeader);

    // List of all work activities within the single summary tile
    const list = document.createElement('ul');
    list.className = 'date-summary-activities-list';

    dayItem.slots.forEach(slotItem => {
      const li = document.createElement('li');
      const statusClass = slotItem.status === 'COMPLETED' ? 'comp' : (slotItem.status === 'NOT_COMPLETED' ? 'not-comp' : 'unmarked');
      li.className = 'date-summary-activity-item ' + statusClass;

      const mainRow = document.createElement('div');
      mainRow.className = 'date-summary-activity-main';

      const desc = document.createElement('span');
      desc.className = 'date-summary-activity-desc';
      desc.textContent = slotItem.taskText || 'No task written';
      mainRow.appendChild(desc);

      const time = document.createElement('span');
      time.className = 'date-summary-activity-time';
      time.textContent = `${formatMinutesTo12Hour(slotItem.startMinutes)} - ${formatMinutesTo12Hour(slotItem.endMinutes)}`;
      mainRow.appendChild(time);
      li.appendChild(mainRow);

      const statusRow = document.createElement('div');
      statusRow.className = 'date-summary-activity-status ' + statusClass;
      const emoji = slotItem.status === 'COMPLETED' ? '✓ ' : (slotItem.status === 'NOT_COMPLETED' ? '✗ ' : '⏳ ');
      const label = slotItem.status === 'COMPLETED' ? 'Completed' : (slotItem.status === 'NOT_COMPLETED' ? 'Not Completed' : 'Not marked yet');
      statusRow.textContent = `Status: ${emoji}${label}`;
      li.appendChild(statusRow);

      list.appendChild(li);
    });

    tile.appendChild(list);
    prevDateSummaryContent.appendChild(tile);

    switchView('prevDateSummary');
  }

  async function hasAnyFutureWorkSaved(todayStr) {
    // 1. Check local state cache
    const localHas = Object.keys(state.days).some(k => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || k <= todayStr) return false;
      const slots = getValidSlotsForDay(state.days[k], k);
      return slots.length > 0;
    });
    if (localHas) return true;

    // 2. If signed in, check Supabase
    if (supabaseClient && currentUserId && currentUserId !== "anonymous") {
      try {
        const { data, error } = await supabaseClient
          .from('planner_days')
          .select('day, start_min, slots')
          .eq('user_id', currentUserId)
          .gt('day', todayStr)
          .limit(10);

        if (!error && Array.isArray(data)) {
          for (const row of data) {
            if (row && typeof row.day === "string") {
              const sMin = typeof row.start_min === "number" ? row.start_min : MIN_WORK_TIME;
              const sanitized = sanitizeSlots(row.slots, sMin);
              const valid = getValidSlotsForDay({ slots: sanitized, startMinutes: sMin }, row.day);
              if (valid.length > 0) return true;
            }
          }
        }
      } catch (err) {
        console.warn("hasAnyFutureWorkSaved error:", err);
      }
    }
    return false;
  }

  async function loadAndShowActivity(tab) {
    currentActivityTab = tab;
    updateActivityNavButtonsState(tab);

    if (tab === 'today') {
      // CHANGE 3: Choosing "Today Schedule" opens the existing Summary page for TODAY
      const todayStr = getLocalDateKey(todayDate);
      handleSelectDate(todayStr);
      return;
    }

    if (tab === 'previous') {
      // CHANGE 1: Choosing "Previous Work" opens ONE screen titled "Previous Work Summary"
      switchView('prevSummary');
      if (prevSummaryContent) {
        prevSummaryContent.innerHTML = '<p class="activity-panel-message">Loading…</p>';
      }

      const todayStr = getLocalDateKey(todayDate);
      try {
        // Enforce strictly previous work: do not include today's schedule
        if (selectedPreviousWorkDateKey >= todayStr) {
          selectedPreviousWorkDateKey = getLocalDateKey(addDays(todayDate, -1));
        }
        const selObj = parseLocalDateKey(selectedPreviousWorkDateKey);
        const fromDateObj = addDays(selObj, -6);
        const fromKey = getLocalDateKey(fromDateObj);
        const toKey = selectedPreviousWorkDateKey;

        // Load all 7 days in one range request (reuses loadRange with pages of 1000 rows)
        if (supabaseClient && currentUserId && currentUserId !== "anonymous") {
          await loadRange(fromKey, toKey);
        } else {
          loadFromLocalStorage();
        }

        const daysList = [];
        // Walk backwards from toKey to fromKey (6 previous days plus selected date = 7 days total)
        for (let offset = 0; offset >= -6; offset--) {
          const dKey = getLocalDateKey(addDays(selObj, offset));
          if (dKey >= todayStr) continue; // strictly exclude today
          const dayData = state.days[dKey];
          const slots = getValidSlotsForDay(dayData, dKey);
          // Only dates with at least one valid slot (valid start and end time) are listed
          if (slots.length > 0) {
            daysList.push({
              dateKey: dKey,
              slots,
            });
          }
        }

        renderPreviousWork7Days(daysList, fromKey, toKey);
      } catch (err) {
        if (prevSummaryContent) {
          prevSummaryContent.innerHTML = "";
          const p = document.createElement('p');
          p.className = 'activity-panel-message';
          p.textContent = "Could not load your work.";

          const retry = document.createElement('button');
          retry.type = 'button';
          retry.className = 'btn btn-secondary';
          retry.style.minHeight = '44px';
          retry.style.marginTop = '8px';
          retry.textContent = 'Retry';
          retry.addEventListener('click', () => loadAndShowActivity('previous'));

          prevSummaryContent.appendChild(p);
          prevSummaryContent.appendChild(retry);
        }
      }
      return;
    }

    if (activityPanelTitle) {
      activityPanelTitle.style.display = 'block';
      activityPanelTitle.textContent = 'Upcoming Work';
    }

    if (activityPanelSubtitle) {
      activityPanelSubtitle.style.display = 'none';
      activityPanelSubtitle.textContent = '';
    }

    if (activityPanelContent) {
      activityPanelContent.innerHTML = '<p class="activity-panel-message">Loading…</p>';
    }

    const todayStr = getLocalDateKey(todayDate);

    try {
      if (tab === 'upcoming') {
        const tomorrowDateObj = addDays(todayDate, 1);
        const endDateObj = addDays(todayDate, 7);
        const fromKey = getLocalDateKey(tomorrowDateObj);
        const toKey = getLocalDateKey(endDateObj);

        // Subtitle under Upcoming Work heading
        if (activityPanelSubtitle) {
          activityPanelSubtitle.textContent = `Next 7 days: ${formatShortDisplayDate(tomorrowDateObj)} - ${formatShortDisplayDate(endDateObj)}`;
          activityPanelSubtitle.style.display = 'block';
        }

        // Always ensure local data is loaded
        loadFromLocalStorage();

        // Load 7 days in one range request
        if (supabaseClient && currentUserId && currentUserId !== "anonymous") {
          await loadRange(fromKey, toKey);
        }

        // Collect days in window that have saved work slots
        const windowDays = [];
        for (let i = 1; i <= 7; i++) {
          const dKey = getLocalDateKey(addDays(todayDate, i));
          const dayData = state.days[dKey];
          const validSlots = getValidSlotsForDay(dayData, dKey);
          if (validSlots.length > 0) {
            windowDays.push({
              dateKey: dKey,
              slots: validSlots,
            });
          }
        }

        if (activityPanelContent) {
          activityPanelContent.innerHTML = "";
        }

        if (windowDays.length > 0) {
          // Render one section per date, earliest first
          windowDays.forEach(dayItem => {
            const section = document.createElement('section');
            section.className = 'home-day-section';

            const header = document.createElement('div');
            header.className = 'home-day-header';

            const h3 = document.createElement('h3');
            h3.className = 'home-day-title';
            h3.textContent = formatDayHeadingWithDate(dayItem.dateKey);
            header.appendChild(h3);

            const countSpan = document.createElement('span');
            countSpan.className = 'home-day-count';
            countSpan.textContent = `${dayItem.slots.length} ${dayItem.slots.length === 1 ? 'slot' : 'slots'}`;
            header.appendChild(countSpan);

            section.appendChild(header);

            const ul = document.createElement('ul');
            ul.className = 'home-tiles-grid';

            dayItem.slots.forEach(slotItem => {
              const tile = createSlotTileElement(slotItem, false, true);
              ul.appendChild(tile);
            });

            section.appendChild(ul);
            activityPanelContent.appendChild(section);
          });
        } else {
          // No saved work in the next 7 days window - distinguish between empty window and empty future
          const hasAnyFuture = await hasAnyFutureWorkSaved(todayStr);

          if (hasAnyFuture) {
            const p = document.createElement('p');
            p.className = 'activity-panel-message';
            p.textContent = "No work scheduled in the next 7 days.";

            const hint = document.createElement('p');
            hint.className = 'activity-panel-hint';
            hint.textContent = "Plan a day from the planner calendar to see it here.";

            activityPanelContent.appendChild(p);
            activityPanelContent.appendChild(hint);
          } else {
            const p = document.createElement('p');
            p.className = 'activity-panel-message';
            p.textContent = "You have not added any work yet.";
            activityPanelContent.appendChild(p);
          }
        }
      }
    } catch (err) {
      if (activityPanelContent) {
        activityPanelContent.innerHTML = "";
        const p = document.createElement('p');
        p.className = 'activity-panel-message';
        p.textContent = "Could not load your work.";

        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'btn btn-secondary';
        retry.style.minHeight = '44px';
        retry.style.marginTop = '8px';
        retry.textContent = 'Retry';
        retry.addEventListener('click', () => loadAndShowActivity(tab));

        activityPanelContent.appendChild(p);
        activityPanelContent.appendChild(retry);
      }
    }
  }

  if (btnActivityPrev) {
    btnActivityPrev.addEventListener('click', () => {
      loadAndShowActivity('previous');
    });
  }

  if (btnActivityToday) {
    btnActivityToday.addEventListener('click', () => {
      loadAndShowActivity('today');
    });
  }

  if (btnActivityUpcoming) {
    btnActivityUpcoming.addEventListener('click', () => {
      loadAndShowActivity('upcoming');
    });
  }

  async function renderHomeView() {
    updateHomeProverb();
    // Reload user's saved plans every time Home opens
    try {
      await loadPlans();
    } catch (e) {
      console.warn("Failed to refresh plans on Home open", e);
    }
    checkInAppReminders();

    if (currentActivityTab) {
      loadAndShowActivity(currentActivityTab);
    } else {
      updateActivityNavButtonsState(null);
      if (activityPanelTitle) activityPanelTitle.style.display = 'none';
      if (activityPanelContent) {
        activityPanelContent.innerHTML = '<p class="activity-panel-message">Choose a button above to view your work.</p>';
      }
    }
  }

  if (btnHomeNext) {
    btnHomeNext.addEventListener('click', () => {
      selectedDateKey = getLocalDateKey(todayDate);
      initSettingsView();
      switchView('settings');
      if (startInput) startInput.focus();
    });
  }

  async function handleGoToHome(e) {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    flushPendingDebouncedSave();

    // Reset currentActivityTab so Home shows the default activity selection clean
    currentActivityTab = null;

    // If leaving a slot page, perform the exact cleanup as slot back button (clean up new empty slot)
    const dayData = getCurrentDayData();
    if (dayData && Array.isArray(dayData.slots) && typeof currentSlotIndex === "number" && dayData.slots[currentSlotIndex]) {
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

    switchView('home');
    await renderHomeView();
  }

  if (btnTopMyWorkBoard) {
    btnTopMyWorkBoard.addEventListener('click', handleGoToHome);
  }

  // Also bind via document-level delegation to guarantee any button with id="btn-top-my-work-board" or class="btn-top-board" triggers handleGoToHome
  document.addEventListener('click', (e) => {
    const target = e.target && e.target.closest ? (e.target.closest('#btn-top-my-work-board') || e.target.closest('.btn-top-board')) : null;
    if (target) {
      handleGoToHome(e);
    }
  });

  if (prevSummaryNextBtn) {
    prevSummaryNextBtn.addEventListener('click', () => {
      selectedDateKey = getLocalDateKey(todayDate);
      initSettingsView();
      switchView('settings');
      if (startInput) startInput.focus();
    });
  }

  // Previous Work Date Summary Back button -> return to Previous Work Summary page preserving 7-day view & selection
  if (prevDateSummaryBackBtn) {
    prevDateSummaryBackBtn.addEventListener('click', () => {
      switchView('prevSummary');
      loadAndShowActivity('previous');
    });
  }

  // Upcoming Work Date Summary Back button -> return to Upcoming Work page preserving calendar-week view & selection
  if (upcomingDateSummaryBackBtn) {
    upcomingDateSummaryBackBtn.addEventListener('click', () => {
      switchView('home');
      loadAndShowActivity('upcoming');
    });
  }

  // --- IN-APP REMINDER SYSTEM ---
  let dismissedReminderSlotIds = new Set();

  async function checkInAppReminders() {
    if (!appReminderBanner || !currentUserId || currentUserId === "anonymous") return;

    const todayStr = getLocalDateKey(todayDate);
    // Ensure today data is loaded
    if (!state.days[todayStr]) {
      try {
        await loadRange(todayStr, todayStr);
      } catch (e) {
        // Ignore
      }
    }

    const todayData = state.days[todayStr];
    if (!todayData || !Array.isArray(todayData.slots)) {
      appReminderBanner.style.display = "none";
      return;
    }

    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    let matchingSlot = null;
    for (let idx = 0; idx < todayData.slots.length; idx++) {
      const slot = todayData.slots[idx];
      const sStart = getEffectiveSlotStart(todayData, idx);
      const sEnd = typeof slot.end === "number" ? slot.end : null;
      const taskText = (typeof slot.taskText === "string" ? slot.taskText : (slot.text || "")).trim();
      const status = slot.status || "NONE";

      if (
        sEnd !== null &&
        sStart <= currentMins &&
        currentMins < sEnd &&
        taskText !== "" &&
        status !== "COMPLETED"
      ) {
        const slotKey = todayStr + ":" + (slot.id || idx);
        if (!dismissedReminderSlotIds.has(slotKey)) {
          matchingSlot = {
            slot,
            slotKey,
            start: sStart,
            end: sEnd,
            taskText,
          };
          break; // earliest matching slot
        }
      }
    }

    if (matchingSlot) {
      if (reminderBannerTask) {
        reminderBannerTask.textContent = `Task: ${matchingSlot.taskText}`;
      }
      if (reminderBannerTiming) {
        reminderBannerTiming.textContent = `Scheduled: ${formatMinutesTo12Hour(matchingSlot.start)} - ${formatMinutesTo12Hour(matchingSlot.end)}`;
      }
      appReminderBanner.style.display = "flex";

      if (reminderDismissBtn) {
        reminderDismissBtn.onclick = () => {
          dismissedReminderSlotIds.add(matchingSlot.slotKey);
          appReminderBanner.style.display = "none";
        };
      }
    } else {
      appReminderBanner.style.display = "none";
    }
  }

  // Check reminders every 30 seconds & on visibilitychange
  setInterval(checkInAppReminders, 30000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkInAppReminders();
    }
  });

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
      if (views[name]) {
        views[name].classList.toggle('active', name === viewName);
      }
    });

    // Toggle visibility of top bar controls depending on screen
    if (btnTopMyWorkBoard) {
      // Show on all signed-in screens except Home
      btnTopMyWorkBoard.style.display = viewName === 'home' ? 'none' : 'inline-flex';
    }
    if (btnHomeNext) {
      // Home Next button in the top bar is only displayed on Home
      btnHomeNext.style.display = viewName === 'home' ? 'inline-flex' : 'none';
    }

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

    // Populate Finished By dropdown options
    populateFinishedByDropdown(slot, effectiveStart, dayData.endMinutes);

    // 3. Work for this slot
    slotTaskInput.value = slot.taskText || slot.text || "";

    // Update validation and buttons state
    updateSlotValidationUI();
  }

  function populateFinishedByDropdown(slot, startMinutes, dayEndMinutes) {
    if (!slotEndSelect) return;
    slotEndSelect.innerHTML = '<option value="">Select time</option>';

    const effectiveEnd = (typeof dayEndMinutes === "number" && !isNaN(dayEndMinutes)) ? dayEndMinutes : MAX_WORK_TIME;
    const minEnd = startMinutes + 5;

    // Generate 5-minute multiples from minEnd rounded up to nearest 5
    const firstOptionTime = Math.ceil(minEnd / 5) * 5;
    const standardTimes = new Set();

    for (let t = firstOptionTime; t <= effectiveEnd; t += 5) {
      standardTimes.add(t);
      const opt = document.createElement('option');
      opt.value = String(t);
      opt.textContent = formatMinutesTo12Hour(t);
      slotEndSelect.appendChild(opt);
    }

    // A saved Finished By that is not a multiple of 5 (older data) is added as an extra option and shown selected
    const savedEnd = (typeof slot.end === "number" && !isNaN(slot.end)) ? slot.end : null;
    if (savedEnd !== null) {
      if (!standardTimes.has(savedEnd)) {
        const extraOpt = document.createElement('option');
        extraOpt.value = String(savedEnd);
        extraOpt.textContent = formatMinutesTo12Hour(savedEnd);
        // Insert in chronological order or append
        let inserted = false;
        const opts = Array.from(slotEndSelect.options);
        for (let i = 1; i < opts.length; i++) {
          if (parseInt(opts[i].value, 10) > savedEnd) {
            slotEndSelect.insertBefore(extraOpt, opts[i]);
            inserted = true;
            break;
          }
        }
        if (!inserted) {
          slotEndSelect.appendChild(extraOpt);
        }
      }
      slotEndSelect.value = String(savedEnd);
    } else {
      slotEndSelect.value = "";
    }
  }

  function isLastSlotOfDay(slot, dayData) {
    if (!slot || !dayData) return false;
    const slotEnd = typeof slot.end === "number" ? slot.end : null;
    const dayEnd = typeof dayData.endMinutes === "number" ? dayData.endMinutes : null;
    return slotEnd !== null && dayEnd !== null && slotEnd === dayEnd;
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

    const hasChosenEnd = Boolean(slotEndSelect.value);
    const isEndValid = Boolean(hasChosenEnd && !error);
    const isLastSlot = isEndValid && isLastSlotOfDay(slot, dayData);

    // Forward button is disabled until the slot has a valid Finished By
    if (slotNextBtn) {
      slotNextBtn.disabled = !isEndValid;
      slotNextBtn.textContent = isLastSlot ? "Finish" : "Next \u2192";
    }

    if (slotEndLastHint) {
      slotEndLastHint.textContent = "This is the last slot. Finish opens your summary.";
      slotEndLastHint.style.display = isLastSlot ? "block" : "none";
    }

    if (error && (showErrorAlways || hasChosenEnd)) {
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
          slotEndSelect.value = (typeof slot.end === "number" && !isNaN(slot.end)) ? String(slot.end) : "";
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

  slotEndSelect.addEventListener('change', () => {
    const dayData = getCurrentDayData();
    if (!dayData || !dayData.slots[currentSlotIndex]) return;

    const val = slotEndSelect.value;
    const endMinutes = val ? parseInt(val, 10) : null;
    const slot = dayData.slots[currentSlotIndex];

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

      // formatMarkedAtMessage is declared in outer scope

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
          slot.markedAt = getIsoTimestamp();
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
          slot.markedAt = getIsoTimestamp();
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
    // Show ONE green message "Saved Successfully!" with a check mark above the Save button
    if (summaryFinishMessage) {
      summaryFinishMessage.innerHTML = "";
      summaryFinishMessage.className = "";
      summaryFinishMessage.style.display = "none";
    }

    if (summarySaveMessage) {
      summarySaveMessage.innerHTML = "";
      summarySaveMessage.className = "save-message-box save-message-success";
      summarySaveMessage.style.display = "flex";

      const checkIcon = document.createElement('span');
      checkIcon.setAttribute('aria-hidden', 'true');
      checkIcon.style.marginRight = "8px";
      checkIcon.textContent = "✓";

      const msgSpan = document.createElement('span');
      msgSpan.textContent = "Saved Successfully!";

      summarySaveMessage.appendChild(checkIcon);
      summarySaveMessage.appendChild(msgSpan);
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
      const nowIso = getIsoTimestamp();
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
  [newDayDialog, settingsConfirmDialog, durationConfirmDialog, calendarDialog, workDetailDialog].filter(Boolean).forEach((diag) => {
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

      // A signed-in user who opens the site lands on Home (My Work Board)
      selectedDateKey = getLocalDateKey(todayDate);
      switchView('home');
      await renderHomeView();
    } catch (e) {
      console.error('Auth verification error:', e);
      window.location.replace('login.html');
    }
  }

  checkAuthAndStart();
})();

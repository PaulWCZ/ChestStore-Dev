// @argentic/chest-ui/components/logic — the components' rules as pure
// functions, and their default words: server-safe (no React, no
// "use client"), the same in Node and in every browser. A server component
// formats a date for a DayStrip here; a service applies the people search
// rule; tests drive the keyboards without a browser.
export { dateWords, en, fr, kitWords, storeLanguages, wordsFor, type Language, type DateWords, type DateWordsInput, type DialogWords, type FileWords, type FilterWords, type KitWords, type PeoplePickerWords, type Plural, type SearchWords, type ShellWords, type TableWords, type ToastWords } from "./words.js";
export { compareText, cx, fill, fold, initials, isEditable, plural } from "./text.js";
export { addDays, addMonths, addYearMonths, calendarKey, clampDate, daysBetween, daysInMonth, formatDate, isIsoDate, isoOf, isYearMonth, monthGrid, monthsFrom, parseDate, partsOf, relativeDay, startOfWeek, weekday, weekdayHeads, type CalendarDay, type IsoDate, type YearMonth } from "./dates.js";
export { endOfDay, moveEnd, moveStart, parseTime, timeOptions, timeText, type TimeOptions } from "./time.js";
export { localSearch, matches, rememberRecent, searchChoices, type Choice, type SearchOptions } from "./people.js";
export { listKey, menuKey, tabKey, type ListMove } from "./keys.js";
export { durations, latestUndo, settleUndo, toastReducer, type ToastAction, type ToastActionButton, type ToastInput, type ToastPhase, type ToastState, type UndoResult } from "./toast-state.js";
export { acceptText, accepts, checkFiles, fileSize, putWithProgress, refusalText, type FileLike, type FileRules, type Progress, type Refusal } from "./files.js";
export { activeFilters, ariaSort, clearHref, compareValues, filterHref, isCurrent, nextSort, paramOf, paramValues, sortRows, type CurrentRule, type Sort, type SortDir, type SortValue } from "./lists.js";

export type DayTrackingState = { today: string; selectedDate: string };

/**
 * Called when the clock may have crossed midnight. If the professional was
 * looking at the old "today" the view follows to the new day; if she was
 * browsing another date, the selected date is kept.
 */
export function advanceDay(state: DayTrackingState, nowToday: string): DayTrackingState {
  if (nowToday === state.today) return state;
  return {
    today: nowToday,
    selectedDate: state.selectedDate === state.today ? nowToday : state.selectedDate,
  };
}

export const DAY_CHECK_INTERVAL_MS = 60_000;

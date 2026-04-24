// Time is Unix milliseconds throughout the engine.
export type Time = number;

export interface TimelineEvent {
  id: string;
  start: Time;
  end?: Time;
  title: string;
  book?: string;
  category?: string;
  lane?: string;
  meta?: Record<string, unknown>;
}

export interface ViewState {
  viewStart: Time;
  viewEnd: Time;
}

export interface TickMark {
  time: Time;
  x: number; // CSS pixel position within the canvas
  label: string;
}

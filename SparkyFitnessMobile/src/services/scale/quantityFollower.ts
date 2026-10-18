export type FollowMode = 'following' | 'locked' | 'manual';

export interface FollowState {
  readonly mode: FollowMode;
  /** Magnitude of the reading that drives the quantity; null until the scale reports one. */
  readonly grams: number | null;
  /** True when the reading was negative: food removed from a tared container. */
  readonly negative: boolean;
}

export type FollowAction =
  | { readonly type: 'live'; readonly grams: number }
  | { readonly type: 'settled'; readonly grams: number }
  | { readonly type: 'manual' }
  | { readonly type: 'resume' };

export const INITIAL_FOLLOW_STATE: FollowState = {
  mode: 'following',
  grams: null,
  negative: false,
};

/** A settled weight lighter than this is an empty scale, not a weighing. */
const MIN_LOCK_GRAMS = 1;

const reading = (mode: FollowMode, grams: number): FollowState => ({
  mode,
  grams: Math.abs(grams),
  negative: grams < 0,
});

export function followReducer(
  state: FollowState,
  action: FollowAction
): FollowState {
  switch (action.type) {
    case 'live':
      return state.mode === 'following'
        ? reading('following', action.grams)
        : state;
    case 'settled':
      return state.mode === 'following' &&
        Math.abs(action.grams) >= MIN_LOCK_GRAMS
        ? reading('locked', action.grams)
        : state;
    case 'manual':
      return { ...state, mode: 'manual' };
    case 'resume':
      return INITIAL_FOLLOW_STATE;
  }
}

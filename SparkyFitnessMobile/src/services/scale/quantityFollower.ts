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

/** A reading lighter than this is an empty scale, not a weighing. */
const MIN_WEIGHT_GRAMS = 1;

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
      if (state.mode !== 'following') return state;
      // An empty scale streams 0 g constantly; until the first real weight,
      // following it would wipe whatever the form was pre-filled with.
      if (state.grams === null && Math.abs(action.grams) < MIN_WEIGHT_GRAMS) {
        return state;
      }
      return reading('following', action.grams);
    case 'settled':
      return state.mode === 'following' &&
        Math.abs(action.grams) >= MIN_WEIGHT_GRAMS
        ? reading('locked', action.grams)
        : state;
    case 'manual':
      return { ...state, mode: 'manual' };
    case 'resume':
      return INITIAL_FOLLOW_STATE;
  }
}

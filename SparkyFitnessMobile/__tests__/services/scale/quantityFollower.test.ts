import {
  INITIAL_FOLLOW_STATE,
  followReducer,
  type FollowAction,
  type FollowState,
} from '../../../src/services/scale/quantityFollower';

const run = (
  actions: FollowAction[],
  from: FollowState = INITIAL_FOLLOW_STATE
) => actions.reduce(followReducer, from);

describe('followReducer', () => {
  it('starts following with nothing to show', () => {
    expect(INITIAL_FOLLOW_STATE).toEqual({
      mode: 'following',
      grams: null,
      negative: false,
    });
  });

  it('follows the live magnitude and remembers the sign', () => {
    expect(run([{ type: 'live', grams: 150 }])).toEqual({
      mode: 'following',
      grams: 150,
      negative: false,
    });
    expect(run([{ type: 'live', grams: -150 }])).toEqual({
      mode: 'following',
      grams: 150,
      negative: true,
    });
  });

  it('locks on a settled weight of at least 1 g', () => {
    expect(
      run([
        { type: 'live', grams: 90 },
        { type: 'settled', grams: 91 },
      ])
    ).toEqual({
      mode: 'locked',
      grams: 91,
      negative: false,
    });
  });

  it('locks a negative settle on its magnitude', () => {
    expect(run([{ type: 'settled', grams: -150 }])).toEqual({
      mode: 'locked',
      grams: 150,
      negative: true,
    });
  });

  it('never locks on an empty scale', () => {
    expect(run([{ type: 'settled', grams: 0 }]).mode).toBe('following');
    expect(run([{ type: 'settled', grams: 0 }]).grams).toBeNull();
  });

  it('ignores live readings once locked', () => {
    const locked = run([{ type: 'settled', grams: 176 }]);
    expect(
      run(
        [
          { type: 'live', grams: 0 },
          { type: 'live', grams: -500 },
        ],
        locked
      )
    ).toBe(locked);
  });

  it('ignores a second settled reading once locked (jitter of 1 g)', () => {
    const locked = run([{ type: 'settled', grams: 177 }]);
    expect(run([{ type: 'settled', grams: 176 }], locked)).toBe(locked);
  });

  it('stops following after a manual edit and ignores the scale until resumed', () => {
    const manual = run([{ type: 'live', grams: 80 }, { type: 'manual' }]);
    expect(manual.mode).toBe('manual');
    expect(
      run(
        [
          { type: 'live', grams: 500 },
          { type: 'settled', grams: 500 },
        ],
        manual
      )
    ).toBe(manual);
  });

  it('weigh again (resume) returns to following from locked or manual', () => {
    expect(run([{ type: 'settled', grams: 176 }, { type: 'resume' }])).toEqual(
      INITIAL_FOLLOW_STATE
    );
    expect(run([{ type: 'manual' }, { type: 'resume' }])).toEqual(
      INITIAL_FOLLOW_STATE
    );
  });
});

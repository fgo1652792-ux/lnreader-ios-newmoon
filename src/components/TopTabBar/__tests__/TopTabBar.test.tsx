import './mocks';
import { Animated, I18nManager } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { NavigationState, Route } from 'react-native-tab-view';
import TopTabBar, {
  getFocusedTabState,
  isRouteFocused,
} from '../TopTabBar';

type TestRoute = Route & { title?: string };

const makeState = (
  index: number,
  keys: string[],
): NavigationState<TestRoute> => ({
  index,
  routes: keys.map(key => ({ key, title: `Title ${key}` })),
});

const renderTabBar = (state: NavigationState<TestRoute>) => {
  const jumpTo = jest.fn();
  const position = new Animated.Value(
    state.index,
  ) as unknown as Animated.AnimatedInterpolation<number>;

  const props = {
    navigationState: state,
    jumpTo,
    position,
    layout: { width: 320, height: 48 },
  };

  const utils = render(<TopTabBar<TestRoute> {...props} />);
  return { jumpTo, rerender: (next: NavigationState<TestRoute>) => {
    utils.rerender(
      <TopTabBar<TestRoute> {...props} navigationState={next} />,
    );
  } };
};

describe('getFocusedTabState / isRouteFocused', () => {
  it('focuses exactly one of two tabs at start and end', () => {
    const stateAtStart = makeState(0, ['sources', 'plugins']);
    expect(getFocusedTabState(stateAtStart)).toEqual({
      sources: true,
      plugins: false,
    });
    expect(isRouteFocused(stateAtStart, 'sources')).toBe(true);
    expect(isRouteFocused(stateAtStart, 'plugins')).toBe(false);

    const stateAtEnd = makeState(1, ['sources', 'plugins']);
    expect(getFocusedTabState(stateAtEnd)).toEqual({
      sources: false,
      plugins: true,
    });
    expect(isRouteFocused(stateAtEnd, 'plugins')).toBe(true);
    expect(isRouteFocused(stateAtEnd, 'sources')).toBe(false);
  });

  it('focuses exactly one of five tabs at start, middle and end', () => {
    const keys = ['a', 'b', 'c', 'd', 'e'];

    for (const index of [0, 2, 4]) {
      const state = makeState(index, keys);
      const focusMap = getFocusedTabState(state);
      expect(Object.values(focusMap).filter(Boolean)).toHaveLength(1);
      expect(focusMap[keys[index]]).toBe(true);
      keys
        .filter(key => key !== keys[index])
        .forEach(key => expect(focusMap[key]).toBe(false));

      expect(isRouteFocused(state, keys[index])).toBe(true);
      expect(isRouteFocused(state, keys[0])).toBe(index === 0);
      expect(isRouteFocused(state, keys[keys.length - 1])).toBe(
        index === keys.length - 1,
      );
    }
  });

  it('focuses nothing when the index is out of range', () => {
    const stateAtNegative = makeState(-1, ['a', 'b']);
    expect(getFocusedTabState(stateAtNegative)).toEqual({
      a: false,
      b: false,
    });
    expect(isRouteFocused(stateAtNegative, 'a')).toBe(false);

    const stateBeyondEnd = makeState(2, ['a', 'b']);
    expect(getFocusedTabState(stateBeyondEnd)).toEqual({ a: false, b: false });
    expect(isRouteFocused(stateBeyondEnd, 'b')).toBe(false);
  });

  it('maps by route key, never by visual position or the RTL flag', () => {
    const state = makeState(1, ['a', 'b', 'c']);

    const getConstantsSpy = jest.spyOn(I18nManager, 'getConstants');

    // The helper output must not depend on the RTL flag at all: same state in,
    // same key-based mapping out, with RTL on or off.
    getConstantsSpy.mockReturnValue({
      isRTL: true,
      doLeftAndRightSwapInRTL: true,
    });
    const focusMapInRTL = getFocusedTabState(state);

    getConstantsSpy.mockReturnValue({
      isRTL: false,
      doLeftAndRightSwapInRTL: true,
    });
    const focusMapInLTR = getFocusedTabState(state);

    expect(focusMapInRTL).toEqual(focusMapInLTR);
    expect(focusMapInRTL).toEqual({ a: false, b: true, c: false });
    expect(isRouteFocused(state, 'b')).toBe(true);
    expect(isRouteFocused(state, 'x')).toBe(false);

    // Pure function: it never consults the platform RTL flag.
    expect(getConstantsSpy).not.toHaveBeenCalled();
  });
});

describe('TopTabBar', () => {
  it('renders one underline per tab, exposed to a11y only while focused', () => {
    renderTabBar(makeState(0, ['sources', 'plugins']));

    const sourcesIndicator = screen.getByTestId('tab-indicator-sources');
    const pluginsIndicator = screen.getByTestId('tab-indicator-plugins');

    expect(sourcesIndicator).toBeTruthy();
    expect(pluginsIndicator).toBeTruthy();
    // State truth: the focused tab's underline is the only one exposed to the
    // accessibility tree (this is what the XCUITest regression asserts).
    expect(sourcesIndicator.props.accessible).toBe(true);
    expect(pluginsIndicator.props.accessible).toBe(false);
  });

  it('moves the underline when navigationState.index changes', () => {
    const { rerender } = renderTabBar(makeState(0, ['sources', 'plugins']));

    expect(
      screen.getByTestId('tab-indicator-sources').props.accessible,
    ).toBe(true);

    rerender(makeState(1, ['sources', 'plugins']));

    expect(
      screen.getByTestId('tab-indicator-sources').props.accessible,
    ).toBe(false);
    expect(
      screen.getByTestId('tab-indicator-plugins').props.accessible,
    ).toBe(true);
  });

  it('routes tab presses through jumpTo by route key', () => {
    const { jumpTo } = renderTabBar(makeState(0, ['sources', 'plugins']));

    // tab-view stacks the inactive and active label copies; press either —
    // the handler lives on the shared tab pressable.
    fireEvent.press(screen.getAllByText('Title plugins')[0]);
    expect(jumpTo).toHaveBeenCalledWith('plugins');
  });
});

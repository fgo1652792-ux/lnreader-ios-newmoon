import { useEffect, useMemo } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  useAnimatedValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  TabBar,
  TabBarItem,
  type NavigationState,
  type Route,
  type TabBarItemProps,
  type TabBarProps,
} from 'react-native-tab-view';
import { useTheme } from '@hooks/persisted';

/**
 * Focus helpers — pure, direction-agnostic, state-truth-driven.
 *
 * Focus is derived exclusively from `navigationState` (route keys + index),
 * never from the pager's animated `position`. On iOS, react-native-pager-view
 * 8.x emits raw (non-RTL-compensated) content offsets, so the animated
 * position can rest on negative values in RTL locales; anything interpolated
 * from it (the stock TabBarIndicator) desyncs from the visible page. Route
 * keys, by contrast, are stable in both directions.
 */
export const isRouteFocused = <T extends Route>(
  navigationState: NavigationState<T>,
  routeKey: string,
): boolean => navigationState.routes[navigationState.index]?.key === routeKey;

export const getFocusedTabState = <T extends Route>(
  navigationState: NavigationState<T>,
): Record<string, boolean> => {
  const focusedRouteKey = navigationState.routes[navigationState.index]?.key;

  return Object.fromEntries(
    navigationState.routes.map(route => [route.key, route.key === focusedRouteKey]),
  );
};

const FOCUS_ANIMATION_DURATION = 150;

interface TabUnderlineProps {
  focused: boolean;
  routeKey: string;
  routeTitle?: string;
  style: StyleProp<ViewStyle>;
}

/**
 * The underline lives INSIDE its tab element, so Yoga's RTL mirroring places
 * it correctly by construction — it is physically impossible for it to desync
 * from the tab it belongs to, regardless of scroll position, gaps or
 * scrollable tab bars. `testID` is applied as the accessibility identifier on
 * iOS (what XCUITest's `element(withIdentifier:)` matches). The underline is
 * only exposed to the accessibility tree while focused, so exactly one
 * "tab-indicator-*" element exists at any time.
 */
const TabUnderline = ({ focused, routeKey, routeTitle, style }: TabUnderlineProps) => {
  // 0 = unfocused (hidden), 1 = focused (fully visible).
  const focusProgress = useAnimatedValue(focused ? 1 : 0);

  useEffect(() => {
    Animated.timing(focusProgress, {
      toValue: focused ? 1 : 0,
      duration: FOCUS_ANIMATION_DURATION,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [focusProgress, focused]);

  const scaleY = focusProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  });

  return (
    <Animated.View
      testID={`tab-indicator-${routeKey}`}
      accessible={focused}
      accessibilityLabel={routeTitle ?? routeKey}
      pointerEvents="none"
      style={[
        styles.underline,
        style,
        { opacity: focusProgress, transform: [{ scaleY }] },
      ]}
    />
  );
};

type FocusedTabItemProps<T extends Route> = TabBarItemProps<T> & {
  underlineStyle: StyleProp<ViewStyle>;
};

/**
 * Wraps tab-view's default `TabBarItem` and overlays the focus-driven
 * underline on top of it. All tab-view props (label, icon, press handling,
 * tab style, measured widths, …) pass through untouched.
 */
const FocusedTabItem = <T extends Route>({
  navigationState,
  route,
  underlineStyle,
  ...tabBarItemProps
}: FocusedTabItemProps<T>) => {
  const focused = isRouteFocused(navigationState, route.key);

  return (
    <View
      style={styles.tabItemWrapper}
      // Deterministic XCUITest handle ONLY. No accessibilityLabel here: an
      // AX label on this wrapper aggregates the inner TabBarItem button and
      // turns the tab into a non-hittable "Other" element (regression seen
      // in the RTL tap test). testID does not affect the AX tree.
      testID={`tab-item-${route.key}`}
    >
      <TabBarItem
        {...tabBarItemProps}
        navigationState={navigationState}
        route={route}
      />
      <TabUnderline
        focused={focused}
        routeKey={route.key}
        routeTitle={route.title}
        style={underlineStyle}
      />
    </View>
  );
};

/**
 * Thin wrapper over react-native-tab-view's `TabBar` with a deterministic,
 * RTL-proof indicator.
 *
 * `indicatorStyle` is REINTERPRETED: instead of styling the (removed)
 * position-driven TabBarIndicator overlay, it styles the per-tab underline
 * rendered inside each tab item (defaults to the theme primary color).
 */
const TopTabBar = <T extends Route>({
  indicatorStyle,
  ...props
}: TabBarProps<T>) => {
  const theme = useTheme();

  const underlineStyle = useMemo<StyleProp<ViewStyle>>(
    () => [styles.underline, { backgroundColor: theme.primary }, indicatorStyle],
    [indicatorStyle, theme.primary],
  );

  return (
    <TabBar
      {...props}
      // The stock TabBarIndicator interpolates the pager's animated `position`
      // and clamps it — in RTL on iOS the pager emits negative offsets, so the
      // indicator lands under the wrong tab. It is fully removed here; focus
      // indication is rendered per-tab by FocusedTabItem instead.
      renderIndicator={() => null}
      renderTabBarItem={({ key: itemKey, ...itemProps }) => (
        <FocusedTabItem
          key={itemKey}
          {...itemProps}
          underlineStyle={underlineStyle}
        />
      )}
    />
  );
};

const styles = StyleSheet.create({
  // Empty on purpose: the wrapper must not change how tab-view sizes the tab
  // (fixed width, measured 'auto' width, flex and gaps all keep working). It
  // only exists to host the absolutely-positioned underline.
  tabItemWrapper: {},
  underline: {
    position: 'absolute',
    bottom: 0,
    // Centering is direction-agnostic: correct in LTR and RTL alike.
    alignSelf: 'center',
    width: '60%',
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    backgroundColor: 'transparent',
  },
});

export default TopTabBar;

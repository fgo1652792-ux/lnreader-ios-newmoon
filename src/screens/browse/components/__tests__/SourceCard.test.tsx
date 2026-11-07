import { fireEvent, render, screen } from '@testing-library/react-native';

import { PluginItem } from '@plugins/types';
import { ThemeColors } from '@theme/types';

import SourceCard from '../SourceCard';

jest.mock('@i18n/translations', () => ({
  getString: (key: string) => key,
}));

jest.mock('@components', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text } =
    jest.requireActual<typeof import('react-native')>('react-native');

  return {
    IconButtonV2: ({
      accessibilityLabel,
      disabled,
      onPress,
    }: {
      accessibilityLabel?: string;
      disabled?: boolean;
      onPress?: () => void;
    }) =>
      ReactModule.createElement(
        Pressable,
        {
          accessibilityLabel,
          accessibilityRole: 'button',
          disabled,
          onPress,
        },
        ReactModule.createElement(Text, null, accessibilityLabel),
      ),
  };
});

const theme = {
  onSurface: '#1d1b20',
  onSurfaceVariant: '#49454f',
  outlineVariant: '#cac4d0',
  primary: '#6750a4',
  rippleColor: 'rgba(0, 0, 0, 0.1)',
  surface: '#fffbfe',
  surfaceContainerLow: '#f7f2fa',
  surfaceVariant: '#e7e0ec',
} as ThemeColors;

const plugin: PluginItem = {
  hasUpdate: false,
  iconUrl: 'https://example.com/icon.png',
  id: 'novelbin',
  lang: 'English',
  name: 'NovelBin',
  site: 'https://novelbin.com',
  url: 'https://raw.githubusercontent.com/novelbin.js',
  version: '1.0.0',
};

const renderCard = ({
  domain = 'novelbin.com',
  isPinned = false,
  onLatestPress = jest.fn(),
  onPinPress = jest.fn(),
  onPress = jest.fn(),
}: {
  domain?: string | null;
  isPinned?: boolean;
  onLatestPress?: jest.Mock;
  onPinPress?: jest.Mock;
  onPress?: jest.Mock;
} = {}) => {
  render(
    <SourceCard
      domain={domain}
      isPinned={isPinned}
      onLatestPress={onLatestPress}
      onPinPress={onPinPress}
      onPress={onPress}
      plugin={plugin}
      theme={theme}
    />,
  );

  return { onLatestPress, onPinPress, onPress };
};

describe('SourceCard', () => {
  it('renders the source name and its domain instead of the language', () => {
    renderCard({});

    expect(screen.getByText('NovelBin')).toBeTruthy();
    expect(screen.getByText('novelbin.com')).toBeTruthy();
    expect(screen.queryByText('English')).toBeNull();
  });

  it('renders no second line when the domain is unavailable', () => {
    renderCard({ domain: null });

    expect(screen.getByText('NovelBin')).toBeTruthy();
    expect(screen.queryByText('novelbin.com')).toBeNull();
  });

  it('opens the source when the card body is pressed', () => {
    const { onPress } = renderCard({});

    fireEvent.press(screen.getByRole('button', { name: 'browse NovelBin' }));

    expect(onPress).toHaveBeenCalledWith(plugin);
  });

  it('opens latest novels from the pill and toggles the pin', () => {
    const { onLatestPress, onPinPress } = renderCard({});

    fireEvent.press(
      screen.getByRole('button', { name: 'browseScreen.latest NovelBin' }),
    );
    expect(onLatestPress).toHaveBeenCalledWith(plugin);

    fireEvent.press(
      screen.getByRole('button', { name: 'browseScreen.pinSource' }),
    );
    expect(onPinPress).toHaveBeenCalledWith(plugin);
  });

  it('labels the pin button as unpin when the source is pinned', () => {
    renderCard({ isPinned: true });

    expect(
      screen.getByRole('button', {
        name: 'browseScreen.unpinSource',
      }),
    ).toBeTruthy();
  });
});

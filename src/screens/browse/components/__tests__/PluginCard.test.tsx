import { fireEvent, render, screen } from '@testing-library/react-native';

import { PluginItem } from '@plugins/types';
import { ThemeColors } from '@theme/types';

import PluginCard from '../PluginCard';

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
  hasUpdate: true,
  iconUrl: 'https://example.com/icon.png',
  id: 'novelupdates',
  lang: 'English',
  name: 'NovelUpdates',
  site: 'https://novelupdates.com',
  url: 'https://raw.githubusercontent.com/novelupdates.js',
  version: '1.2.0',
};

const renderCard = (
  status: 'available' | 'installed' | 'update',
  overrides: {
    disabled?: boolean;
    onInstall?: jest.Mock;
    onOpenDetails?: jest.Mock;
    onOpenWebsite?: jest.Mock;
    onUpdate?: jest.Mock;
  } = {},
) => {
  const onInstall = overrides.onInstall ?? jest.fn();
  const onOpenDetails = overrides.onOpenDetails ?? jest.fn();
  const onOpenWebsite = overrides.onOpenWebsite ?? jest.fn();
  const onUpdate = overrides.onUpdate ?? jest.fn();

  render(
    <PluginCard
      disabled={overrides.disabled ?? false}
      onInstall={onInstall}
      onOpenDetails={onOpenDetails}
      onOpenWebsite={onOpenWebsite}
      onUpdate={onUpdate}
      plugin={plugin}
      status={status}
      theme={theme}
    />,
  );

  return { onInstall, onOpenDetails, onOpenWebsite, onUpdate };
};

describe('PluginCard', () => {
  it('shows the language and version line for every status', () => {
    renderCard('available');

    expect(screen.getByText('NovelUpdates')).toBeTruthy();
    expect(screen.getByText('English · 1.2.0')).toBeTruthy();
  });

  it('offers website and install actions for an available plugin', () => {
    const { onInstall, onOpenWebsite } = renderCard('available');

    fireEvent.press(
      screen.getByRole('button', {
        name: 'browseScreen.openWebsite',
      }),
    );
    expect(onOpenWebsite).toHaveBeenCalledWith(plugin);

    fireEvent.press(
      screen.getByRole('button', {
        name: 'browseScreen.installPlugin',
      }),
    );
    expect(onInstall).toHaveBeenCalledWith(plugin);
  });

  it('ignores install presses while the plugin is pending', () => {
    const { onInstall } = renderCard('available', { disabled: true });

    fireEvent.press(
      screen.getByRole('button', {
        name: 'browseScreen.installPlugin',
      }),
    );

    expect(onInstall).not.toHaveBeenCalled();
  });

  it('opens details from the card body or the settings button when installed', () => {
    const { onOpenDetails } = renderCard('installed');

    expect(
      screen.queryByRole('button', {
        name: 'browseScreen.installPlugin',
      }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: 'browseScreen.updatePlugin',
      }),
    ).toBeNull();

    fireEvent.press(
      screen.getByRole('button', {
        name: 'browseScreen.openPluginDetails',
      }),
    );
    fireEvent.press(
      screen.getByRole('button', {
        name: 'browseScreen.openPluginSettings',
      }),
    );

    expect(onOpenDetails).toHaveBeenCalledTimes(2);
    expect(onOpenDetails).toHaveBeenCalledWith(plugin);
  });

  it('routes the download action to the update handler when an update is pending', () => {
    const { onInstall, onUpdate } = renderCard('update');

    fireEvent.press(
      screen.getByRole('button', {
        name: 'browseScreen.updatePlugin',
      }),
    );

    expect(onUpdate).toHaveBeenCalledWith(plugin);
    expect(onInstall).not.toHaveBeenCalled();
  });
});

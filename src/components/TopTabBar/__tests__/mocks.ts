const mockTheme = { primary: '#6200ee', surface: '#f5f5f5' };

jest.mock('@hooks/persisted', () => ({
  useTheme: () => mockTheme,
}));

export {};

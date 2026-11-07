import { getBrowseColumns } from '../browseLayout';

describe('getBrowseColumns', () => {
  it('uses a single column on narrow screens', () => {
    expect(getBrowseColumns(375)).toBe(1);
    expect(getBrowseColumns(767)).toBe(1);
  });

  it('uses two columns on wide screens (iPad)', () => {
    expect(getBrowseColumns(768)).toBe(2);
    expect(getBrowseColumns(1024)).toBe(2);
  });
});

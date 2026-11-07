import { ChapterScreenProps } from '@navigators/types';
import NewMoonReaderScreen from './newmoon/NewMoonReaderScreen';

/**
 * Reader engine: New Moon is THE engine (P0 settings-unification decision —
 * New Moon is the only visible engine, the settings screen edits the New Moon
 * store directly and previews the real worShell engine).
 *
 * The classic LNReader reader (ChapterContextProvider + WebViewReader +
 * ReaderDrawerLayout) is removed from the render path; it remains available
 * through Git history as the rollback path. No engine switch UI exists.
 */
const Chapter = ({ route }: ChapterScreenProps) => {
  return <NewMoonReaderScreen route={route} />;
};

export default Chapter;

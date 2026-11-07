import { getMMKVObject } from '@utils/mmkv/mmkv';
import { BACKGROUND_TASKS_STORE_KEY } from '@services/backgroundTasks/constants';
import type { QueuedBackgroundTask } from '@services/backgroundTasks/contracts';

/**
 * Read-only view over the persisted background-task queue (MMKV), used by the
 * storage service to refuse deletions while they would race with running
 * work. The queue store is the same snapshot the TaskQueue screen renders.
 */

const ACTIVE_STATES = new Set(['queued', 'running', 'paused']);

const isActive = (task: QueuedBackgroundTask): boolean =>
  ACTIVE_STATES.has(task.state ?? 'queued');

export const getActiveBackgroundTasks = (): QueuedBackgroundTask[] =>
  (
    getMMKVObject<QueuedBackgroundTask[]>(BACKGROUND_TASKS_STORE_KEY) ?? []
  ).filter(isActive);

/** Novel ids that currently have queued/running/paused download tasks. */
export const getActiveDownloadNovelIds = (): Set<number> => {
  const ids = new Set<number>();
  for (const queued of getActiveBackgroundTasks()) {
    if (queued.task?.name !== 'DOWNLOAD_CHAPTER') {
      continue;
    }
    const { novelId, chapters } = queued.task.data;
    if (typeof novelId === 'number') {
      ids.add(novelId);
    }
    for (const chapter of chapters ?? []) {
      if (typeof chapter.novelId === 'number') {
        ids.add(chapter.novelId);
      }
    }
  }
  return ids;
};

/** true while any backup/restore (local, Drive, self-host) task is active. */
export const isBackupInProgress = (): boolean =>
  getActiveBackgroundTasks().some(
    queued =>
      queued.task?.name.startsWith('LOCAL_') ||
      queued.task?.name.startsWith('DRIVE_') ||
      queued.task?.name.startsWith('SELF_HOST_'),
  );

/** true while any background task at all is active (used for the temp dir). */
export const isAnyTaskActive = (): boolean =>
  getActiveBackgroundTasks().length > 0;

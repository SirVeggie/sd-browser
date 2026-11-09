import { TaskManager } from "$lib/tools/task";

/**
 * Deferred sharp encodes (grid thumbnails). Kept well below UV_THREADPOOL_SIZE (16 in the
 * npm scripts) so file reads and full-view encodes always find a free libuv thread.
 */
export const backgroundTasks = new TaskManager<any>(6, 10);

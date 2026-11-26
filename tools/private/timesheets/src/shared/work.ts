// Safe in the browser: no SDK here.
// What time is spent on, as one value of the pickers: "projectId" or
// "projectId:taskId".
export type Work = { projectId: string; taskId: string | null };

export const workValue = (w: Work | null): string => (w ? (w.taskId ? `${w.projectId}:${w.taskId}` : w.projectId) : "");

export function readWork(value: string): Work | null {
  const [projectId, taskId] = value.split(":");
  return projectId ? { projectId, taskId: taskId || null } : null;
}

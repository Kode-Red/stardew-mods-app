/**
 * Mod folder naming conventions.
 *
 * SMAPI ignores any folder in `Mods/` whose name starts with a dot, so the
 * common way to disable a mod without deleting it is to prefix its folder with
 * `.`. These helpers are pure so they can be unit-tested and shared between the
 * scanner (main process) and the UI.
 */

/** True when a folder name marks the mod as disabled (SMAPI ignores it). */
export function isDisabledFolderName(name: string): boolean {
  return name.startsWith(".");
}

/** The folder name that disables a mod (adds a leading dot if absent). */
export function toDisabledFolderName(name: string): string {
  return isDisabledFolderName(name) ? name : `.${name}`;
}

/** The folder name that enables a mod (strips any leading dots). */
export function toEnabledFolderName(name: string): string {
  return name.replace(/^\.+/, "");
}

/** The name shown to the user, regardless of enabled/disabled state. */
export function displayFolderName(name: string): string {
  return toEnabledFolderName(name);
}

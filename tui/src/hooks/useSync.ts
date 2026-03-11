import { useCallback, useRef } from "react";
import {
  listEntries,
  getConfig,
  syncPushEntries,
  syncPullAsync,
  syncPushAll,
  syncPushEntriesGDrive,
  syncPullAsyncGDrive,
  syncPushAllGDrive,
  rebuildIndex,
} from "../silt";
import { useApp } from "../context";
import { SPINNER } from "../theme";

export function hasDropbox(): boolean {
  const token = getConfig("dropbox_token");
  return token !== null && token !== "";
}

export function hasGDrive(): boolean {
  const token = getConfig("google_drive_token");
  return token !== null && token !== "";
}

export function hasAnySyncProvider(): boolean {
  return hasDropbox() || hasGDrive();
}

export function useSync() {
  const { actions, refs } = useApp();
  const { setStatus, setEntries } = actions;
  const { spinnerRef, spinnerFrameRef } = refs;

  const startSync = useCallback(
    (
      label: string,
      promise: Promise<number>,
      onDone?: (count: number) => void,
    ) => {
      spinnerFrameRef.current = 0;
      setStatus(`${SPINNER[0]} ${label}`);
      spinnerRef.current = setInterval(() => {
        spinnerFrameRef.current =
          (spinnerFrameRef.current + 1) % SPINNER.length;
        setStatus(`${SPINNER[spinnerFrameRef.current]} ${label}`);
      }, 80);

      promise
        .then((count) => {
          if (spinnerRef.current) clearInterval(spinnerRef.current);
          spinnerRef.current = null;
          onDone?.(count);
        })
        .catch(() => {
          if (spinnerRef.current) clearInterval(spinnerRef.current);
          spinnerRef.current = null;
          setStatus("Sync failed.");
        });
    },
    [setStatus, spinnerRef, spinnerFrameRef],
  );

  const pushToAll = useCallback(
    (ids: string[], onDone?: () => void) => {
      const promises: Promise<number>[] = [];
      if (hasDropbox()) promises.push(syncPushEntries(ids));
      if (hasGDrive()) promises.push(syncPushEntriesGDrive(ids));
      if (promises.length === 0) {
        onDone?.();
        return;
      }
      startSync(
        "Syncing...",
        Promise.all(promises).then((counts) =>
          counts.reduce((a, b) => a + b, 0),
        ),
        onDone,
      );
    },
    [startSync],
  );

  const pushAllToAll = useCallback(
    (onDone?: (count: number) => void) => {
      const promises: Promise<number>[] = [];
      if (hasDropbox()) promises.push(syncPushAll());
      if (hasGDrive()) promises.push(syncPushAllGDrive());
      if (promises.length === 0) return;
      startSync(
        "Pushing all entries...",
        Promise.all(promises).then((counts) =>
          counts.reduce((a, b) => a + b, 0),
        ),
        onDone,
      );
    },
    [startSync],
  );

  const pullFromAll = useCallback(
    (onDone?: (count: number) => void) => {
      const promises: Promise<number>[] = [];
      if (hasDropbox()) promises.push(syncPullAsync());
      if (hasGDrive()) promises.push(syncPullAsyncGDrive());
      if (promises.length === 0) return;
      startSync(
        "Pulling...",
        Promise.all(promises).then((counts) =>
          counts.reduce((a, b) => a + b, 0),
        ),
        (count) => {
          if (count > 0) {
            rebuildIndex();
            setEntries(listEntries());
          }
          onDone?.(count);
        },
      );
    },
    [startSync, setEntries],
  );

  return { startSync, pushToAll, pushAllToAll, pullFromAll };
}

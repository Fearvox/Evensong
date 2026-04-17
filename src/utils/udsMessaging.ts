// Stub for the UDS (unix-domain-socket) inbox. Real implementation was
// stripped during decompilation; this stub only needs to satisfy the call
// sites reachable when feature('UDS_INBOX') is TRUE. Prior stub was missing
// setOnEnqueue + getUdsMessagingSocketPath — callers did
// require('...').setOnEnqueue(...) and hit "undefined is not a function",
// which threw synchronously from runHeadlessStreaming. The parent
// `void runHeadless(...)` swallowed the rejection, leaving pipe/-p mode to
// hang until idle timeout. All four exports here are noops.
export const startUdsMessaging: (socketPath: string, options: { isExplicit: boolean }) => Promise<void> = async () => {};
export const getDefaultUdsSocketPath: () => string = () => '';
export const setOnEnqueue: (callback: () => void) => void = () => {};
export const getUdsMessagingSocketPath: () => string | undefined = () => undefined;

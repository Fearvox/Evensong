import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dir, '..')

// Phase-10 silent-swallow class: decompiled files where a function is called
// but the corresponding import was stripped during decompilation. The
// reference resolves to undefined / throws ReferenceError, the error is
// swallowed by an async wrapper (void promise / for-await iterator / fire-
// and-forget dispatch), and the user sees a silent hang or vanished message.
//
// Two confirmed instances so far:
//   1. udsMessaging.ts missing setOnEnqueue + getUdsMessagingSocketPath
//      → pipe-mode hang (commit 45bf1ad)
//   2. processUserInput.ts missing logForDebugging
//      → REPL-mode hang on hook timeout (commit added by this test)
//
// This test guards against regression by asserting that any file calling a
// known "silent-swallow class" symbol also imports it. Add new symbols below
// as new instances are discovered.

type Guard =
  | { kind: 'caller'; file: string; symbol: string; origin: string }
  | { kind: 'producer'; file: string; symbol: string }

const guards: Guard[] = [
  // Caller side: processUserInput.ts must continue to import logForDebugging.
  // The hook-timeout path at L199/L207 calls it; without the import the call
  // throws ReferenceError, which gets swallowed by the for-await iterator's
  // Promise.race chain — REPL spinner vanishes, message disappears, no API
  // call is made. (This was the REPL silent-swallow bug.)
  {
    kind: 'caller',
    file: 'src/utils/processUserInput/processUserInput.ts',
    symbol: 'logForDebugging',
    origin: '../debug.js',
  },
  // Producer side: udsMessaging.ts must export these noops so consumers
  // (print.ts:setOnEnqueue, systemInit.ts:getUdsMessagingSocketPath) don't
  // hit "undefined is not a function" when feature('UDS_INBOX') is true.
  // (This was the pipe-mode silent-swallow bug, commit 45bf1ad.)
  {
    kind: 'producer',
    file: 'src/utils/udsMessaging.ts',
    symbol: 'setOnEnqueue',
  },
  {
    kind: 'producer',
    file: 'src/utils/udsMessaging.ts',
    symbol: 'getUdsMessagingSocketPath',
  },
]

describe('decompile-imports regression', () => {
  for (const g of guards) {
    if (g.kind === 'caller') {
      test(`${g.file}: imports ${g.symbol} (caller)`, () => {
        const src = readFileSync(join(ROOT, g.file), 'utf-8')
        // Must actually call it
        expect(src).toMatch(new RegExp(`\\b${g.symbol}\\s*\\(`))
        // And must import it from somewhere
        expect(src).toMatch(
          new RegExp(`import\\s*\\{[^}]*\\b${g.symbol}\\b[^}]*\\}`),
        )
      })
    } else {
      test(`${g.file}: exports ${g.symbol} (producer)`, () => {
        const src = readFileSync(join(ROOT, g.file), 'utf-8')
        expect(src).toMatch(
          new RegExp(`export\\s+(const|function|let|var)\\s+${g.symbol}\\b`),
        )
      })
    }
  }
})

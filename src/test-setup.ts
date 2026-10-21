import '@testing-library/jest-dom/vitest'

// Node 22+ ships its own `localStorage` global, which is undefined unless
// node runs with --localstorage-file, and it shadows jsdom's. Put jsdom's
// back so code that persists to localStorage (the OIDC session) is testable.
const dom = (globalThis as { jsdom?: { window: Window } }).jsdom
if (dom && typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: dom.window.localStorage,
  })
}

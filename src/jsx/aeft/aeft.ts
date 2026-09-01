// After Effects host layer.
//
// Thin wrappers around the AE DOM only - no calculations, no state, no
// business logic. Anything exported here is reachable from the panel as
// evalTS("name", args), because src/jsx/index.ts pulls this module in whole.
//
// Empty until step 02 ports analyzeDuplicates.

export {};

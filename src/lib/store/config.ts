// Public by default. Explicit false keeps the existing administrator preview.
// NEXT_PUBLIC overrides are fixed at build time for both header and server.
export const storeEnabled = () => process.env.NEXT_PUBLIC_STORE_ENABLED !== 'false';
export const STORE_ITEM_TYPE = 'STORE_BOOK';

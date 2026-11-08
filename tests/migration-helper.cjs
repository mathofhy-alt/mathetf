// Execute the exact production request boundaries, including indexes outside CORE.
exports.migrationRequests = sql => {
    const requests = [...sql.matchAll(/^-- REQUEST (CORE|INDEX_\d+)\r?\n([\s\S]*?)^-- END REQUEST \1\s*$/gm)];
    if (!requests.length) throw new Error('Missing migration request markers');
    return requests.map(([, name, query]) => ({ name, query }));
};
exports.applyMigration = async (db, sql) => {
    // Older prerequisite migrations have no explicit request markers.
    if (!sql.includes('-- END REQUEST CORE')) return db.exec(sql);
    for (const { query } of exports.migrationRequests(sql)) await db.exec(query);
};

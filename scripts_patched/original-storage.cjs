// Install this folder beside the production src/. Run drivers from the production ROOT.
async function privateOriginalStorage(sb) {
    const checked = await sb.storage.getBucket('hwpx-originals');
    if (checked.error || checked.data?.public !== false) throw Error('Apply migration A: hwpx-originals must be PRIVATE');
    const store = sb.storage.from('hwpx-originals');
    function key(value) {
        if (typeof value !== 'string' || !/^raw_uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(hml|hwpx)$/i.test(value)) throw Error('Invalid original key');
        return value;
    }
    return {
        upload: (path, bytes, options) => store.upload(key(path), bytes, options),
        download: path => store.download(key(path)),
    };
}
module.exports = { privateOriginalStorage };

// Only for payment-mobile.cjs: route provider lookups to the local fixture.
const original = global.fetch;
global.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://api.portone.io/payments/')) {
        return original(url.replace('https://api.portone.io', 'http://127.0.0.1:3133/portone'), init);
    }
    if (/^https?:/.test(url) && !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(url)) {
        throw Error('Payment fixture blocks external server traffic');
    }
    return original(input, init);
};

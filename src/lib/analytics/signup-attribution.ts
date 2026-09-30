export type SignupAttribution = {
    source: string;
    medium: string | null;
    campaign: string | null;
};

const clean = (value: unknown) =>
    typeof value === 'string' && /^[a-zA-Z0-9_\-.]{1,80}$/.test(value)
        ? value.toLowerCase()
        : null;

export function safeSignupAttribution(value: unknown): SignupAttribution | null {
    if (!value || typeof value !== 'object') return null;
    const data = value as Record<string, unknown>;
    const source = clean(data.source);
    if (!source) return null;
    return { source, medium: clean(data.medium), campaign: clean(data.campaign) };
}

export function getStoredSignupAttribution(): SignupAttribution | null {
    if (typeof window === 'undefined') return null;
    try {
        return safeSignupAttribution(JSON.parse(sessionStorage.getItem('mathetf_signup_attribution') || 'null'));
    } catch { return null; }
}

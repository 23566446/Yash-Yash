function tokenVersionOf(value) {
    const version = Number(value);
    return Number.isInteger(version) && version >= 0 ? version : 0;
}

function isTokenVersionCurrent(payload, user) {
    return tokenVersionOf(payload?.ver) === tokenVersionOf(user?.tokenVersion);
}

function sessionMetadata(payload) {
    const issuedAt = Number.isFinite(Number(payload?.iat)) ? new Date(Number(payload.iat) * 1000).toISOString() : null;
    const expiresAt = Number.isFinite(Number(payload?.exp)) ? new Date(Number(payload.exp) * 1000).toISOString() : null;
    return { issuedAt, expiresAt };
}

module.exports = { tokenVersionOf, isTokenVersionCurrent, sessionMetadata };

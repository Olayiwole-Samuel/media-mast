// Same rule as the backend (validators/auth.validator.js passwordRule):
// at least 8 characters with an uppercase letter, a lowercase letter, a
// number and a special character. The server still checks it.

export const PASSWORD_HINT =
    "At least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol.";

export const passwordProblem = (password) => {
    const value = password || "";
    if (value.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Z]/.test(value)) return "Password must contain at least one uppercase letter";
    if (!/[a-z]/.test(value)) return "Password must contain at least one lowercase letter";
    if (!/[0-9]/.test(value)) return "Password must contain at least one number";
    if (!/[^A-Za-z0-9]/.test(value)) return "Password must contain at least one special character";
    return null;
};

// Reads the one-time token from an emailed link (#token=… preferred,
// ?token=… accepted) and removes it from the address bar and history.
export const takeTokenFromUrl = () => {
    if (typeof window === "undefined") return "";
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    const token = hash.get("token") || query.get("token") || "";
    if (token) {
        window.history.replaceState(null, "", window.location.pathname);
    }
    return token.trim();
};

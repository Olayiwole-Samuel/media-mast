// A same-page signal that shared data changed (an approval decided, a
// notification handled), so the sidebar counter, the bell and open pages
// refresh at once instead of waiting for their next poll.
export const DATA_CHANGED = "mm-data-changed";

export const announceDataChanged = () => {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(DATA_CHANGED));
};

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, UserPlus, Crown, UserMinus, Loader2, X, Pencil } from "lucide-react";
import { getTeamMembers, inviteTeamMember, removeTeamMember, updateTeamMemberRole, getPermissionTemplates } from "@/lib/api";
import { useSession, isCompanyOwner } from "@/lib/auth";
import { PERMISSION_LABELS, HIDDEN_PERMISSIONS, TEMPLATE_LABELS, permissionLabel, permissionGroup } from "@/lib/permissions";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";

// Team (GET /company/team needs TEAM_VIEW). Inviting, editing and removing
// members is owner-only (requireCompanyOwner on the backend); those controls
// are only shown to the owner. ALL_ACCESS and the "Company Owner" position
// can't be given through this page (the backend rejects both too).
// Invites don't carry a password: the backend returns a one-time invitation
// code that the new member uses to choose their own password.

const OWNER_POSITION = "Company Owner";
const EMPTY_INVITE = { name: "", email: "", position: "", permissions: [] };

const inputClass =
    "w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

function PermissionPicker({ available, templates, value, onChange }) {
    const groups = useMemo(() => {
        const map = {};
        available.forEach((p) => {
            const g = permissionGroup(p);
            (map[g] = map[g] || []).push(p);
        });
        return Object.entries(map);
    }, [available]);

    const toggle = (p) => onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);

    return (
        <div className="space-y-3">
            {Object.keys(templates).length > 0 && (
                <div className="flex flex-wrap gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400">Start from:</span>
                    {Object.entries(templates).map(([key, perms]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onChange(perms.filter((p) => available.includes(p)))}
                            className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                            {TEMPLATE_LABELS[key] || key}
                        </button>
                    ))}
                    <button type="button" onClick={() => onChange([])} className="rounded-md px-2 py-0.5 text-xs text-slate-500 hover:underline">
                        Clear
                    </button>
                </div>
            )}
            <div className="max-h-56 space-y-3 overflow-y-auto rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                {groups.map(([group, perms]) => (
                    <fieldset key={group}>
                        <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group}</legend>
                        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                            {perms.map((p) => (
                                <label key={p} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                                    <input type="checkbox" checked={value.includes(p)} onChange={() => toggle(p)} className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500" />
                                    {permissionLabel(p)}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                ))}
            </div>
            <p className="text-xs text-slate-400">
                {value.length === 0 ? "No permissions selected: this person will be able to sign in but not see company data." : `${value.length} selected`}
            </p>
        </div>
    );
}

export default function CompanyTeamPage() {
    const { user } = useSession();
    const owner = isCompanyOwner(user);

    const [team, setTeam] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [catalog, setCatalog] = useState({ available: [], templates: {} });

    const [modal, setModal] = useState(null); // { mode: "invite" } | { mode: "edit", member }
    const [form, setForm] = useState(EMPTY_INVITE);
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState(null);

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            const result = await getTeamMembers();
            setTeam(result?.data || []);
        } catch (err) {
            setLoadError(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    // Permission catalogue for the owner's invite / edit form.
    useEffect(() => {
        if (!owner) return;
        let cancelled = false;
        getPermissionTemplates()
            .then((result) => {
                if (cancelled) return;
                const available = (result?.data?.allPermissions || []).filter((p) => !HIDDEN_PERMISSIONS.includes(p));
                const templates = Object.fromEntries(Object.entries(result?.data?.templates || {}).filter(([key]) => key !== "OWNER"));
                setCatalog({ available, templates });
            })
            .catch(() => {
                if (!cancelled) setCatalog({ available: Object.keys(PERMISSION_LABELS), templates: {} });
            });
        return () => {
            cancelled = true;
        };
    }, [owner]);

    const openInvite = () => {
        setForm(EMPTY_INVITE);
        setFormError("");
        setModal({ mode: "invite" });
    };

    const openEdit = (member) => {
        setForm({
            ...EMPTY_INVITE,
            position: member.position || "",
            permissions: (member.permissions || []).filter((p) => !HIDDEN_PERMISSIONS.includes(p)),
        });
        setFormError("");
        setModal({ mode: "edit", member });
    };

    const validatePosition = (position) => {
        if (position.trim().toLowerCase() === OWNER_POSITION.toLowerCase()) {
            return "There can only be one company owner, so that position can't be given to a team member.";
        }
        return "";
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError("");

        const positionProblem = validatePosition(form.position);
        if (positionProblem) return setFormError(positionProblem);

        const permissions = form.permissions.filter((p) => !HIDDEN_PERMISSIONS.includes(p));

        setSaving(true);
        try {
            if (modal.mode === "invite") {
                const payload = {
                    name: form.name.trim(),
                    email: form.email.trim(),
                    permissions,
                };
                // Leave position out when blank: the backend then uses "Team Member".
                if (form.position.trim()) payload.position = form.position.trim();

                const result = await inviteTeamMember(payload);
                const invitation = result?.data?.invitation;
                setNotice({
                    type: "success",
                    text: `${payload.name} has been invited. Share this one-time invitation code with them privately so they can choose their own password.`,
                    code: invitation?.token,
                    expiresAt: invitation?.expiresAt,
                });
            } else {
                const payload = { permissions };
                if (form.position.trim()) payload.position = form.position.trim();
                await updateTeamMemberRole(modal.member._id, payload);
                setNotice({ type: "success", text: "Team member updated." });
            }
            setModal(null);
            await load();
        } catch (err) {
            setFormError(err?.status === 403 ? "Only the company owner can manage the team." : err?.message || "Something went wrong. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async (member) => {
        if (!window.confirm(`Remove ${member.userId?.name || "this person"} from your team? They will lose access straight away.`)) return;
        setBusyId(member._id);
        setNotice(null);
        try {
            await removeTeamMember(member._id);
            setNotice({ type: "success", text: "Team member removed." });
            await load();
        } catch (err) {
            setNotice({ type: "error", text: err?.status === 403 ? "Only the company owner can remove team members." : err?.message || "We couldn't remove this team member." });
        } finally {
            setBusyId(null);
        }
    };

    const canManage = (member) => owner && member.position !== OWNER_POSITION && String(member.userId?._id) !== String(user?.id);

    if (loading) return <PageLoading label="Loading your team…" />;

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                        <Users className="h-6 w-6 text-emerald-500" />
                        Team
                    </h1>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">
                        {owner ? "Add people to your company and choose what each person can do." : "The people in your company."}
                    </p>
                </div>
                {owner && !loadError && (
                    <button type="button" onClick={openInvite} className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-emerald-500/20 hover:bg-emerald-600">
                        <UserPlus className="h-4 w-4" />
                        Add team member
                    </button>
                )}
            </motion.div>

            {notice && (
                <div
                    className={`mb-4 rounded-lg border p-3 text-sm ${
                        notice.type === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : "border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
                    }`}
                >
                    {notice.text}
                    {notice.code && (
                        <div className="mt-2">
                            <code className="block select-all break-all rounded bg-white px-2 py-1.5 font-mono text-xs text-slate-800 dark:bg-slate-900 dark:text-slate-200">{notice.code}</code>
                            {notice.expiresAt && (
                                <span className="mt-1 block text-xs">Valid until {new Date(notice.expiresAt).toLocaleString("en-NG")}. It works once and won&apos;t be shown again.</span>
                            )}
                        </div>
                    )}
                </div>
            )}

            {loadError ? (
                <ApiErrorState error={loadError} what="your team" onRetry={load} />
            ) : team.length === 0 ? (
                <EmptyState icon={Users} title="No team members yet" message={owner ? "Add your first team member to get started." : undefined} />
            ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                        {team.map((member) => {
                            const isOwnerRow = member.position === OWNER_POSITION;
                            const perms = (member.permissions || []).filter((p) => p !== "ALL_ACCESS");
                            return (
                                <li key={member._id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-sm font-semibold text-white">
                                            {member.userId?.name?.charAt(0)?.toUpperCase() || "U"}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="flex items-center gap-2 truncate text-sm font-medium text-slate-900 dark:text-white">
                                                {member.userId?.name || "Unknown"}
                                                {isOwnerRow && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                                                        <Crown className="h-3 w-3" /> Owner
                                                    </span>
                                                )}
                                            </p>
                                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                                {member.userId?.email} · {member.position}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-400">
                                                {isOwnerRow ? "Full access" : perms.length ? perms.map(permissionLabel).join(", ") : "No permissions yet"}
                                            </p>
                                        </div>
                                    </div>

                                    {canManage(member) && (
                                        <div className="flex shrink-0 gap-2 self-end sm:self-auto">
                                            <button type="button" onClick={() => openEdit(member)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                                                <Pencil className="h-3.5 w-3.5" /> Edit access
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleRemove(member)}
                                                disabled={busyId === member._id}
                                                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10"
                                            >
                                                {busyId === member._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />} Remove
                                            </button>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            <AnimatePresence>
                {modal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => !saving && setModal(null)}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            onClick={(e) => e.stopPropagation()}
                            role="dialog"
                            aria-modal="true"
                            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
                        >
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                                    {modal.mode === "invite" ? "Add team member" : `Edit access for ${modal.member.userId?.name || "team member"}`}
                                </h3>
                                <button type="button" onClick={() => setModal(null)} disabled={saving} className="rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
                                    <X className="h-5 w-5 text-slate-500" />
                                </button>
                            </div>

                            {formError && (
                                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-4">
                                {modal.mode === "invite" && (
                                    <>
                                        <label className="block">
                                            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Full name</span>
                                            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} required />
                                        </label>
                                        <label className="block">
                                            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Email address</span>
                                            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} required />
                                        </label>
                                    </>
                                )}

                                <label className="block">
                                    <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Job title (optional)</span>
                                    <input type="text" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className={inputClass} placeholder="e.g. Campaign Manager" maxLength={80} />
                                </label>

                                {modal.mode === "invite" && (
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        You won&apos;t set a password for them. After you send the invite you&apos;ll get a one-time code; they use it to choose their own password.
                                    </p>
                                )}

                                <div>
                                    <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">What can they do?</p>
                                    <PermissionPicker available={catalog.available} templates={catalog.templates} value={form.permissions} onChange={(permissions) => setForm({ ...form, permissions })} />
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button type="button" onClick={() => setModal(null)} disabled={saving} className="flex-1 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-70">
                                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                                        {modal.mode === "invite" ? "Send invite" : "Save changes"}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

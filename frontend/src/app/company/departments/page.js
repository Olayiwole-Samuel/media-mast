"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Users, UserPlus, Edit, Trash2, Loader2, X, Check, Plus, Search, Crown, UserMinus, AlertTriangle } from "lucide-react";
import {
    getDepartments,
    getDepartment,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    assignDepartmentMember,
    getTeamMembers,
} from "@/lib/api";
import { useSession, isCompanyOwner } from "@/lib/auth";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";

// Departments. Reading needs TEAM_VIEW; creating, editing, deleting and
// assigning people is owner-only (requireCompanyOwner), so those controls are
// only shown to the owner. Members of a department come from
// GET /departments/:id — the team list does not include departmentId.

const EMPTY_FORM = { name: "", description: "", managerId: "" };

const inputClass =
    "w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

const friendly = (err, action) =>
    err?.status === 403 ? `Only the company owner can ${action}.` : err?.message || `We couldn't ${action}. Please try again.`;

function Modal({ open, onClose, busy, wide, children }) {
    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => !busy && onClose()}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 ${wide ? "max-w-2xl" : "max-w-md"}`}
                    >
                        {children}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

export default function CompanyDepartmentsPage() {
    const { user } = useSession();
    const owner = isCompanyOwner(user);

    const [departments, setDepartments] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);

    const [toDelete, setToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const [detail, setDetail] = useState(null); // department with .employees
    const [detailLoading, setDetailLoading] = useState(false);
    const [memberSearch, setMemberSearch] = useState("");
    const [assigning, setAssigning] = useState(null);

    const load = useCallback(async () => {
        setLoadError(null);
        try {
            const [deptRes, teamRes] = await Promise.all([getDepartments(), getTeamMembers().catch(() => ({ data: [] }))]);
            setDepartments(deptRes?.data || []);
            setEmployees((teamRes?.data || []).filter((e) => e.isActive));
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

    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return departments;
        return departments.filter((d) => d.name.toLowerCase().includes(q) || (d.description || "").toLowerCase().includes(q));
    }, [departments, searchQuery]);

    // ── Create / edit ──
    const openCreate = () => {
        setEditing(null);
        setForm(EMPTY_FORM);
        setFormError("");
        setFormOpen(true);
    };

    const openEdit = (dept) => {
        setEditing(dept);
        setForm({ name: dept.name, description: dept.description || "", managerId: dept.managerId?._id || "" });
        setFormError("");
        setFormOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setFormError("");
        if (!form.name.trim()) return setFormError("Please give the department a name.");

        const payload = {
            name: form.name.trim(),
            description: form.description.trim(),
            managerId: form.managerId || null,
        };

        setSaving(true);
        try {
            if (editing) {
                await updateDepartment(editing._id, payload);
                setNotice({ type: "success", text: "Department updated." });
            } else {
                await createDepartment(payload);
                setNotice({ type: "success", text: "Department created." });
            }
            setFormOpen(false);
            await load();
        } catch (err) {
            setFormError(friendly(err, editing ? "edit departments" : "create departments"));
        } finally {
            setSaving(false);
        }
    };

    // ── Delete ──
    const handleDelete = async () => {
        setDeleting(true);
        try {
            await deleteDepartment(toDelete._id);
            setNotice({ type: "success", text: "Department deleted." });
            setToDelete(null);
            await load();
        } catch (err) {
            setNotice({ type: "error", text: friendly(err, "delete departments") });
            setToDelete(null);
        } finally {
            setDeleting(false);
        }
    };

    // ── Members ──
    const openDetail = async (dept) => {
        setMemberSearch("");
        setDetail({ ...dept, employees: null });
        setDetailLoading(true);
        try {
            const result = await getDepartment(dept._id);
            setDetail(result?.data || { ...dept, employees: [] });
        } catch (err) {
            setDetail(null);
            setNotice({ type: "error", text: err?.message || "We couldn't load this department." });
        } finally {
            setDetailLoading(false);
        }
    };

    const assign = async (employeeId, departmentId) => {
        setAssigning(employeeId);
        try {
            await assignDepartmentMember(employeeId, departmentId);
            await Promise.all([openDetail(detail), load()]);
        } catch (err) {
            setNotice({ type: "error", text: friendly(err, "change department members") });
        } finally {
            setAssigning(null);
        }
    };

    const memberIds = new Set((detail?.employees || []).map((e) => String(e._id)));
    const addable = employees.filter((emp) => {
        if (memberIds.has(String(emp._id))) return false;
        const q = memberSearch.trim().toLowerCase();
        return !q || emp.userId?.name?.toLowerCase().includes(q) || emp.userId?.email?.toLowerCase().includes(q);
    });

    if (loading) return <PageLoading label="Loading departments…" />;

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                        <Building2 className="h-6 w-6 text-emerald-500" />
                        Departments
                    </h1>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">Group your team into departments.</p>
                </div>
                {owner && !loadError && (
                    <button type="button" onClick={openCreate} className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-emerald-500/20 hover:bg-emerald-600">
                        <Plus className="h-4 w-4" /> New department
                    </button>
                )}
            </motion.div>

            {notice && (
                <div
                    className={`mb-4 flex items-center justify-between gap-3 rounded-lg border p-3 text-sm ${
                        notice.type === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : "border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
                    }`}
                >
                    <span>{notice.text}</span>
                    <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            {loadError ? (
                <ApiErrorState error={loadError} what="departments" onRetry={load} />
            ) : departments.length === 0 ? (
                <EmptyState
                    icon={Building2}
                    title="No departments yet"
                    message={owner ? "Create your first department to organise your team." : "Your company owner hasn't created any departments yet."}
                />
            ) : (
                <>
                    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                        {[
                            ["Departments", departments.length],
                            ["People in departments", departments.reduce((sum, d) => sum + (d.employeeCount || 0), 0)],
                            ["With a manager", departments.filter((d) => d.managerId).length],
                        ].map(([label, value]) => (
                            <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
                                <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
                            </div>
                        ))}
                    </div>

                    <label className="relative mb-6 block max-w-md">
                        <span className="sr-only">Search departments</span>
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            type="search"
                            placeholder="Search departments"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                    </label>

                    {filtered.length === 0 ? (
                        <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">No departments match your search.</p>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {filtered.map((dept) => (
                                <motion.div key={dept._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
                                    <div className="flex items-start justify-between gap-3">
                                        <button type="button" onClick={() => openDetail(dept)} className="min-w-0 flex-1 text-left">
                                            <h3 className="truncate text-lg font-semibold text-slate-900 dark:text-white">{dept.name}</h3>
                                            {dept.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{dept.description}</p>}
                                            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                                                <span className="flex items-center gap-1">
                                                    <Users className="h-4 w-4" /> {dept.employeeCount || 0} {dept.employeeCount === 1 ? "person" : "people"}
                                                </span>
                                                {dept.managerId && (
                                                    <span className="flex items-center gap-1">
                                                        <Crown className="h-4 w-4 text-amber-500" /> {dept.managerId.name}
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                        {owner && (
                                            <div className="flex shrink-0 items-center gap-1">
                                                <button type="button" onClick={() => openEdit(dept)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800" aria-label={`Edit ${dept.name}`}>
                                                    <Edit className="h-4 w-4" />
                                                </button>
                                                <button type="button" onClick={() => setToDelete(dept)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10" aria-label={`Delete ${dept.name}`}>
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Create / edit */}
            <Modal open={formOpen} onClose={() => setFormOpen(false)} busy={saving}>
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{editing ? "Edit department" : "New department"}</h3>
                    <button type="button" onClick={() => setFormOpen(false)} disabled={saving} className="rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
                        <X className="h-5 w-5 text-slate-500" />
                    </button>
                </div>
                {formError && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</p>}
                <form onSubmit={handleSave} className="space-y-4">
                    <label className="block">
                        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Name</span>
                        <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="e.g. Marketing" maxLength={50} required />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Description (optional)</span>
                        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} maxLength={200} className={`${inputClass} resize-none`} placeholder="What does this department do?" />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Manager (optional)</span>
                        <select value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })} className={inputClass}>
                            <option value="">No manager</option>
                            {employees.map((emp) => (
                                <option key={emp._id} value={emp.userId?._id}>
                                    {emp.userId?.name} ({emp.position})
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={() => setFormOpen(false)} disabled={saving} className="flex-1 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-70">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            {editing ? "Save changes" : "Create"}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Delete */}
            <Modal open={!!toDelete} onClose={() => setToDelete(null)} busy={deleting}>
                {toDelete && (
                    <>
                        <div className="mb-4 flex items-center gap-3">
                            <div className="rounded-full bg-red-100 p-2 dark:bg-red-500/20">
                                <AlertTriangle className="h-6 w-6 text-red-500" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Delete department?</h3>
                        </div>
                        <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">&quot;{toDelete.name}&quot; will be deleted.</p>
                        {toDelete.employeeCount > 0 && (
                            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                                {toDelete.employeeCount} {toDelete.employeeCount === 1 ? "person is" : "people are"} still in this department. Move them to another department first.
                            </p>
                        )}
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => setToDelete(null)} disabled={deleting} className="flex-1 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                                Go back
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={deleting || toDelete.employeeCount > 0}
                                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                Delete
                            </button>
                        </div>
                    </>
                )}
            </Modal>

            {/* Members */}
            <Modal open={!!detail} onClose={() => setDetail(null)} busy={!!assigning} wide>
                {detail && (
                    <>
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
                                <Building2 className="h-5 w-5 text-emerald-500" />
                                {detail.name}
                            </h3>
                            <button type="button" onClick={() => setDetail(null)} className="rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
                                <X className="h-5 w-5 text-slate-500" />
                            </button>
                        </div>

                        {detailLoading && !detail.employees ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                            </div>
                        ) : (
                            <>
                                <h4 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">People in this department ({detail.employees?.length || 0})</h4>
                                {detail.employees?.length ? (
                                    <div className="mb-6 space-y-2">
                                        {detail.employees.map((emp) => (
                                            <div key={emp._id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{emp.userId?.name}</p>
                                                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                                        {emp.position} · {emp.userId?.email}
                                                    </p>
                                                </div>
                                                {owner && (
                                                    <button
                                                        type="button"
                                                        onClick={() => assign(emp._id, null)}
                                                        disabled={!!assigning}
                                                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-500/10"
                                                        aria-label={`Remove ${emp.userId?.name} from this department`}
                                                    >
                                                        {assigning === emp._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="mb-6 text-sm text-slate-400">No one is in this department yet.</p>
                                )}

                                {owner && (
                                    <>
                                        <h4 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Add people</h4>
                                        <p className="mb-2 text-xs text-slate-400">Adding someone moves them from any department they are in now.</p>
                                        <input
                                            type="search"
                                            placeholder="Search your team"
                                            value={memberSearch}
                                            onChange={(e) => setMemberSearch(e.target.value)}
                                            className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                        />
                                        {addable.length === 0 ? (
                                            <p className="text-sm text-slate-400">No one else to add.</p>
                                        ) : (
                                            <div className="max-h-56 space-y-2 overflow-y-auto">
                                                {addable.map((emp) => (
                                                    <div key={emp._id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{emp.userId?.name}</p>
                                                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{emp.position}</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => assign(emp._id, detail._id)}
                                                            disabled={!!assigning}
                                                            className="rounded-lg p-1.5 text-emerald-500 hover:bg-emerald-50 disabled:opacity-50 dark:hover:bg-emerald-500/10"
                                                            aria-label={`Add ${emp.userId?.name} to this department`}
                                                        >
                                                            {assigning === emp._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </>
                )}
            </Modal>
        </div>
    );
}

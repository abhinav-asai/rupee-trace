"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";

const CATEGORIES = ["Home & bills", "Groceries", "Dining", "Travel", "Personal", "Savings"];
const SYMBOLS = ["⌂", "◈", "☕", "↗", "♡", "◎"];

type Subcategory = { id: string; name: string; parent: string; allocation: number };
type Expense = { subcategory?: string; id: string; amount: number; category: string; date: string };
type Activity = { id: string; date: string; description: string };
type Budget = { categories?: string[]; subcategories?: Subcategory[]; id?: string; activities?: Activity[]; deletedExpenses?: Expense[]; income: number; cycle: string; start: string; allocations: number[]; expenses: Expense[] };
// Store money as integer paise to keep arithmetic exact.
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: paise % 100 === 0 ? 0 : 2 }).format(paise / 100);
const amountInPaise = (value: FormDataEntryValue | null) => Math.round(Number(value) * 100);
const validMoney = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000_000;
function isBudget(value: Budget): boolean {
  return !!value && validMoney(value.income) && ["Monthly", "Salary cycle"].includes(value.cycle) && typeof value.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.start) && Array.isArray(value.allocations) && value.allocations.length === (value.categories ?? CATEGORIES).length && value.allocations.every(validMoney) && value.allocations.reduce((a, b) => a + b, 0) <= value.income && Array.isArray(value.expenses) && value.expenses.every(e => e && typeof e.id === "string" && validMoney(e.amount) && e.amount > 0 && (value.categories ?? CATEGORIES).includes(e.category) && (!e.subcategory || (value.subcategories ?? []).some(sub => sub.id === e.subcategory && sub.parent === e.category)) && typeof e.date === "string" && Number.isFinite(Date.parse(e.date)));
}

export type SavedData = { version: 2; current: Budget; archives: Budget[] };

const activity = (description: string): Activity => ({ id: crypto.randomUUID(), date: new Date().toISOString(), description });
function withActivity(budget: Budget, descriptions: string[]): Budget {
  return { ...budget, activities: [...descriptions.map(activity), ...(budget.activities ?? [])] };
}
export function validCycle(value: Budget): boolean {
  return !!value && (value.categories === undefined || (Array.isArray(value.categories) && value.categories.length > 0 && value.categories.every(n => typeof n === "string" && n.trim().length > 0) && new Set(value.categories.map(n => n.toLowerCase())).size === value.categories.length)) && (value.subcategories === undefined || (Array.isArray(value.subcategories) && value.subcategories.every(sub => sub && typeof sub.id === "string" && typeof sub.name === "string" && sub.name.trim().length > 0 && (value.categories ?? CATEGORIES).includes(sub.parent) && validMoney(sub.allocation)) && (value.categories ?? CATEGORIES).every((name, i) => value.subcategories!.filter(sub => sub.parent === name).reduce((sum, sub) => sum + sub.allocation, 0) <= value.allocations?.[i]))) && isBudget(value) && (value.activities === undefined || (Array.isArray(value.activities) && value.activities.every(a => a && typeof a.id === "string" && typeof a.description === "string" && Number.isFinite(Date.parse(a.date))))) && (value.deletedExpenses === undefined || (Array.isArray(value.deletedExpenses) && isBudget({ ...value, expenses: value.deletedExpenses })));
}

export default function BudgetDashboard({ initial, persist }: { initial: SavedData | null; persist: (data: SavedData) => Promise<void> }) {
  const [current, setCurrent] = useState<Budget | null>(initial?.current ?? null);
  const [archives, setArchives] = useState<Budget[]>(initial?.archives ?? []);
  const [selected, setSelected] = useState(-1);
  const [newCycle, setNewCycle] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const budget = selected === -1 ? current : archives[selected];
  const [editing, setEditing] = useState(false);
  const [draftCategories, setDraftCategories] = useState<string[]>(initial?.current.categories ?? CATEGORIES);
  const [draftSubs, setDraftSubs] = useState<Subcategory[]>(initial?.current.subcategories ?? []);
  const [draftAllocations, setDraftAllocations] = useState<number[]>(initial?.current.allocations ?? CATEGORIES.map(() => 0));
  const planning = !current || editing;
  const categories = planning ? draftCategories : budget?.categories ?? CATEGORIES;
  const subcategories = planning ? draftSubs : budget?.subcategories ?? [];
  const planForm = useRef<HTMLFormElement>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const errorRef = useRef<HTMLParagraphElement>(null);
  function fieldError(form: HTMLFormElement, name: string, message: string) {
    setFieldErrors({ [name]: message });
    requestAnimationFrame(() => {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLElement) { field.focus(); field.scrollIntoView({ block: "center", behavior: "smooth" }); }
    });
  }
  function fieldProps(name: string) {
    return { "aria-invalid": !!fieldErrors[name], "aria-describedby": fieldErrors[name] ? `error-${name}` : undefined };
  }
  function fieldMessage(name: string) {
    return fieldErrors[name] ? <span id={`error-${name}`} role="alert" className="mt-2 block text-sm text-red-700">{fieldErrors[name]}</span> : null;
  }
  function checkFields(form: HTMLFormElement) {
    setFieldErrors({});
    for (const field of Array.from(form.elements)) {
      if ((field instanceof HTMLInputElement || field instanceof HTMLSelectElement) && !field.validity.valid) {
        fieldError(form, field.name, field.validationMessage);
        return false;
      }
    }
    return true;
  }
  function beginPlan(isNew: boolean) {
    setDraftCategories(current?.categories ?? CATEGORIES);
    setDraftSubs(current?.subcategories ?? []);
    setDraftAllocations(current?.allocations ?? CATEGORIES.map(() => 0));
    setFieldErrors({}); setError(""); setNewCycle(isNew); setEditing(true); setNotice("");
  }
  const [expenseSubcategory, setExpenseSubcategory] = useState("");
  const [categoryParent, setCategoryParent] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const categoryDialog = useRef<HTMLDialogElement>(null);
  const readOnly = selected !== -1;
  const ready = true;
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expenseError, setExpenseError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);

  // Commit the complete budget and history together; keep the form intact on failure.
  async function save(next: Budget, nextArchives = archives) {
    if (saveLock.current) return false;
    saveLock.current = true;
    setSaving(true);
    try {
      await persist({ version: 2, current: next, archives: nextArchives });
      setCurrent(next);
      setArchives(nextArchives);
      setError("");
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not save. Please try again.";
      setError(message);
      if (dialog.current?.open) setExpenseError(message);
      else if (categoryDialog.current?.open) setCategoryError(message);
      else requestAnimationFrame(() => { errorRef.current?.focus(); errorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); });
      return false;
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!checkFields(form)) return;
    const data = new FormData(form);
    const income = amountInPaise(data.get("income"));
    const allocations = categories.map((_, i) => amountInPaise(data.get(`category-${i}`)));
    if (!validMoney(income) || income === 0 || !allocations.every(validMoney)) return fieldError(form, "income", "Enter a positive income and valid category amounts.");
    if (allocations.reduce((a, b) => a + b, 0) > income) return fieldError(form, `category-${Math.max(0, allocations.findIndex(value => value > 0))}`, "Your total allocations exceed your income. Reduce allocations or increase your income.");
    const updatedSubs = subcategories.map(sub => ({ ...sub, allocation: amountInPaise(data.get(`sub-${sub.id}`)) }));
    if (!updatedSubs.every(sub => validMoney(sub.allocation))) return fieldError(form, `sub-${updatedSubs.find(sub => !validMoney(sub.allocation))!.id}`, "Enter a valid subcategory amount.");
    const overParent = categories.findIndex((name, i) => updatedSubs.filter(sub => sub.parent === name).reduce((sum, sub) => sum + sub.allocation, 0) > allocations[i]);
    if (overParent !== -1) return fieldError(form, `category-${overParent}`, "Subcategory allocations exceed this parent budget. Increase it or reduce its subcategories.");
    if (readOnly) return;
    const start = String(data.get("start"));
    const cycle = String(data.get("cycle"));
    if (newCycle && current && start <= current.start) return fieldError(form, "start", "Choose a start date after the current cycle’s start.");
    const creating = !current || newCycle;
    const changes: string[] = [];
    if (creating) {
      changes.push(`Cycle started on ${start} with income ${money(income)}.`);
      categories.forEach((name, i) => changes.push(`${name} allocated ${money(allocations[i])}.`));
    } else {
      if (income !== current.income) changes.push(`Income changed from ${money(current.income)} to ${money(income)}.`);
      if (start !== current.start) changes.push(`Cycle start changed from ${current.start} to ${start}.`);
      if (cycle !== current.cycle) changes.push(`Budget type changed from ${current.cycle} to ${cycle}.`);
      categories.forEach((name, i) => { if (allocations[i] !== current.allocations[i]) changes.push(`${name} allocation changed from ${money(current.allocations[i] ?? 0)} to ${money(allocations[i])}.`); });
    }
    updatedSubs.forEach(sub => {
      const previous = current?.subcategories?.find(old => old.id === sub.id);
      if (creating || !previous || previous.allocation !== sub.allocation) changes.push(`${sub.parent} / ${sub.name} allocation ${creating || !previous ? "set to" : `changed from ${money(previous.allocation)} to`} ${money(sub.allocation)}.`);
    });
    const next = withActivity({ ...(creating ? { id: crypto.randomUUID(), expenses: [] } : current), categories: [...categories], subcategories: updatedSubs, income, allocations, cycle, start }, changes);
    const nextArchives = newCycle && current ? [withActivity(current, [`Cycle archived when the next cycle started on ${start}.`]), ...archives] : archives;
    if (await save(next, nextArchives)) { setEditing(false); setNewCycle(false); setNotice(creating ? "New cycle saved. Previous cycles remain available below." : "Budget saved. Changes are recorded in your activity history."); }
  }

  function openExpense(expense: Expense | null = null) {
    setEditingExpense(expense);
    setExpenseAmount(expense ? String(expense.amount / 100) : "");
    setExpenseCategory(expense?.category ?? "");
    setExpenseSubcategory(expense?.subcategory ?? "");
    setFieldErrors({});
    setExpenseError("");
    dialog.current?.showModal();
  }

  async function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current || readOnly) return;
    const form = event.currentTarget;
    if (!checkFields(form)) return;
    const amount = Math.round(Number(expenseAmount) * 100);
    const category = expenseCategory;
    if (!validMoney(amount) || amount === 0 || !categories.includes(category)) return fieldError(form, !categories.includes(category) ? "category" : "amount", "Enter a valid amount and choose a category.");
    if (expenseSubcategory && !subcategories.some(sub => sub.id === expenseSubcategory && sub.parent === category)) return fieldError(form, "subcategory", "Choose a subcategory belonging to this category.");
    const expense = { subcategory: expenseSubcategory || undefined, id: editingExpense?.id ?? crypto.randomUUID(), amount, category, date: editingExpense?.date ?? new Date().toISOString() };
    const expenses = editingExpense ? current.expenses.map(e => e.id === expense.id ? expense : e) : [expense, ...current.expenses];
    const description = editingExpense ? `Expense changed from ${money(editingExpense.amount)} in ${expenseLabel(editingExpense)} to ${money(amount)} in ${expenseLabel(expense)}.` : `Expense added: ${money(amount)} in ${expenseLabel(expense)}.`;
    if (await save(withActivity({ ...current, expenses }, [description]))) {
      dialog.current?.close();
      setNotice("Expense saved. Balances and activity history are updated.");
    }
  }

  // Keep deleted entries recoverable, including after refresh.
  async function deleteExpense(expense: Expense) {
    if (!current || readOnly) return;
    if (await save(withActivity({ ...current, expenses: current.expenses.filter(e => e.id !== expense.id), deletedExpenses: [expense, ...(current.deletedExpenses ?? [])] }, [`Expense deleted: ${money(expense.amount)} in ${expenseLabel(expense)}.`]))) setNotice("Expense deleted and balance restored. You can restore it under Deleted expenses.");
  }
  async function restoreExpense(expense: Expense) {
    if (!current || readOnly) return;
    if (await save(withActivity({ ...current, expenses: [expense, ...current.expenses].sort((a, b) => b.date.localeCompare(a.date)), deletedExpenses: (current.deletedExpenses ?? []).filter(e => e.id !== expense.id) }, [`Expense restored: ${money(expense.amount)} in ${expenseLabel(expense)}.`]))) setNotice("Expense restored. Your balances are updated.");
  }

  function expenseLabel(expense: Expense) {
    const sub = subcategories.find(sub => sub.id === expense.subcategory);
    return sub ? `${expense.category} / ${sub.name}` : expense.category;
  }

  function openCategory(parent = "") {
    setCategoryParent(parent);
    setFieldErrors({});
    setCategoryError("");
    categoryDialog.current?.showModal();
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    const form = event.currentTarget;
    if (!checkFields(form)) return;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim().replace(/\s+/g, " ");
    const allocation = amountInPaise(data.get("allocation"));
    if (!name || name.length > 40 || !validMoney(allocation)) return fieldError(form, !name || name.length > 40 ? "name" : "allocation", "Enter a name up to 40 characters and a valid allocation.");
    const existing = categoryParent ? subcategories.filter(sub => sub.parent === categoryParent).map(sub => sub.name) : categories;
    if (existing.some(other => other.toLowerCase() === name.toLowerCase())) return fieldError(form, "name", "That name already exists here. Choose a different name.");
    if (planning) {
      // Keep additions in the draft until the whole plan is saved; Cancel discards them.
      if (categoryParent) setDraftSubs([...draftSubs, { id: crypto.randomUUID(), name, parent: categoryParent, allocation }]);
      else { setDraftCategories([...draftCategories, name]); setDraftAllocations([...draftAllocations, allocation]); }
      form.reset(); categoryDialog.current?.close();
      return;
    }
    if (!current) return;
    let next: Budget;
    if (categoryParent) {
      const parentIndex = categories.indexOf(categoryParent);
      const assigned = subcategories.filter(sub => sub.parent === categoryParent).reduce((sum, sub) => sum + sub.allocation, 0);
      if (parentIndex < 0 || assigned + allocation > current.allocations[parentIndex]) return fieldError(form, "allocation", "Subcategory allocations cannot exceed the parent budget. Adjust the parent in Edit budget first.");
      next = { ...current, subcategories: [...subcategories, { id: crypto.randomUUID(), name, parent: categoryParent, allocation }] };
    } else {
      if (current.allocations.reduce((sum, amount) => sum + amount, 0) + allocation > current.income) return fieldError(form, "allocation", "This allocation exceeds your unallocated income. Adjust your budget first.");
      next = { ...current, categories: [...categories, name], allocations: [...current.allocations, allocation] };
    }
    if (await save(withActivity(next, [`${categoryParent ? `Subcategory ${categoryParent} / ${name}` : `Category ${name}`} created with ${money(allocation)} allocated.`]))) {
      form.reset();
      categoryDialog.current?.close();
      setNotice(`${name} created. Your budget and history are updated.`);
    }
  }

  const allocated = budget?.allocations.reduce((a, b) => a + b, 0) ?? 0;
  const spent = budget?.expenses.reduce((a, e) => a + e.amount, 0) ?? 0;

  return (
    <fieldset disabled={saving} className="min-h-screen min-w-0">
      {saving && <p role="status" className="bg-emerald-50 p-3 text-center text-sm">Saving to your account…</p>}
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3 text-xl font-bold tracking-tight"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-900 text-white">₹</span>Rupee Trace<span className="hidden rounded-full bg-stone-100 px-2 py-1 text-[10px] tracking-widest text-stone-500 sm:block">PERSONAL</span></Link>
          <span className="text-xs text-stone-500">Your money, with intention.</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div><p className="eyebrow">A LITTLE CLARITY. A LOT MORE CONTROL.</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Every Rupee Has a Purpose.</h1><p className="mt-3 text-stone-500">Give your income a plan. Know what’s left before you spend.</p></div>
          {budget && !editing && !readOnly && <button className="secondary" onClick={() => beginPlan(false)}>Edit budget</button>}
        </div>
        {current && !editing && <div className="mb-6 flex flex-wrap items-end gap-4"><label className="max-w-sm flex-1">View cycle<select value={selected} onChange={e => { setSelected(Number(e.target.value)); setNotice(""); setError(""); }}><option value={-1}>Current · {current.start}</option>{archives.map((cycle, i) => <option key={cycle.id ?? i} value={i}>Previous · {cycle.start}</option>)}</select></label>{!readOnly && <button className="secondary" onClick={() => beginPlan(true)}>Start new cycle</button>}{readOnly && <p className="text-sm text-stone-500">Archived cycle · read only</p>}</div>}
        {error && <p ref={errorRef} tabIndex={-1} role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
        <p role="status" className={notice ? "mb-5 text-sm text-emerald-800" : "sr-only"}>{notice}</p>
        {!ready ? <p>Loading your budget…</p> : (!budget || editing) ? (
          <form ref={planForm} noValidate onSubmit={savePlan} className="panel mx-auto max-w-3xl p-6 sm:p-9">
            <p className="eyebrow">YOUR PLAN STARTS HERE</p><h2 className="mt-2 text-2xl font-semibold">{newCycle ? "Start a new salary cycle" : budget ? "Adjust your budget" : "Make room for what matters"}</h2>
            <p className="mt-2 text-sm text-stone-500">Set your income, then give each category an amount. You can leave some money unallocated.</p>
            {budget && <p className="mt-3 text-sm text-amber-800">{newCycle ? "Your current cycle will be archived. Allocations are copied to help you plan; expenses start at zero. No balance carries over automatically." : "Editing keeps your recorded expenses and records each change in activity history."}</p>}
            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              <label>Budget type<select name="cycle" defaultValue={budget?.cycle ?? "Monthly"}><option>Monthly</option><option>Salary cycle</option></select></label>
              <label>Cycle start date<input name="start" {...fieldProps("start")} type="date" required defaultValue={(newCycle ? undefined : budget?.start) ?? new Date().toLocaleDateString("en-CA")} />{fieldMessage("start")}</label>
              <label className="sm:col-span-2">Income for this cycle (₹)<input name="income" {...fieldProps("income")} type="number" inputMode="decimal" min="0.01" max="1000000000" step="0.01" placeholder="e.g. 80000" required defaultValue={budget ? budget.income / 100 : ""} />{fieldMessage("income")}</label>
            </div>
            <div className="my-7 border-t border-stone-200" />
            <h3 className="font-semibold">Give your money a purpose</h3><div className="mt-5 grid gap-5 sm:grid-cols-2">{categories.map((name, i) => <div key={name}><label>{name} (₹)<input name={`category-${i}`} {...fieldProps(`category-${i}`)} type="number" inputMode="decimal" min="0" max="1000000000" step="0.01" defaultValue={draftAllocations[i] / 100 || ""} placeholder="0" />{fieldMessage(`category-${i}`)}</label><button type="button" className="secondary mt-3" onClick={() => openCategory(name)}>+ Subcategory</button></div>)}</div><button type="button" className="secondary mt-5" onClick={() => openCategory()}>+ Add category</button>
            {subcategories.length > 0 && <div className="mt-6"><h3 className="font-semibold">Subcategory allocations</h3><p className="mt-1 text-sm text-stone-500">These divide the parent budget; they do not add to it.</p><div className="mt-4 grid gap-5 sm:grid-cols-2">{subcategories.map(sub => <label key={sub.id}>{sub.parent} / {sub.name} (₹)<input name={`sub-${sub.id}`} {...fieldProps(`sub-${sub.id}`)} type="number" inputMode="decimal" min="0" max="1000000000" step="0.01" defaultValue={sub.allocation / 100} />{fieldMessage(`sub-${sub.id}`)}</label>)}</div></div>}
            <div className="mt-8 flex gap-3"><button className="primary" type="submit">{newCycle ? "Start cycle & archive current" : budget ? "Save changes" : "Create my budget"} <span aria-hidden="true">↗</span></button>{budget && <button className="secondary" type="button" onClick={() => { setEditing(false); setNewCycle(false); setError(""); }}>Cancel</button>}</div>
          </form>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-3" aria-label="Budget overview">
              <div className="rounded-2xl bg-emerald-950 p-7 text-white"><p className="text-sm text-emerald-200">Total money remaining</p><p className="mt-3 text-4xl font-semibold tracking-tight">{money(budget.income - spent)}</p><p className="mt-5 text-xs text-emerald-200">{budget.cycle} · from {new Date(`${budget.start}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p></div>
              <div className="panel p-7"><p className="text-sm text-stone-500">Income given a purpose</p><p className="mt-3 text-3xl font-semibold">{money(allocated)}</p><p className="mt-5 text-xs text-stone-500">of {money(budget.income)} income</p></div>
              <div className="panel p-7"><p className="text-sm text-stone-500">Still to allocate</p><p className="mt-3 text-3xl font-semibold">{money(budget.income - allocated)}</p><p className="mt-5 text-xs text-stone-500">{budget.income === allocated ? "Every rupee has a home. Nicely planned." : "A little space for your next priority."}</p></div>
            </section>
            <section className="mt-10">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">Your purposes</h2><p className="mt-1 text-sm text-stone-500">What’s left in each part of your life.</p></div>{!readOnly && <div className="flex flex-wrap gap-2"><button className="secondary" onClick={() => openCategory()}>+ Add category</button><button className="primary" onClick={() => openExpense()}>+ Add Expense</button></div>}</div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{categories.map((name, i) => {
                const used = budget.expenses.filter(e => e.category === name).reduce((sum, e) => sum + e.amount, 0);
                const allocation = budget.allocations[i];
                const remaining = allocation - used;
                return <article className="panel p-6" key={name}><div className="flex items-center gap-3"><span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-xl text-emerald-900">{SYMBOLS[i] ?? "◇"}</span><h3 className="font-medium">{name}</h3></div><p className={`mt-5 text-3xl font-semibold tracking-tight ${remaining < 0 ? "text-red-700" : "text-emerald-950"}`}>{money(remaining)}</p><p className={`mt-1 text-xs ${remaining < 0 ? "text-red-700" : "text-stone-500"}`}>{remaining < 0 ? "Over budget · consider adjusting your plan" : "remaining"}</p><div className="my-5 h-1.5 overflow-hidden rounded-full bg-stone-100"><div className={`h-full rounded-full ${remaining < 0 ? "bg-red-500" : "bg-emerald-600"}`} style={{ width: `${allocation ? Math.min(100, used / allocation * 100) : used ? 100 : 0}%` }} /></div><div className="flex justify-between gap-2 text-xs text-stone-500"><span>{money(used)} spent</span><span>{money(allocation)} allocated</span></div>{subcategories.some(sub => sub.parent === name) && <ul className="mt-5 divide-y divide-stone-100 border-t border-stone-100">{subcategories.filter(sub => sub.parent === name).map(sub => {
                  const subSpent = budget.expenses.filter(e => e.subcategory === sub.id).reduce((sum, e) => sum + e.amount, 0);
                  return <li className="py-3 text-sm" key={sub.id}><div className="flex justify-between gap-2"><span className="break-words">{sub.name}</span><span className={subSpent > sub.allocation ? "text-red-700" : "text-emerald-800"}>{money(Math.abs(sub.allocation - subSpent))} {subSpent > sub.allocation ? "overspent" : "left"}</span></div><p className="mt-1 text-xs text-stone-500">{money(subSpent)} spent · {money(sub.allocation)} allocated</p></li>;
                })}<li className="pt-3 text-xs text-stone-500">{money(allocation - subcategories.filter(sub => sub.parent === name).reduce((sum, sub) => sum + sub.allocation, 0))} not assigned to subcategories. Parent balance includes all expenses.</li></ul>}{!readOnly && <button className="secondary mt-4" onClick={() => openCategory(name)}>+ Subcategory</button>}</article>;
              })}</div>
            </section>
            <section className="panel mt-8 p-6"><div className="flex justify-between gap-3"><h2 className="text-lg font-semibold">Expenses</h2><p className="text-sm text-stone-500">{money(spent)} spent this cycle</p></div>{budget.expenses.length === 0 ? <div className="py-9 text-center"><p className="font-medium">A fresh start for your money.</p><p className="mt-2 text-sm text-stone-500">Add your first expense to see your plan in action.</p></div> : <ul className="mt-4 divide-y divide-stone-100">{budget.expenses.map(e => <li key={e.id} className="flex items-center justify-between gap-4 py-4"><div><p className="text-sm font-medium">{expenseLabel(e)}</p><p className="mt-1 text-xs text-stone-500">{new Date(e.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p></div><div className="flex flex-wrap items-center justify-end gap-2"><span className="font-medium">−{money(e.amount)}</span>{!readOnly && <><button className="secondary" onClick={() => openExpense(e)}>Edit</button><button className="secondary" onClick={() => deleteExpense(e)}>Delete</button></>}</div></li>)}</ul>}</section>
            {(budget.deletedExpenses ?? []).length > 0 && <details className="panel mt-6 p-6"><summary className="cursor-pointer font-semibold">Deleted expenses ({budget.deletedExpenses!.length})</summary><ul className="mt-4 divide-y divide-stone-100">{budget.deletedExpenses!.map(e => <li key={e.id} className="flex items-center justify-between gap-4 py-3"><span className="text-sm">{expenseLabel(e)} · {money(e.amount)}</span>{!readOnly && <button className="secondary" onClick={() => restoreExpense(e)}>Restore</button>}</li>)}</ul></details>}
            <section className="panel mt-6 p-6"><h2 className="text-lg font-semibold">Activity history</h2><p className="mt-1 text-sm text-stone-500">Budget decisions and expense changes, newest first.</p><ol className="mt-4 max-h-96 overflow-y-auto divide-y divide-stone-100">{(budget.activities ?? []).map(a => <li key={a.id} className="py-4"><p className="text-sm">{a.description}</p><p className="mt-1 text-xs text-stone-500">{new Date(a.date).toLocaleString("en-IN")}</p></li>)}</ol></section>
          </>
        )}
        <footer className="mt-10 text-center text-xs leading-6 text-stone-500">Made for mindful spending.<br />Saved to your account · Refresh to load changes made on another device.</footer>
      </main>
      <dialog ref={categoryDialog} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-7 text-stone-900 shadow-xl backdrop:bg-stone-950/40" aria-labelledby="category-title">
        <div className="flex items-center justify-between gap-3"><h2 id="category-title" className="text-xl font-semibold">{categoryParent ? `Add subcategory to ${categoryParent}` : "Add category"}</h2><button className="secondary" aria-label="Close category form" onClick={() => categoryDialog.current?.close()}>×</button></div>
        <p className="mt-3 text-sm text-stone-500">{categoryParent ? "This allocation comes from the parent budget. It is not additional income." : "Give another part of your life a purpose and a budget."}</p>
        <form noValidate onSubmit={createCategory} className="mt-5 space-y-5"><label>Name<input name="name" {...fieldProps("name")} maxLength={40} required autoFocus />{fieldMessage("name")}</label><label>Allocation (₹)<input name="allocation" {...fieldProps("allocation")} type="number" inputMode="decimal" min="0" max="1000000000" step="0.01" defaultValue="0" required />{fieldMessage("allocation")}</label>{categoryError && <p role="alert" className="text-sm text-red-700">{categoryError}</p>}<button className="primary w-full" type="submit">{categoryParent ? "Create subcategory" : "Create category"}</button></form>
      </dialog>
      <dialog ref={dialog} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-7 text-stone-900 shadow-xl backdrop:bg-stone-950/40" aria-labelledby="expense-title">
        <div className="flex items-center justify-between"><h2 id="expense-title" className="text-2xl font-semibold">{editingExpense ? "Edit expense" : "Add Expense"}</h2><button type="button" className="secondary" aria-label="Close expense form" onClick={() => dialog.current?.close()}>×</button></div><p className="mt-2 text-sm text-stone-500">A small entry. A clearer picture.</p>
        <form noValidate onSubmit={addExpense} className="mt-6 space-y-5"><label>Amount (₹)<input name="amount" {...fieldProps("amount")} type="number" inputMode="decimal" min="0.01" max="1000000000" step="0.01" placeholder="0.00" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} required autoFocus />{fieldMessage("amount")}</label><label>Category<select name="category" {...fieldProps("category")} required value={expenseCategory} onChange={e => { setExpenseCategory(e.target.value); setExpenseSubcategory(""); }}><option value="" disabled>Choose a purpose</option>{categories.map(name => <option key={name}>{name}</option>)}</select>{fieldMessage("category")}</label>{subcategories.some(sub => sub.parent === expenseCategory) && <label>Subcategory (optional)<select name="subcategory" {...fieldProps("subcategory")} value={expenseSubcategory} onChange={e => setExpenseSubcategory(e.target.value)}><option value="">General / no subcategory</option>{subcategories.filter(sub => sub.parent === expenseCategory).map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}</select>{fieldMessage("subcategory")}</label>}<p className="text-xs text-stone-500">Expenses beyond your allocation are allowed and shown as over budget.</p>{expenseError && <p role="alert" className="text-sm text-red-700">{expenseError}</p>}<button type="submit" className="primary w-full">Save expense</button></form>
      </dialog>
    </fieldset>
  );
}

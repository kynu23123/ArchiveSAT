import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight, BookCopy, BookOpen, ChartNoAxesCombined, ChevronDown, ChevronUp,
  ChevronRight, FileText, LayoutGrid, Plus, Search,
  Settings2, Table2, Target, X,
} from "lucide-react";
import "@fontsource-variable/manrope/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import { questionsFor, readState, seedForms, storageKey, summarize } from "./data.js";
import { Bands, Breakdown, Dashboard, History, Quiz, Reference, Settings, Tests } from "./pages.jsx";
import { Button, DotPattern, Modal } from "./ui.jsx";
import { ImportForm } from "./papers.jsx";
import { clearPapers } from "./pdf.js";
import { readPreferences, usePreferences } from "./personalization.jsx";
import "./styles.css";

const links = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "tests", label: "Test library", icon: BookOpen },
  { id: "history", label: "Recent results", icon: ChartNoAxesCombined },
  { id: "bands", label: "Percentile bands", icon: Target },
  { id: "reference", label: "Scoring reference", icon: Table2 },
  { id: "settings", label: "Settings", icon: Settings2 },
];

function NavButton({ item, page, navigate, className = "", children }) {
  const Icon = item.icon;
  return <Button variant="ghost" className={"nav-link " + className} aria-current={page === item.id ? "page" : undefined} onClick={() => navigate(item.id)}>
    <Icon aria-hidden="true" /><span>{item.label}</span>{children}
  </Button>;
}

function Sidebar({ page, navigate, search }) {
  const [expanded, setExpanded] = useState(true);
  const Chevron = expanded ? ChevronUp : ChevronDown;
  return <aside className="sidebar">
    <button className="brand" onClick={() => navigate("dashboard")}><span className="brand-mark"><BookCopy /></span><span>SAT Archive</span></button>
    <button className="search-button" onClick={search}><Search /><span>Search workspace</span><kbd>Ctrl K</kbd></button>
    <div className="side-divider" />
    <nav className="side-nav" aria-label="Workspace">
      <div className={"nav-group " + (["dashboard", "history", "bands"].includes(page) ? "active" : "")}>
        <NavButton item={links[0]} page={page} navigate={navigate} />
        <Button variant="ghost" className="icon-button" aria-label={expanded ? "Collapse dashboard links" : "Expand dashboard links"} aria-expanded={expanded} aria-controls="dashboard-links" onClick={() => setExpanded(!expanded)}><Chevron /></Button>
      </div>
      <div className="subnav" id="dashboard-links" hidden={!expanded}>
        <Button variant="ghost" aria-current={page === "dashboard" ? "location" : undefined} onClick={() => navigate("dashboard")}>Overview</Button>
        <Button variant="ghost" aria-current={page === "history" ? "location" : undefined} onClick={() => navigate("history")}>Recent results</Button>
        <Button variant="ghost" aria-current={page === "bands" ? "location" : undefined} onClick={() => navigate("bands")}>Percentile bands</Button>
      </div>
      {links.filter(({ id }) => ["tests", "reference", "settings"].includes(id)).map((item) => <NavButton key={item.id} item={item} page={page} navigate={navigate} />)}
    </nav>
    <div className="sidebar-footer">
      <div className="workspace-label"><span className="workspace-dot" /><div><strong>Sample workspace</strong><small>Historical SAT forms</small></div></div>
      <Button className="full-button" onClick={() => navigate("reference")}><Table2 /> Scoring reference <ChevronRight /></Button>
    </div>
  </aside>;
}

function Dock({ page, navigate, onAdd }) {
  const dockItems = links.filter(({ id }) => ["dashboard", "tests", "history", "bands", "settings"].includes(id));
  const dock = useRef(null);
  function magnify(event) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const item of dock.current.children) {
      if (!item.classList.contains("dock-item")) continue;
      const distance = Math.abs(item.offsetLeft + item.offsetWidth / 2 - event.nativeEvent.clientX + dock.current.getBoundingClientRect().left);
      item.style.setProperty("--dock-scale", 1 + Math.max(0, 1 - distance / 80) * 0.24);
    }
  }
  function clear() {
    for (const item of dock.current.children) item.style.removeProperty("--dock-scale");
  }
  return <nav aria-label="Quick navigation" className="dock" ref={dock} onPointerMove={magnify} onPointerLeave={clear}>
    {dockItems.map(({ id, label, icon: Icon }) => <Button key={id} variant="ghost" className="dock-item" aria-label={label} aria-current={page === id ? "page" : undefined} onClick={() => navigate(id)}>
      <Icon /><span className="dock-tooltip">{label}</span>
    </Button>)}
    <span className="dock-divider" />
    <Button variant="primary" className="dock-item dock-add" aria-label="Add test" onClick={onAdd}><Plus /><span className="dock-tooltip">Add test</span></Button>
  </nav>;
}

function SearchWorkspace({ forms, navigate, onStart }) {
  const [query, setQuery] = useState("");
  const matches = links.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()));
  const tests = query.trim() ? forms.filter((form) => form.title.toLowerCase().includes(query.trim().toLowerCase())) : [];
  return <>
    <label className="field search-field"><span className="sr-only">Search workspace</span><input data-autofocus value={query} placeholder="Type a page or test name…" onChange={(event) => setQuery(event.target.value)} /></label>
    <div className="search-results">{matches.map(({ id, label, icon: Icon }) => <Button key={id} variant="ghost" onClick={() => navigate(id)}><Icon />{label}<ChevronRight /></Button>)}
      {tests.map((form) => <Button key={form.id} variant="ghost" onClick={() => onStart(form.id)}><FileText />{form.title}<ChevronRight /></Button>)}
      {!matches.length && !tests.length && <p className="empty-line">No matching pages or tests.</p>}
    </div>
  </>;
}

function App() {
  const [state, setState] = useState(readState);
  const [preferences, setPreferences] = useState(readPreferences);
  usePreferences(preferences);
  const [view, setView] = useState({ page: "dashboard" });
  const [dialog, setDialog] = useState(null);
  const [storageError, setStorageError] = useState(false);
  const [notice, setNotice] = useState("");
  const activeTrigger = useRef(null);
  const main = useRef(null);
  const firstRender = useRef(true);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); }
    catch { setStorageError(true); }
  }, [state]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    window.scrollTo(0, 0);
    main.current.focus({ preventScroll: true });
  }, [view]);

  function showDialog(type, id) {
    activeTrigger.current = document.activeElement;
    setDialog({ type, id });
  }

  useEffect(() => {
    function keyboard(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        showDialog("search");
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);

  const results = state.results.map((result) => summarize(state.forms.find(({ id }) => id === result.formId), result));
  const form = state.forms.find(({ id }) => id === view.id);
  const attempt = form && state.attempts[form.id];
  const result = results.find(({ id }) => id === view.id);
  const navPage = view.page === "quiz" ? "tests" : view.page === "result" ? "history" : view.page;
  const add = () => showDialog("import");
  const close = () => setDialog(null);

  function navigate(page, id) {
    activeTrigger.current = null;
    close();
    setView({ page, id });
  }

  function start(id) {
    setState((current) => current.attempts[id] ? current : {
      ...current, attempts: { ...current.attempts, [id]: { answers: {}, cursor: 0 } },
    });
    navigate("quiz", id);
  }

  function updateAttempt(update) {
    setState((current) => ({
      ...current, attempts: { ...current.attempts, [form.id]: update(current.attempts[form.id]) },
    }));
  }

  function create(form) {
    setState((current) => ({ ...current, forms: [form, ...current.forms] }));
    navigate("tests");
    setNotice("PDF test added.");
  }

  function discard(id) {
    setState((current) => {
      const { [id]: discarded, ...attempts } = current.attempts;
      return { ...current, attempts };
    });
    navigate("tests");
    setNotice("Attempt discarded.");
  }

  function finish() {
    const id = Date.now().toString(36);
    const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" }).format(new Date());
    setState((current) => {
      const { [form.id]: completed, ...attempts } = current.attempts;
      if (!completed) return current;
      return { ...current, attempts, results: [{ id, formId: form.id, date, answers: completed.answers }, ...current.results] };
    });
    navigate("result", id);
  }

  const open = (id) => navigate("result", id);
  let content;
  switch (view.page) {
    case "tests": content = <Tests state={state} onAdd={add} onStart={start} onDiscard={(id) => showDialog("discard", id)} />; break;
    case "history": content = <History results={results} onOpen={open} />; break;
    case "bands": content = <Bands key={view.id ?? "latest"} results={results} initialResultId={view.id} />; break;
    case "reference": content = <Reference />; break;
    case "settings": content = <Settings preferences={preferences} onPreferences={setPreferences} onReset={() => showDialog("reset")} />; break;
    case "result": content = result && <Breakdown key={result.id} result={result} onBack={() => navigate("history")} navigate={navigate} />; break;
    case "quiz": content = attempt && <Quiz form={form} attempt={attempt}
      onAnswer={(answer) => updateAttempt((old) => {
        const answers = { ...old.answers };
        if (answer == null) delete answers[old.cursor]; else answers[old.cursor] = answer;
        return { ...old, answers };
      })}
      onCursor={(cursor) => updateAttempt((old) => ({ ...old, cursor }))}
      onExit={() => { navigate("tests"); setNotice("Progress saved."); }}
      onFinish={() => showDialog("finish")} onDiscard={() => showDialog("discard", form.id)} />; break;
    default: content = <Dashboard results={results} state={state} onAdd={add} onStart={start} onOpen={open} navigate={navigate} />;
  }

  const omitted = attempt ? questionsFor(form).length - Object.keys(attempt.answers).length : 0;
  const dialogs = {
    import: ["Add a test", "Use one combined PDF or attach the scoring sheet separately."],
    search: ["Search workspace", "Find a page or jump to a test."],
    discard: ["Discard this attempt?", "The answers and saved position for this attempt will be cleared."],
    finish: ["Submit this test?", omitted ? omitted + (omitted === 1 ? " question is" : " questions are") + " unanswered. You can review your answers before submitting." : "All questions are answered. Submit to view your scores."],
    reset: ["Reset local progress?", "This clears completed results, saved answers, and any forms you added."],
  };
  const dialogText = dialog && dialogs[dialog.type];

  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <DotPattern />
    <Sidebar page={navPage} navigate={navigate} search={() => showDialog("search")} />
    <header className="mobile-header">
      <button className="brand" onClick={() => navigate("dashboard")}><span className="brand-mark"><BookCopy /></span><span>SAT Archive</span></button>
      <Button className="icon-button" aria-label="Search workspace" onClick={() => showDialog("search")}><Search /></Button>
    </header>
    <main id="main" tabIndex={-1} ref={main}>
      {storageError && <p role="alert" className="storage-alert">Browser storage is unavailable. Progress lasts for this visit.</p>}
      <div className="page-content" key={view.page + (view.id ?? "")}>{content}</div>
    </main>
    <Dock page={navPage} navigate={navigate} onAdd={add} />
    {notice && <div className="toast" role="status">{notice}<Button className="icon-button" variant="ghost" aria-label="Dismiss notice" onClick={() => setNotice("")}><X /></Button></div>}
    <Modal open={Boolean(dialog)} title={dialogText?.[0]} description={dialogText?.[1]} onClose={close} triggerRef={activeTrigger}>
      {dialog?.type === "import" && <ImportForm onCreate={create} onClose={close} />}
      {dialog?.type === "search" && <SearchWorkspace forms={state.forms} navigate={navigate} onStart={start} />}
      {dialog?.type === "discard" && <div className="modal-actions"><Button onClick={close}>Cancel</Button><Button variant="primary" onClick={() => discard(dialog.id)}>Discard attempt</Button></div>}
      {dialog?.type === "finish" && <div className="modal-actions"><Button onClick={close}>Keep reviewing</Button><Button variant="primary" onClick={finish}>Submit test <ArrowRight /></Button></div>}
      {dialog?.type === "reset" && <div className="modal-actions"><Button onClick={close}>Cancel</Button><Button variant="primary" onClick={async () => {
        try {
          if (state.forms.some((form) => form.paperPages)) await clearPapers();
          setState({ forms: seedForms, attempts: {}, results: [] }); close(); setNotice("Local progress cleared.");
        } catch { setNotice("Could not clear the saved PDFs. Try again."); }
      }}>Reset progress</Button></div>}
    </Modal>
  </>;
}

createRoot(document.getElementById("root")).render(<App />);

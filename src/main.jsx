import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight, BookOpen, ChartNoAxesCombined, ChevronDown, ChevronUp,
  ChevronRight, FileText, LayoutGrid, Search,
  Settings2, Table2, Target, X,
} from "lucide-react";
import "@fontsource-variable/manrope/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import { initialState, playableCursor, questionsFor, readState, storageKey, summarize } from "./data.js";
import { scoringFor } from "./scoring.js";
import { authenticity } from "./authenticity.js";
import { activateSection, canOpen, closeSection, completedIndexes, pauseAttempt, resumeAttempt, sectionAt, testSections } from "./timing.js";
import { Bands, Breakdown, Dashboard, History, Quiz, Reference, Settings, Tests } from "./pages.jsx";
import { Button, DotPattern, Modal } from "./ui.jsx";
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
const desktopWindow = location.origin === "https://sat-archive.local" ? window.chrome?.webview : null;

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
    <button className="brand" onClick={() => navigate("dashboard")}><span className="brand-mark" aria-hidden="true" /><span>SAT Archived</span></button>
    <button className="search-button" onClick={search}><Search /><span>Search Stuff</span></button>
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
  </aside>;
}

function Dock({ page, navigate }) {
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
  </nav>;
}

function SearchWorkspace({ forms, navigate, onStart, initialQuery = "" }) {
  const [query, setQuery] = useState(initialQuery);
  const matches = links.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()));
  const tests = query.trim() ? forms.filter((form) => form.title.toLowerCase().includes(query.trim().toLowerCase())) : [];
  return <>
    <label className="field search-field"><span className="sr-only">Search workspace</span><input data-autofocus value={query} placeholder="Type stuff..." onChange={(event) => setQuery(event.target.value)} /></label>
    <div className="search-results">{matches.map(({ id, label, icon: Icon }) => <Button key={id} variant="ghost" onClick={() => navigate(id)}><Icon />{label}<ChevronRight /></Button>)}
      {tests.map((form) => <Button key={form.id} variant="ghost" onClick={() => onStart(form.id, query)}><FileText />{form.title}<ChevronRight /></Button>)}
      {!matches.length && !tests.length && <p className="empty-line">No matching pages or tests.</p>}
    </div>
  </>;
}

function App() {
  const [state, setState] = useState(readState);
  const [preferences, setPreferences] = useState(readPreferences);
  usePreferences(preferences);
  const [view, setView] = useState({ page: "welcome" });
  const [dialog, setDialog] = useState(null);
  const [storageError, setStorageError] = useState(false);
  const [notice, setNotice] = useState("");
  const [testFullscreen, setTestFullscreen] = useState(false);
  const activeTrigger = useRef(null);
  const main = useRef(null);
  const firstRender = useRef(true);

  useEffect(() => {
    desktopWindow?.postMessage(view.page === "quiz" && testFullscreen ? "test-fullscreen:enter" : "test-fullscreen:exit");
  }, [view.page, testFullscreen]);

  useEffect(() => {
    const changed = () => { if (!document.fullscreenElement) setTestFullscreen(false); };
    const escaped = (event) => {
      if (event.key !== "Escape") return;
      setTestFullscreen(false);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
    document.addEventListener("fullscreenchange", changed);
    window.addEventListener("keydown", escaped);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      window.removeEventListener("keydown", escaped);
    };
  }, []);

  useEffect(() => {
    if (view.page === "quiz") return;
    setTestFullscreen(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [view.page]);

  function toggleTestFullscreen() {
    if (testFullscreen) {
      setTestFullscreen(false);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } else {
      setTestFullscreen(true);
      if (!desktopWindow) document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }

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
      if (view.page === "welcome") return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        showDialog("search");
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [view.page]);

  const results = state.results.map((result) => summarize(state.forms.find(({ id }) => id === result.formId), result));
  const form = state.forms.find(({ id }) => id === view.id);
  const attempt = form && state.attempts[form.id];
  const quizItems = view.page === "quiz" && form ? questionsFor(form) : [];
  const sections = testSections(quizItems);
  const slot = sectionAt(sections, attempt?.cursor);
  const result = results.find(({ id }) => id === view.id);
  const navPage = view.page === "quiz" ? "tests" : view.page === "result" ? "history" : view.page;
  const close = () => setDialog(null);

  function navigate(page, id) {
    if (view.page === "quiz" && (page !== view.page || id !== view.id)) {
      const now = Date.now();
      setState((current) => {
        const old = current.attempts[view.id];
        if (!old) return current;
        return { ...current, attempts: { ...current.attempts, [view.id]: pauseAttempt(old, sections, now) } };
      });
    }
    activeTrigger.current = null;
    close();
    setView({ page, id });
  }

  function start(id, query) {
    if (authenticity(state.forms.find((item) => item.id === id))?.status === "blocked") {
      setNotice("This form is blocked pending source review.");
      return;
    }
    if (!dialog) activeTrigger.current = document.activeElement;
    if (state.attempts[id]) proceed(id);
    else setDialog({ type: "start", id, back: dialog?.type === "search" ? { ...dialog, query } : null });
  }

  function proceed(id) {
    if (authenticity(state.forms.find((item) => item.id === id))?.status === "blocked") return;
    const now = Date.now();
    const runId = crypto.randomUUID();
    setState((current) => {
      const selected = current.forms.find((item) => item.id === id);
      const old = current.attempts[id] ?? { answers: {}, cursor: 0 };
      const items = questionsFor(selected);
      const positions = Object.fromEntries(Object.entries(old.positions ?? {}).map(([slot, cursor]) => [slot, playableCursor(items, cursor)]));
      const active = resumeAttempt({
        ...old, cursor: playableCursor(items, old.cursor), positions, runId: old.runId ?? runId,
      }, testSections(items), now);
      return { ...current, attempts: { ...current.attempts, [id]: active } };
    });
    navigate("quiz", id);
  }

  function updateAttempt(update) {
    const now = Date.now();
    setState((current) => {
      const old = current.attempts[form.id];
      if (!old || old.endsAt == null || old.endsAt <= now) return current;
      return { ...current, attempts: { ...current.attempts, [form.id]: update(old, now) } };
    });
  }

  function discard(id) {
    setState((current) => {
      const { [id]: discarded, ...attempts } = current.attempts;
      return { ...current, attempts };
    });
    navigate("tests");
    setNotice("Attempt discarded.");
  }

  const finish = useCallback((expired = false) => {
    if (!form || !attempt || attempt.endsAt == null) return;
    const now = Date.now();
    const timedSections = testSections(questionsFor(form));
    const next = closeSection(attempt, timedSections, now);
    const id = attempt.runId;
    const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" }).format(now);
    const completed = completedIndexes(timedSections, next.completed);
    const previous = completedIndexes(timedSections, attempt.completed);
    const finished = next.completed.length === timedSections.length;
    const publish = finished || completed.length > previous.length;
    const items = questionsFor(form);
    const scoringVersion = scoringFor(form, items)?.version;
    setState((current) => {
      const { [form.id]: old, ...attempts } = current.attempts;
      if (old !== attempt) return current;
      if (!finished) attempts[form.id] = next;
      const answers = Object.fromEntries(Object.entries(next.answers).filter(([i]) => !items[i]?.excluded && completed.includes(items[i]?.index)));
      const results = publish
        ? [{ id, formId: form.id, date, answers, indexes: completed, partial: !finished, scoringVersion }, ...current.results.filter((result) => result.id !== id)]
        : current.results;
      return { ...current, attempts, results };
    });
    setDialog((open) => open?.type === "finish" ? null : open);
    if (finished) {
      activeTrigger.current = null;
      setView({ page: "result", id });
    } else if (publish) setNotice(completed.find((index) => !previous.includes(index)) + " result available in Recent results.");
    else if (expired) setNotice("Time is up. The next section has started.");
  }, [form, attempt]);

  useEffect(() => {
    if (view.page !== "quiz" || attempt?.endsAt == null) return;
    const timer = setTimeout(() => finish(true), Math.max(0, attempt.endsAt - Date.now()));
    return () => clearTimeout(timer);
  }, [view.page, attempt?.endsAt, finish]);

  useEffect(() => {
    if (view.page !== "quiz" || attempt?.endsAt == null) return;
    function saveOnClose() {
      const paused = pauseAttempt(attempt, testSections(questionsFor(form)), Date.now());
      try { localStorage.setItem(storageKey, JSON.stringify({ ...state, attempts: { ...state.attempts, [form.id]: paused } })); }
      catch { /* The storage alert already covers this session. */ }
    }
    window.addEventListener("pagehide", saveOnClose);
    window.addEventListener("sat-archive-save", saveOnClose);
    return () => {
      window.removeEventListener("pagehide", saveOnClose);
      window.removeEventListener("sat-archive-save", saveOnClose);
    };
  }, [view.page, attempt, form, state]);

  const open = (id) => navigate("result", id);
  let content;
  switch (view.page) {
    case "welcome": content = <section className="title-screen" aria-labelledby="welcome-title">
      <span className="title-mark" role="img" aria-label="SAT logo" />
      <h1 id="welcome-title">SAT Archived</h1>
      <p className="fine-print">Created by kynu <a href="https://www.reddit.com/user/Inevitable_Record901/">(u/Inevitable_Record901)</a></p>
      <p>The pre-1995 SATs are accepted by virtually all IQ societies and are often considered gold-standard IQ tests, with a g-loading of 0.93 and correlations ranging from 0.7 to 0.8 with professional full-scale IQ tests. They measure IQ up to and beyond 160 and are backed by data from more than one million test takers.</p>
      <p>With the sole exception of scrap paper, no external-aid tools are permitted. This includes search engines, AI, dictionaries, etc</p>
      <p>When encountering any bugs, please do not hesitate to reach out via reddit DMs</p>
      <a className="title-source" href="https://cognitivemetrics.com/wiki/old-sat" target="_blank" rel="noopener noreferrer">Cognitive Metrics</a>
      <Button variant="primary" className="title-enter" onClick={() => navigate("dashboard")}>Enter</Button>
    </section>; break;
    case "tests": content = <Tests state={state} onStart={start} onDiscard={(id) => showDialog("discard", id)} />; break;
    case "history": content = <History results={results} onOpen={open} />; break;
    case "bands": content = <Bands key={view.id ?? "latest"} results={results} initialResultId={view.id} />; break;
    case "reference": content = <Reference />; break;
    case "settings": content = <Settings preferences={preferences} onPreferences={setPreferences} onReset={() => showDialog("reset")} />; break;
    case "result": content = result && <Breakdown key={result.id} result={result} onBack={() => navigate("history")} />; break;
    case "quiz": content = attempt && <Quiz form={form} items={quizItems} sections={sections} slot={slot} attempt={attempt}
      fullscreen={testFullscreen} onFullscreen={toggleTestFullscreen}
      onAnswer={(answer) => updateAttempt((old) => {
        if (old.cursor !== attempt.cursor) return old;
        const answers = { ...old.answers };
        if (answer == null) delete answers[old.cursor]; else answers[old.cursor] = answer;
        return { ...old, answers };
      })}
      onCursor={(cursor) => updateAttempt((old) => quizItems[cursor] && !quizItems[cursor].excluded
        && sectionAt(sections, cursor) === sectionAt(sections, old.cursor) ? { ...old, cursor } : old)}
      onSection={(target) => updateAttempt((old, now) => canOpen(sections, old.completed, target) && target !== sectionAt(sections, old.cursor)
        ? activateSection(old, sections, target, now) : old)}
      onExit={() => { navigate("tests"); setNotice("Progress saved."); }}
      onFinish={() => showDialog("finish")} onDiscard={() => showDialog("discard", form.id)} />; break;
    default: content = <Dashboard results={results} state={state} onStart={start} onOpen={open} navigate={navigate} />;
  }

  const dialogs = {
    search: ["Search workspace", "Self Explanatory"],
    start: ["Start this test?", "This will start the test immediately. Each section has a 30 minute timer. With the sole exception of scrap paper, no external-aid tools are permitted."],
    discard: ["Discard this attempt?", "The answers and saved position for this attempt will be cleared."],
    finish: ["Finish this section?", "Your answers for this section will be locked. Blank answers count as wrong when scored."],
    reset: ["Reset local progress?", "This clears completed results, saved answers, and any forms you added."],
  };
  const dialogText = dialog && dialogs[dialog.type];

  return <div className={"app-shell" + (view.page === "welcome" ? " welcome-screen" : testFullscreen && view.page === "quiz" ? " test-fullscreen" : "")}>
    <a className="skip-link" href="#main">Skip to content</a>
    <DotPattern />
    {view.page !== "welcome" && <Sidebar page={navPage} navigate={navigate} search={() => showDialog("search")} />}
    {view.page !== "welcome" && <header className="mobile-header">
      <button className="brand" onClick={() => navigate("dashboard")}><span className="brand-mark" aria-hidden="true" /><span>SAT Archived</span></button>
      <Button className="icon-button" aria-label="Search Stuff " onClick={() => showDialog("search")}><Search /></Button>
    </header>}
    <main id="main" tabIndex={-1} ref={main}>
      {storageError && <p role="alert" className="storage-alert">Browser storage is unavailable. Progress lasts for this visit.</p>}
      <div className="page-content" key={view.page + (view.id ?? "")}>{content}</div>
    </main>
    {view.page !== "quiz" && view.page !== "welcome" && <Dock page={navPage} navigate={navigate} />}
    {notice && <div className="toast" role="status">{notice}<Button className="icon-button" variant="ghost" aria-label="Dismiss notice" onClick={() => setNotice("")}><X /></Button></div>}
    <Modal open={Boolean(dialog)} title={dialogText?.[0]} description={dialogText?.[1]}
      onClose={dialog?.type === "start" ? () => setDialog(dialog.back) : close} triggerRef={activeTrigger}>
      {dialog?.type === "search" && <SearchWorkspace forms={state.forms} navigate={navigate} onStart={start} initialQuery={dialog.query} />}
      {dialog?.type === "start" && <div className="modal-actions">
        <Button data-autofocus onClick={() => setDialog(dialog.back)}>Bring me back</Button>
        <Button variant="primary" onClick={() => proceed(dialog.id)}>Proceed</Button>
      </div>}
      {dialog?.type === "discard" && <div className="modal-actions"><Button onClick={close}>Cancel</Button><Button variant="primary" onClick={() => discard(dialog.id)}>Discard attempt</Button></div>}
      {dialog?.type === "finish" && <div className="modal-actions"><Button onClick={close}>Keep reviewing</Button><Button variant="primary" onClick={() => finish()}>Submit section <ArrowRight /></Button></div>}
      {dialog?.type === "reset" && <div className="modal-actions"><Button onClick={close}>Cancel</Button><Button variant="primary" onClick={async () => {
        try {
          if (state.forms.some((form) => !form.library && form.paperPages)) await clearPapers();
          setState(initialState); close(); setNotice("Local progress cleared.");
        } catch { setNotice("Could not clear the saved PDFs. Try again."); }
      }}>Reset progress</Button></div>}
    </Modal>
  </div>;
}

createRoot(document.getElementById("root")).render(<App />);

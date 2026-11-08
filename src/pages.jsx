import React, { useEffect, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, BookOpen, ChartNoAxesCombined, Check, ChevronRight, CircleHelp, FileText, ListChecks, Maximize, Minimize, RotateCcw, Target, X } from "lucide-react";
import { Button, Card } from "./ui.jsx";
import { CountingNumber, Distribution, Gauge, IndexScale, iqText, num } from "./charts.jsx";
import { indexes, ordinal, questionsFor } from "./data.js";
import { PaperQuestion, ReferenceViewer, ScoringPages } from "./papers.jsx";
import { loadQuestionPack, referenceCatalog, referenceGroups } from "./historical.js";
import { AnswerOptions, QuestionContent } from "./question.jsx";
import { Personalization } from "./personalization.jsx";
import { scoringFor } from "./scoring.js";
import { canOpen } from "./timing.js";
import { authenticity } from "./authenticity.js";

export function PageHead({ title, description, action, compact = false }) {
  return <header className={"page-head" + (compact ? " page-head-compact" : "")}><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</header>;
}

function Metric({ label, value, caption, icon: Icon }) {
  return <Card className="metric">
    <div className="metric-top"><h2>{label}</h2><Icon aria-hidden="true" /></div>
    <div className="metric-value mono">{value}</div>
    <div className="metric-caption">{caption}</div>
  </Card>;
}

function PanelHead({ title, text, action }) {
  return <div className="panel-head"><div><h3>{title}</h3>{text && <p>{text}</p>}</div>{action}</div>;
}

function RowIcon({ icon: Icon = FileText }) {
  return <span className="row-icon"><Icon aria-hidden="true" /></span>;
}

export function ResultsTable({ results, onOpen, compact = false }) {
  if (!results.length) return <p className="empty-line">Completed tests and their respective indexes will be here.</p>;
  return <div className="table-scroll"><table className="data-table history-table">
    <thead><tr><th scope="col">Test form</th>{!compact && <th scope="col">Completed</th>}<th scope="col">SAT</th><th scope="col">IQ eq.</th>{!compact && <th scope="col">Percentile</th>}<th scope="col"><span className="sr-only">Open</span></th></tr></thead>
    <tbody>{results.map((result) => <tr key={result.id}>
      <th scope="row"><div className="test-cell"><RowIcon /><div><strong>{result.title}</strong><small>{result.form.code}{compact ? " · " + result.date : ""}{result.sample ? " · Sample" : ""}</small></div></div></th>
      {!compact && <td className="mono muted">{result.date}</td>}<td className="mono">{num(result.partial ? result.sections[0]?.scaled : result.total)}</td><td className="mono">{iqText(result.partial ? result.sections[0] : result)}</td>
      {!compact && <td className="mono">{ordinal(result.partial ? result.sections[0]?.percentile : result.percentile)}</td>}
      <td><Button className="icon-button" variant="ghost" aria-label={"View result for " + result.title} onClick={() => onOpen(result.id)}><ChevronRight /></Button></td>
    </tr>)}</tbody>
  </table></div>;
}

export function Dashboard({ results, state, onStart, onOpen, navigate }) {
  const latest = results.find((result) => result.total != null);
  const previous = results.filter((result) => result.total != null)[1];
  const delta = previous && latest ? latest.total - previous.total : null;
  const iqCaption = !latest ? "Available after atleast 1 test is done" : latest.iqCeiling != null ? "Below the supplied table range" : "Unofficial combined-score estimate";
  const savedForm = state.forms.find((form) => state.attempts[form.id]);
  const savedItems = savedForm ? questionsFor(savedForm) : [];
  const answered = savedItems.filter((item, i) => !item.excluded && state.attempts[savedForm.id].answers[i] != null).length;
  const total = savedItems.filter((item) => !item.excluded).length;

  return <>
    <PageHead title="Dashboard" compact />
    <div className="metric-grid">
      <Metric label="Latest SAT score" value={num(latest?.total)} caption={delta == null ? "Combined verbal and math" : (delta > 0 ? "+" : "") + delta + " pts vs. previous test"} icon={Activity} />
      <Metric label="FSIQ equivalent" value={iqText(latest)} caption={iqCaption} icon={Target} />
      <Metric label="Percentile rank" value={<CountingNumber value={latest?.percentile} format={ordinal} />} caption="Derived from IQ" icon={ChartNoAxesCombined} />
      <Metric label="Tests completed" value={num(results.filter((result) => !result.partial).length)} caption={Object.keys(state.attempts).length + " in progress"} icon={ListChecks} />
    </div>
    <h2 className="section-heading">Score statistics</h2>
    <div className="panels-split">
      <Card className="panel distribution-panel">
        <PanelHead title="Population distribution" text="Percentile bands" action={<Button className="quiet-button" onClick={() => navigate("bands")}>View bands <ChevronRight /></Button>} />
        <Distribution iq={latest?.iq} />
      </Card>
      <Card className="panel percentile-panel">
        <PanelHead title="FSIQ percentile" text="" />
        <Gauge score={latest} animate />
        <div className="gauge-footer" role="group" aria-label="Index IQ estimates">
          {[["Math", "Math IQ"], ["Verbal", "English (Verbal) IQ"]].map(([index, label]) => {
            const result = results.find((item) => item.sections.some((section) => section.name === index && section.scaled != null));
            const score = result?.sections.find((section) => section.name === index);
            return <span key={index}><small>{label}</small><strong className="mono">{iqText(score)}</strong>
              <small>{score?.scaled != null ? num(score.scaled) + " scaled SAT · " + result.title : "No verified index score yet"}</small></span>;
          })}
        </div>
        <p className="fine-print"></p>
        <div className="gauge-footer"><span><small>Scoring status</small><strong>{latest ? "Verified scale" : "No combined score"}</strong></span>
          <Button className="quiet-button" onClick={() => navigate("bands")}>View bands <ChevronRight /></Button>
        </div>
      </Card>
    </div>
    <h2 className="section-heading">Your tests</h2>
    <div className="panels-split">
      <Card className="panel recent-panel"><PanelHead title="Recent results" text="View scores and results." action={<Button className="quiet-button" onClick={() => navigate("history")}>View all <ChevronRight /></Button>} />
        <ResultsTable results={results.slice(0, 3)} onOpen={onOpen} compact />
      </Card>
      <Card className="panel current-panel">
        <PanelHead title="Continue a test" text="Starts from your last saved question(s)." />
        {savedForm ? <>
          <div className="test-cell current-form"><RowIcon icon={BookOpen} /><div><strong>{savedForm.title}</strong><small>{savedForm.code} · Practice test</small></div></div>
          <div className="progress-label"><span>Progress</span><strong className="mono">{answered} / {total} answered</strong></div>
          <progress value={answered} max={total} aria-label="Questions answered" />
          <Button onClick={() => onStart(savedForm.id)} className="full-button">Resume test <ArrowRight /></Button>
        </> : <Button onClick={() => navigate("tests")} className="full-button">Browse tests <ArrowRight /></Button>}
      </Card>
    </div>
    <footer className="summary-footer"><div><strong className="mono">{num(latest?.total)}</strong><span>Latest SAT</span></div><div><strong className="mono">{iqText(latest)}</strong><span>FSIQ equivalent</span></div><div><strong className="mono">{ordinal(latest?.percentile)}</strong><span>Population percentile</span></div><p> <button className="text-button" onClick={() => navigate("reference")}> </button></p></footer>
  </>;
}

function AuthenticityPanel({ form, audit }) {
  const state = audit?.status ?? "review";
  const label = state === "review" && audit?.scoringApproval?.status === "approved" ? "Scoring approved" : { verified: "Verified", review: "Review required", blocked: "Blocked" }[state];
  const rows = [
    ["Question transcription", audit?.transcription],
    ["Answer-key matching", audit?.key],
    ["Scoring validation", audit?.scale],
  ];
  return <details className="authenticity-details">
    <summary><ChevronRight aria-hidden="true" />Authenticity validation</summary>
    <div className="authenticity-panel" data-audit-status={state}>
      <div className="authenticity-heading"><strong>{form.title}</strong><span className="authenticity-badge">{label}</span></div>
      <p className="fine-print">{audit ? "Source audit coverage" : "Local practice form · awaiting source verification"}</p>
      {audit?.note && <p className="fine-print">{audit.note}</p>}
      {audit?.period && <p className="fine-print">Historical period confirmed from the {Math.max(...audit.period.copyrightYears)} publisher copyright, source page {audit.period.sourcePage}. Exact administration date is unconfirmed.</p>}
      {audit?.approvedCorrections?.map((correction) => <p className="fine-print" key={correction.sourcePage}>{correction.reason}</p>)}
      {rows.map(([name, count]) => {
        const percent = count?.total ? Math.floor(100 * count.checked / count.total) : null;
        return <div className="authenticity-check" key={name}>
          <div className="authenticity-heading"><span>{name}</span><span className="mono">{percent == null ? "—" : percent + "%"}</span></div>
          <progress aria-label={name} max={count?.total || 1} value={count?.checked ?? 0} />
        </div>;
      })}
      <div className="authenticity-heading authenticity-total"><span>Unresolved discrepancies</span><strong className="mono">{num(audit?.unresolved)}</strong></div>
    </div>
  </details>;
}

export function Tests({ state, onStart, onDiscard }) {
  const [group, setGroup] = useState("");
  const sourceIds = new Set(referenceCatalog.sources.filter((source) => source.group === group).map((source) => source.id));
  const forms = state.forms.filter((form) => !group || form.citations?.some((citation) => sourceIds.has(citation.sourceId)));
  return <>
    <PageHead title="Test library" />
    <Card className="panel">
      <PanelHead title="Available forms" text={forms.length + " available"} action={<select aria-label="Filter by source" value={group} onChange={(event) => setGroup(event.target.value)}><option value="">All sources</option>{referenceGroups.map((name) => <option key={name}>{name}</option>)}</select>} />
      {forms.map((form) => {
        const attempt = state.attempts[form.id];
        const items = questionsFor(form);
        const audit = authenticity(form);
        const count = items.filter((item, i) => !item.excluded && attempt?.answers[i] != null).length;
        const total = items.filter((item) => !item.excluded).length;
        return <div className="library-entry" key={form.id}><div className="library-row">
          <div className="test-cell"><RowIcon /><div><strong>{form.title}</strong><small>{form.code} · {form.indexes.join(" + ")} · <span className="mono">{total}</span> questions</small>
            {form.citations?.map((citation) => <small key={citation.sourceId} className="file-summary">{citation.label} · PDF pages {citation.questionPages}</small>)}
            {form.files && <small className="file-summary">{form.files.join(" · ")}</small>}</div></div>
          <span className={"status " + (attempt ? "active-status" : "")}>{audit?.status === "blocked" ? "Blocked" : attempt ? <><span className="mono">{count}/{total}</span> answered</> : scoringFor(form, items) ? audit?.status === "verified" ? "Verified scoring" : "Scored practice" : form.library ? "Unscored practice" : "Ready"}</span>
          <div className="row-actions">
            {attempt && <Button variant="ghost" aria-label={"Discard attempt for " + form.title} onClick={() => onDiscard(form.id)}>Discard</Button>}
            <Button disabled={audit?.status === "blocked"} onClick={() => onStart(form.id)}>{attempt ? "Resume" : "Start test"} <ArrowRight /></Button>
          </div>
        </div><AuthenticityPanel form={form} audit={audit} /></div>;
      })}
      {!forms.length && <p className="empty-line">No practice forms in this group.</p>}
    </Card>
  </>;
}

export function History({ results, onOpen }) {
  return <>
    <PageHead title="Recent results"/>
    <Card className="panel">
      <PanelHead title="Completed tests and indexes" />
      <ResultsTable results={results} onOpen={onOpen} />
    </Card>
  </>;
}

export function Breakdown({ result, onBack }) {
  const [selectedIndex, setSelectedIndex] = useState("All");
  const items = questionsFor(result.form);
  const completed = result.sections.map(({ name }) => name);
  const graded = result.scored || !result.form.library;
  const score = result.partial ? result.sections[0]?.scaled : result.total;
  const estimate = result.partial ? result.sections[0] : result;
  return <>
    <PageHead title={result.title} description={result.form.code + (result.scored ? authenticity(result.form)?.status === "verified" ? " · Verified scoring" : " · Scored practice · unidentified form" : " · Practice result")} action={<Button onClick={onBack}><ArrowLeft /> Recent results</Button>} />
    <div className="metric-grid result-metrics">
      <Metric label={result.partial ? completed[0] + " scaled SAT" : "Scaled SAT"} value={num(score)} caption={result.scored ? "Adjusted for blank answers" : "Requires verified scoring"} icon={Activity} />
      <Metric label={result.partial ? completed[0] + " IQ estimate" : "FSIQ equivalent"} value={iqText(estimate)} caption={!result.scored ? "Requires verified scoring" : estimate?.iqCeiling != null ? "Below the supplied table range" : result.partial ? "Unofficial estimate from the subtest norms" : "Unofficial combined-score estimate"} icon={Target} />
      <Metric label="Percentile rank" value={ordinal(estimate?.percentile)} caption={result.partial ? "From the index IQ estimate" : "From the FSIQ estimate"} icon={ChartNoAxesCombined} />
    </div>
    <Card className="panel page-panel">
      <PanelHead title="Response summary" text={result.scored ? "Form-specific scoring resource " + result.scoringVersion + ". Wrong totals include blank answers." : graded ? "Right and wrong counts use the local practice key. Blanks count as wrong when a key is available." : "Your answers are saved for unscored practice."} />
      <div className="table-scroll"><table className="data-table">
        <thead><tr>{(result.scored ? ["Index", "Right", "Wrong", "Blank", "Raw score", "Scaled SAT"] : graded ? ["Index", "Right", "Wrong", "Blank", "Ungraded"] : ["Index", "Answered", "Blank"]).map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{result.sections.map((section) => <tr key={section.name}><th scope="row">{section.name}</th>
          {(result.scored ? [section.right, section.wrong, section.omitted, section.raw, section.scaled] : graded ? [section.right, section.wrong, section.omitted, section.ungraded] : [section.ungraded, section.omitted]).map((value, i) => <td className="mono" key={i}>{num(value)}</td>)}
        </tr>)}</tbody>
      </table></div>
      {result.scored && <p className="fine-print">Original worksheet scoring gives blank answers zero points. {result.sections.map(({ name, original }) => name + " " + original.raw + " raw and " + original.scaled + " scaled").join(" · ")}</p>}
      <ScoringPages form={result.form} />
    </Card>
    <Card className="panel page-panel">
      <PanelHead title="Answer review" text="Review your responses in printed question order." action={<select aria-label="Filter answers by index" value={selectedIndex} onChange={(event) => setSelectedIndex(event.target.value)}>{["All", ...completed].map((index) => <option key={index}>{index}</option>)}</select>} />
      {items.map((question, i) => {
        if (question.excluded || !completed.includes(question.index) || (selectedIndex !== "All" && question.index !== selectedIndex)) return null;
        const selected = result.answers[i];
        const key = result.keys[i];
        const Icon = key == null ? CircleHelp : selected === key ? Check : X;
        return <div key={i} className="answer-review">
          <span className="question-number mono">{String(i + 1).padStart(2, "0")}</span>
          <div><strong>{question.prompt}</strong><small>Your answer: {question.choices[selected] ?? "Blank"}{graded && " · Key: " + (question.choices[key] ?? "Unavailable")}</small></div>
          <span className="status"><Icon /> {key == null ? selected == null ? "Blank" : "Ungraded" : selected === key ? "Correct" : selected == null ? "Blank · Incorrect" : "Incorrect"}</span>
        </div>;
      })}
    </Card>
  </>;
}

export function Bands({ results, initialResultId = "" }) {
  const [index, setIndex] = useState(null);
  const [resultId, setResultId] = useState(initialResultId);
  const result = results.find(({ id }) => id === resultId) ?? results[0];
  const names = result ? result.sections.map(({ name }) => name) : indexes;
  const available = result?.partial ? names : ["Combined", ...names];
  const displayed = available.includes(index) ? index : available[0];
  const combined = displayed === "Combined";
  const selected = combined ? result : result?.sections.find(({ name }) => name === displayed);
  return <>
    <PageHead title="Percentile bands" description="Total FSIQ is mapped onto its percentile. The mean is 100 with a standard deviation of 15" />
    <div className="page-toolbar">
      <select aria-label="Choose result" value={result?.id ?? ""} onChange={(event) => { setResultId(event.target.value); setIndex(null); }}>{results.length ? results.map((item) => <option value={item.id} key={item.id}>{item.title}{item.date && " · " + item.date}</option>) : <option value="">No completed tests</option>}</select>
      <div className="segmented" aria-label="Score index">{available.map((name) => <Button key={name} variant="ghost" aria-pressed={displayed === name} onClick={() => setIndex(name)}>{name}</Button>)}</div>
    </div>
    <div className="panels-split bands-grid">
      <Card className="panel">{!combined && selected?.scaled != null
        ? <><PanelHead title={displayed + " scaled score"} text="Placement on the original SAT index scale." /><IndexScale score={selected.scaled} /></>
        : <><PanelHead title="Population distribution" text="" /><Distribution iq={selected?.iq} /></>}</Card>
      <Card className="panel percentile-panel"><PanelHead title={combined ? "FSIQ equivalent" : displayed + " IQ estimate"} text={combined ? "" : ""} /><Gauge score={selected} /><div className="gauge-footer"><span><strong className="mono">{num(combined ? selected?.total : selected?.scaled)}</strong><small>Scaled SAT</small></span><span><strong className="mono">{ordinal(selected?.percentile)}</strong><small>Percentile</small></span></div></Card>
    </div>
    {result && <Card className="panel page-panel"><PanelHead title="Index comparison" text="Select an index above to see its placement in the same distribution." />
      <div className="table-scroll"><table className="data-table"><thead><tr>{["Index", "Scaled SAT", "IQ equivalent", "Percentile"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{(result.partial ? result.sections : [{ ...result, name: "Combined", scaled: result.total }, ...result.sections]).map((row) => <tr key={row.name}><th scope="row">{row.name}</th><td className="mono">{num(row.scaled)}</td><td className="mono">{iqText(row)}</td><td className="mono">{ordinal(row.percentile)}</td></tr>)}</tbody>
      </table></div>
    </Card>}
  </>;
}

export function Reference() {
  return <>
    <PageHead title="Scoring reference" />
    <Card className="panel">
      <PanelHead title="Scoring status" text="Historical scores require completed source, question, answer-key and form-specific scoring checks. The library’s authenticity panel shows these checks and any approved source exceptions." />
      <p className="fine-print">Adjusted scores apply the form’s wrong-answer penalty to blanks. Results also record the original worksheet calculation, which gives blanks zero points.</p>
      <p className="fine-print">Each index uses its own IQ norms from 200 to 800. The composite adds the Verbal and Math scaled SAT scores before looking up the total in the separate composite table. Composite scores below 600 display &lt;89. Between composite rows, estimates use linear interpolation.</p>
      <p className="fine-print">AI was used to sort through and digitalize each question and match each form with its appropriate PDFs, including its questions, answer key, and scaled score conversions. There are 5,359 questions in 37 verified forms extensively checked with both AI and human review.</p>
    </Card>
    <Card className="panel page-panel">
      <PanelHead title="Source catalog" text={referenceCatalog.sources.length + " supplied PDFs · Catalog version " + referenceCatalog.version} />
      {referenceCatalog.sources.map((source) => {
        const forms = [...referenceCatalog.forms, ...(referenceCatalog.practiceForms ?? [])].filter((form) => source.formIds.includes(form.id));
        return <details className="scoring-source" key={source.id}>
          <summary>{source.title ?? source.label}{source.year ? " (" + source.year + ")" : ""}{!source.referenceFile && " · " + forms.length + (forms.length === 1 ? " form" : " forms")}</summary>
          <p className="fine-print">{source.filename} · {source.pages} source pages</p>
          {source.note && <p className="fine-print">{source.note}</p>}
          <p className="fine-print source-hash">SHA-256 <code>{source.sha256}</code></p>
          {forms.map((form) => {
            const citation = form.citations.find((item) => item.sourceId === source.id);
            return <div key={form.id} className="answer-review source-form">
              <div><strong>{form.title}</strong><small>{citation.label} · Question pages {citation.questionPages}</small>
                <small>{citation.scoringPages.map(({ number, label }) => label + " p. " + number).join(" · ")}</small>
              </div>
              <div>
                {citation !== form.citations[0] && <p className="fine-print">Scoring viewer uses the matching {form.citations[0].label} copy.</p>}
                <ScoringPages form={form} />
              </div>
            </div>;
          })}
          {source.referenceFile && <ReferenceViewer source={source} />}
        </details>;
      })}
    </Card>
  </>;
}

export function Settings({ preferences, onPreferences, onReset }) {
  return <>
    <PageHead title="Settings" description="Manage progress stored in this browser." />
    <Personalization preferences={preferences} onChange={onPreferences} />
    <Card className="panel page-panel"><PanelHead title="Local progress" text="Saved PDFs, answers, and completed attempts are stored on this device." />
      <div className="library-row"><div className="test-cell"><RowIcon icon={RotateCcw} /><div><strong>Reset progress</strong><small>Clear results, saved attempts, and added forms.</small></div></div>
        <Button onClick={onReset}>Reset progress</Button>
      </div>
    </Card>
  </>;
}

function QuestionSource({ form, item }) {
  const [open, setOpen] = useState(false);
  return <details className="question-source" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Check original scan</summary>
    {open && <PaperQuestion form={form} item={item} />}
  </details>;
}

function SectionTimer({ endsAt }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, []);
  const seconds = Math.min(1800, Math.max(0, Math.ceil((endsAt - now) / 1000)));
  return <span className="section-timer mono" role="timer" aria-label="Time remaining in section">
    {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
  </span>;
}

export function Quiz({ form, items, sections, slot, attempt, fullscreen, onFullscreen, onAnswer, onCursor, onSection, onExit, onFinish, onDiscard }) {
  const [pack, setPack] = useState(undefined);
  useEffect(() => {
    if (!form.library) return;
    let live = true;
    loadQuestionPack(form.id).then((value) => { if (live) setPack(value); })
      .catch(() => { if (live) setPack(null); });
    return () => { live = false; };
  }, [form.id, form.library]);
  const cursor = attempt.cursor;
  const item = items[cursor];
  const current = sections[slot];
  const offered = items.flatMap((question, i) => question.excluded ? [] : [i]);
  const sectionQuestions = offered.filter((i) => i >= current.start && i < current.end);
  const position = sectionQuestions.indexOf(cursor);
  const previous = sectionQuestions[position - 1];
  const next = sectionQuestions[position + 1];
  const count = offered.filter((i) => attempt.answers[i] != null).length;
  const chosen = attempt.answers[cursor];
  const loading = form.library && pack === undefined;
  const entry = pack?.questions[cursor];
  const digital = entry?.prompt && entry?.choices ? entry : null;
  const sourceItem = entry ? { ...item, page: entry.page } : item;
  return <>
    <PageHead title={form.title} description={form.library ? form.citations[0].label + (scoringFor(form, items) ? authenticity(form)?.status === "verified" ? " · Verified scoring" : " · Scored practice" : " · Unscored practice") : "Original PDF · Practice quiz"} action={<div className="row-actions"><Button onClick={onFullscreen} aria-pressed={fullscreen}>{fullscreen ? <Minimize /> : <Maximize />}{fullscreen ? "Exit fullscreen" : "Fullscreen"}</Button><Button onClick={onExit}>Save & exit <ArrowRight /></Button></div>} />
    <div className="panels-split quiz-layout">
      <Card className="panel question-card">
        <div className="question-meta"><span className="status">{item.index}</span><SectionTimer endsAt={attempt.endsAt} /><span className="mono muted">Question {offered.indexOf(cursor) + 1} / {offered.length}</span></div>
        <h2>{item.prompt}</h2>
        {loading ? <p className="question-loading" role="status">Loading questions…</p> : <>
          {digital ? <QuestionContent key={"question-" + cursor} question={digital} images={pack.images} /> : form.library ? <p className="fine-print">This question’s transcription needs review. You can check the source or move to another question.</p> : <>
            {item.passage && <blockquote>{item.passage}</blockquote>}
            {item.page && <>
              <PaperQuestion key={item.section ?? item.page} form={form} item={sourceItem} />
            </>}
          </>}
          {(digital || !form.library) && <AnswerOptions choices={digital?.choices ?? (item.page ? item.choices.map(() => null) : item.choices)}
            chosen={chosen} onAnswer={onAnswer} />}
          {form.library && <QuestionSource key={"source-" + cursor} form={form} item={sourceItem} />}
        </>}
        <div className="quiz-controls"><Button onClick={() => onCursor(previous)} disabled={previous == null}><ArrowLeft /> Previous</Button>
          {chosen != null && <Button variant="ghost" onClick={() => onAnswer(null)}>Clear answer</Button>}
          {next != null ? <Button variant="primary" onClick={() => onCursor(next)}>Next <ArrowRight /></Button> : <Button variant="primary" onClick={onFinish}>Submit section <Check /></Button>}
        </div>
      </Card>
      <Card className="panel quiz-progress"><PanelHead title="Test progress" text="Finish the first section of an index to unlock its second section." />
        <div className="progress-label"><span>Answered</span><strong className="mono">{count} / {offered.length}</strong></div>
        <progress value={count} max={offered.length} aria-label="Questions answered" />
        {sections.length > 1 && <select className="section-picker" aria-label="Go to section" value={slot} onChange={(event) => onSection(Number(event.target.value))}>
          {sections.map((section, i) => <option key={i} value={i} disabled={!canOpen(sections, attempt.completed, i)}>
            {form.library ? "Section " + section.number + " · " : ""}{section.index}{attempt.completed.includes(i) ? " · Completed" : canOpen(sections, attempt.completed, i) ? "" : " · Locked"}
          </option>)}
        </select>}
        <div className="question-nav">{sectionQuestions.map((i) => {
          const number = form.library ? items[i].number : i + 1;
          const answered = attempt.answers[i] != null;
          return <Button key={i} onClick={() => onCursor(i)} aria-current={cursor === i ? "step" : undefined} aria-label={"Question " + number + (answered ? ", answered" : ", unanswered")} className={"mono " + (answered ? "answered" : "")}>{number}</Button>;
        })}</div>
        <Button className="full-button" onClick={onFinish}><Check /> Finish section</Button>
        <Button className="full-button" variant="ghost" onClick={onDiscard}>Discard attempt</Button>
      </Card>
    </div>
  </>;
}

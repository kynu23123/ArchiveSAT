import React, { useState } from "react";
import { Activity, ArrowLeft, ArrowRight, BookOpen, ChartNoAxesCombined, Check, ChevronRight, CircleHelp, FileText, ListChecks, Plus, RotateCcw, ScanLine, Target, X } from "lucide-react";
import { Button, Card } from "./ui.jsx";
import { CountingNumber, Distribution, Gauge, num } from "./charts.jsx";
import { indexes, ordinal, questionsFor, satToIq, scoringProfiles } from "./data.js";
import { PaperQuestion, ScoringPages } from "./papers.jsx";
import { Personalization } from "./personalization.jsx";

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
  if (!results.length) return <p className="empty-line">Completed tests will appear here.</p>;
  return <div className="table-scroll"><table className="data-table history-table">
    <thead><tr><th scope="col">Test form</th>{!compact && <th scope="col">Completed</th>}<th scope="col">SAT</th><th scope="col">IQ eq.</th>{!compact && <th scope="col">Percentile</th>}<th scope="col"><span className="sr-only">Open</span></th></tr></thead>
    <tbody>{results.map((result) => <tr key={result.id}>
      <th scope="row"><div className="test-cell"><RowIcon /><div><strong>{result.form.title}</strong><small>{result.form.code}{compact ? " · " + result.date : ""}{result.sample ? " · Sample" : ""}</small></div></div></th>
      {!compact && <td className="mono muted">{result.date}</td>}<td className="mono">{num(result.total)}</td><td className="mono">{num(result.iq)}</td>
      {!compact && <td className="mono">{ordinal(result.percentile)}</td>}
      <td><Button className="icon-button" variant="ghost" aria-label={"View result for " + result.form.title} onClick={() => onOpen(result.id)}><ChevronRight /></Button></td>
    </tr>)}</tbody>
  </table></div>;
}

export function Dashboard({ results, state, onAdd, onStart, onOpen, navigate }) {
  const latest = results.find((result) => result.total != null);
  const previous = results.filter((result) => result.total != null)[1];
  const delta = previous && latest ? latest.total - previous.total : null;
  const savedForm = state.forms.find((form) => state.attempts[form.id]);
  const answered = savedForm ? Object.keys(state.attempts[savedForm.id].answers).length : 0;
  const total = savedForm ? questionsFor(savedForm).length : 0;

  return <>
    <PageHead title="Dashboard" compact action={<Button variant="primary" onClick={onAdd}><Plus /> Add test</Button>} />
    <div className="metric-grid">
      <Metric label="Latest SAT score" value={num(latest?.total)} caption={delta == null ? "Combined verbal and math" : (delta > 0 ? "+" : "") + delta + " pts vs. previous test"} icon={Activity} />
      <Metric label="FSIQ equivalent" value={num(latest?.iq)} caption="Historical SAT conversion" icon={Target} />
      <Metric label="Percentile rank" value={<CountingNumber value={latest?.percentile} format={ordinal} />} caption="Illustrative population rank" icon={ChartNoAxesCombined} />
      <Metric label="Tests completed" value={num(results.length)} caption={Object.keys(state.attempts).length + " in progress"} icon={ListChecks} />
    </div>
    <h2 className="section-heading">Score statistics</h2>
    <div className="panels-split">
      <Card className="panel distribution-panel">
        <PanelHead title="Population distribution" text="Percentile bands for the latest combined score." action={<Button className="quiet-button" onClick={() => navigate("bands")}>View bands <ChevronRight /></Button>} />
        <Distribution iq={latest?.iq} />
      </Card>
      <Card className="panel percentile-panel">
        <PanelHead title="FSIQ percentile" text="Combined score against reference bands." />
        <Gauge iq={latest?.iq} rank={latest?.percentile} animate />
        <div className="gauge-footer"><span><strong className="mono">{latest?.iq == null ? "—" : (latest.iq - 5) + "–" + (latest.iq + 5)}</strong><small>Demo range (±5)</small></span>
          <Button className="quiet-button" onClick={() => navigate("bands")}>View bands <ChevronRight /></Button>
        </div>
      </Card>
    </div>
    <h2 className="section-heading">Your tests</h2>
    <div className="panels-split">
      <Card className="panel recent-panel"><PanelHead title="Recent results" text="Review section scores and answer breakdowns." action={<Button className="quiet-button" onClick={() => navigate("history")}>View all <ChevronRight /></Button>} />
        <ResultsTable results={results.slice(0, 3)} onOpen={onOpen} compact />
      </Card>
      <Card className="panel current-panel">
        <PanelHead title="Continue a test" text="Pick up from your last saved question." />
        {savedForm ? <>
          <div className="test-cell current-form"><RowIcon icon={BookOpen} /><div><strong>{savedForm.title}</strong><small>{savedForm.code} · Practice test</small></div></div>
          <div className="progress-label"><span>Progress</span><strong className="mono">{answered} / {total} answered</strong></div>
          <progress value={answered} max={total} aria-label="Questions answered" />
          <Button onClick={() => onStart(savedForm.id)} className="full-button">Resume test <ArrowRight /></Button>
        </> : <Button onClick={() => navigate("tests")} className="full-button">Browse tests <ArrowRight /></Button>}
      </Card>
    </div>
    <footer className="summary-footer"><div><strong className="mono">{num(latest?.total)}</strong><span>Latest scaled SAT</span></div><div><strong className="mono">{num(latest?.iq)}</strong><span>FSIQ equivalent</span></div><div><strong className="mono">{ordinal(latest?.percentile)}</strong><span>Population percentile</span></div><p>Sample scores are included in this workspace. <button className="text-button" onClick={() => navigate("reference")}>See scoring reference <ArrowRight /></button></p></footer>
  </>;
}

export function Tests({ state, onAdd, onStart, onDiscard }) {
  return <>
    <PageHead title="Test library" description="Start a sample quiz or resume a saved attempt." action={<Button variant="primary" onClick={onAdd}><Plus /> Add test</Button>} />
    <Card className="panel">
      <PanelHead title="Available forms" text="Imported papers and built-in practice forms." />
      {state.forms.map((form) => {
        const attempt = state.attempts[form.id];
        const count = Object.keys(attempt?.answers ?? {}).length;
        return <div className="library-row" key={form.id}>
          <div className="test-cell"><RowIcon /><div><strong>{form.title}</strong><small>{form.code} · {form.indexes.join(" + ")} · <span className="mono">{questionsFor(form).length}</span> questions</small>
            {form.files && <small className="file-summary">{form.files.join(" · ")}</small>}</div></div>
          <span className={"status " + (attempt ? "active-status" : "")}>{attempt ? <><span className="mono">{count}/{questionsFor(form).length}</span> answered</> : "Ready"}</span>
          <div className="row-actions">
            {attempt && <Button variant="ghost" aria-label={"Discard attempt for " + form.title} onClick={() => onDiscard(form.id)}>Discard</Button>}
            <Button onClick={() => onStart(form.id)}>{attempt ? "Resume" : "Start test"} <ArrowRight /></Button>
          </div>
        </div>;
      })}
      {!state.forms.length && <p className="empty-line">Add a form to try the sample quiz.</p>}
    </Card>
  </>;
}

export function History({ results, onOpen }) {
  const [filter, setFilter] = useState("all");
  const visible = filter === "practice" ? results.filter((result) => !result.sample) : filter === "sample" ? results.filter((result) => result.sample) : results;
  return <>
    <PageHead title="Recent results" description="Review completed tests, scores, and answers." />
    <Card className="panel">
      <PanelHead title="Completed tests" action={<select aria-label="Filter results" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All results</option><option value="practice">My attempts</option><option value="sample">Sample results</option></select>} />
      <ResultsTable results={visible} onOpen={onOpen} />
    </Card>
  </>;
}

export function Breakdown({ result, onBack, navigate }) {
  const [selectedIndex, setSelectedIndex] = useState("All");
  const items = questionsFor(result.form);
  return <>
    <PageHead title={result.form.title} description={result.form.code + " · " + (result.sample ? "Seeded sample result" : "Quiz result")} action={<Button onClick={onBack}><ArrowLeft /> Recent results</Button>} />
    <div className="metric-grid result-metrics">
      <Metric label="Scaled SAT" value={num(result.total)} caption={result.form.paperPages ? "Scoring scale unavailable" : result.total == null ? "Requires both indexes" : "Verbal plus math"} icon={Activity} />
      <Metric label="FSIQ equivalent" value={num(result.iq)} caption={result.total != null && result.iq == null ? "Outside the supplied table" : "Historical conversion table"} icon={Target} />
      <Metric label="Percentile rank" value={ordinal(result.percentile)} caption="Illustrative population rank" icon={ChartNoAxesCombined} />
    </div>
    <Card className="panel page-panel">
      <PanelHead title="Index scores" text={result.form.paperPages ? "Right and wrong counts use the verified key. Answers without a key are ungraded." : result.sample ? "Seeded scaled scores illustrate the display. Raw counts come from sample answers." : "Raw scores use the selected form’s sample scoring profile."} action={<Button onClick={() => navigate("bands", result.id)}>Percentile bands <ChevronRight /></Button>} />
      <div className="table-scroll"><table className="data-table">
        <thead><tr>{(result.form.paperPages ? ["Index", "Right", "Wrong", "Omitted", "Ungraded"] : ["Index", "Right", "Wrong", "Omitted", "Raw", "Rounded", "Scaled", "IQ eq.", "Percentile"]).map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{result.sections.map((section) => <tr key={section.name}><th scope="row">{section.name}</th>
          {(result.form.paperPages ? [section.right, section.wrong, section.omitted, section.ungraded] : [section.right, section.wrong, section.omitted, Number(section.raw.toFixed(2)), section.rounded, section.scaled, section.iq, ordinal(section.percentile)]).map((value, i) => <td className="mono" key={i}>{value ?? "—"}</td>)}
        </tr>)}</tbody>
      </table></div>
      {result.form.paperPages ? <ScoringPages form={result.form} /> : <p className="fine-print">Index IQ equivalents use illustrative section mappings. The supplied conversion table covers the combined SAT score.</p>}
    </Card>
    <Card className="panel page-panel">
      <PanelHead title="Answer review" text="Compare your responses with the answer key." action={<select aria-label="Filter answers by index" value={selectedIndex} onChange={(event) => setSelectedIndex(event.target.value)}>{["All", ...result.form.indexes].map((index) => <option key={index}>{index}</option>)}</select>} />
      {items.map((question, i) => {
        if (selectedIndex !== "All" && question.index !== selectedIndex) return null;
        const selected = result.answers[i];
        const Icon = selected == null || question.key == null ? CircleHelp : selected === question.key ? Check : X;
        return <div key={i} className="answer-review">
          <span className="question-number mono">{String(i + 1).padStart(2, "0")}</span>
          <div><strong>{question.prompt}{question.page ? " · Paper page " + question.page : ""}</strong><small>Your answer: {question.choices[selected] ?? "Omitted"} · Key: {question.choices[question.key] ?? "Unavailable"}</small></div>
          <span className="status"><Icon /> {selected == null ? "Omitted" : question.key == null ? "Ungraded" : selected === question.key ? "Correct" : "Incorrect"}</span>
        </div>;
      })}
    </Card>
  </>;
}

export function Bands({ results, initialResultId = "" }) {
  const [index, setIndex] = useState("Combined");
  const [resultId, setResultId] = useState(initialResultId);
  const result = results.find(({ id }) => id === resultId) ?? results.find((item) => item.total != null) ?? results[0];
  const selected = index === "Combined" ? result : result?.sections.find(({ name }) => name === index);
  return <>
    <PageHead title="Percentile bands" description="Explore the combined score and individual indexes against an illustrative population model." />
    <div className="page-toolbar">
      <select aria-label="Choose result" value={result?.id ?? ""} onChange={(event) => setResultId(event.target.value)}>{results.length ? results.map((item) => <option value={item.id} key={item.id}>{item.form.title} · {item.date}{item.sample ? " · Sample" : ""}</option>) : <option value="">No completed tests</option>}</select>
      <div className="segmented" aria-label="Score index">{["Combined", ...indexes].map((name) => <Button key={name} variant="ghost" aria-pressed={index === name} onClick={() => setIndex(name)}>{name}</Button>)}</div>
    </div>
    <div className="panels-split bands-grid">
      <Card className="panel"><PanelHead title="Population distribution" text="Illustrative normal model with mean 100 and standard deviation 15." /><Distribution iq={selected?.iq} /></Card>
      <Card className="panel percentile-panel"><PanelHead title={index === "Combined" ? "FSIQ equivalent" : index + " IQ equivalent"} text={index === "Combined" ? "Historical combined-score conversion." : "Illustrative index conversion."} /><Gauge iq={selected?.iq} rank={selected?.percentile} /><div className="gauge-footer"><span><strong className="mono">{num(index === "Combined" ? selected?.total : selected?.scaled)}</strong><small>Scaled SAT</small></span><span><strong className="mono">{ordinal(selected?.percentile)}</strong><small>Percentile</small></span></div></Card>
    </div>
    {result && <Card className="panel page-panel"><PanelHead title="Index comparison" text="Select an index above to see its placement in the same distribution." />
      <div className="table-scroll"><table className="data-table"><thead><tr>{["Index", "Scaled SAT", "IQ equivalent", "Percentile"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{[{ name: "Combined", scaled: result.total, iq: result.iq, percentile: result.percentile }, ...result.sections].map((row) => <tr key={row.name}><th scope="row">{row.name}</th><td className="mono">{num(row.scaled)}</td><td className="mono">{num(row.iq)}</td><td className="mono">{ordinal(row.percentile)}</td></tr>)}</tbody>
      </table></div>
    </Card>}
  </>;
}

export function Reference() {
  const profile = scoringProfiles.sample;
  return <>
    <PageHead title="Scoring reference" description="The sample scoring profile and shared historical SAT conversion table." />
    <div className="panels-split">
      <Card className="panel"><PanelHead title="Shared SAT-to-IQ table" text="Historical column supplied with the brief. Values between rows are linearly interpolated and rounded." />
        <table className="data-table"><thead><tr><th scope="col">Combined SAT</th><th scope="col">IQ equivalent</th></tr></thead>
          <tbody>{[...satToIq].reverse().map(([sat, iq]) => <tr key={sat}><td className="mono">{num(sat)}</td><td className="mono">{iq}</td></tr>)}</tbody></table>
      </Card>
      <Card className="panel"><PanelHead title={profile.label} text="The worksheet is an example for form-specific scoring." />
        <dl className="reference-list"><div><dt>Correct</dt><dd className="mono">+1</dd></div><div><dt>Incorrect, 5 choices</dt><dd className="mono">−¼</dd></div><div><dt>Incorrect, 4 choices</dt><dd className="mono">−⅓</dd></div><div><dt>Omitted</dt><dd className="mono">0</dd></div><div><dt>Raw rounding</dt><dd>Nearest integer</dd></div></dl>
        <p className="fine-print">The eight-question quiz uses demo raw-to-scaled and index IQ mappings. The full-length Form 02 sheet is layout reference for future form-specific tables.</p>
      </Card>
    </div>
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

export function Quiz({ form, attempt, onAnswer, onCursor, onExit, onFinish, onDiscard }) {
  const items = questionsFor(form);
  const cursor = attempt.cursor;
  const item = items[cursor];
  const count = Object.keys(attempt.answers).length;
  const chosen = attempt.answers[cursor];
  return <>
    <PageHead title={form.title} description={form.paperPages ? "Original PDF · Practice quiz" : form.code + " · Sample quiz"} action={<Button onClick={onExit}>Save & exit <ArrowRight /></Button>} />
    <div className="panels-split quiz-layout">
      <Card className="panel question-card">
        <div className="question-meta"><span className="status">{item.index}</span><span className="mono muted">Question {cursor + 1} / {items.length}</span></div>
        <h2>{item.prompt}</h2>
        {item.passage && <blockquote>{item.passage}</blockquote>}
        {item.page && <PaperQuestion key={item.page} form={form} item={item} />}
        <fieldset className="answer-options"><legend className="sr-only">Choose one answer</legend>{item.choices.map((choice, i) => <label key={i} className={chosen === i ? "chosen" : ""}>
          <input name="answer" type="radio" value={i} checked={chosen === i} onChange={() => onAnswer(i)} />
          <span className="answer-letter mono">{String.fromCharCode(65 + i)}</span><span>{item.page ? <span className="sr-only">{choice}</span> : choice}</span>{chosen === i && <Check />}
        </label>)}</fieldset>
        <div className="quiz-controls"><Button onClick={() => onCursor(cursor - 1)} disabled={cursor === 0}><ArrowLeft /> Previous</Button>
          {chosen != null && <Button variant="ghost" onClick={() => onAnswer(null)}>Clear answer</Button>}
          {cursor < items.length - 1 ? <Button variant="primary" onClick={() => onCursor(cursor + 1)}>Next <ArrowRight /></Button> : <Button variant="primary" onClick={onFinish}>Finish test <Check /></Button>}
        </div>
      </Card>
      <Card className="panel quiz-progress"><PanelHead title="Test progress" text="Responses save automatically." />
        <div className="progress-label"><span>Answered</span><strong className="mono">{count} / {items.length}</strong></div>
        <progress value={count} max={items.length} aria-label="Questions answered" />
        <div className="question-nav">{items.map((_, i) => <Button key={i} onClick={() => onCursor(i)} aria-current={cursor === i ? "step" : undefined} aria-label={"Question " + (i + 1) + (attempt.answers[i] != null ? ", answered" : ", unanswered")} className={"mono " + (attempt.answers[i] != null ? "answered" : "")}>{i + 1}</Button>)}</div>
        <Button className="full-button" onClick={onFinish}><ScanLine /> Review and submit</Button>
        <Button className="full-button" variant="ghost" onClick={onDiscard}>Discard attempt</Button>
      </Card>
    </div>
  </>;
}

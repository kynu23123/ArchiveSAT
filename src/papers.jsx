import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, FileSpreadsheet, FileText, ListChecks, Minus, Plus } from "lucide-react";
import { inspectPdf, openPdf, parseNumbers, readPapers, savePapers } from "./pdf.js";
import { Button } from "./ui.jsx";
import samplePaper from "../samples/paper.pdf?url&no-inline";
import sampleScoring from "../samples/scoring.pdf?url&no-inline";

export function ImageCard({ file, page, title }) {
  const canvas = useRef(null);
  const scrollArea = useRef(null);
  const [document, setDocument] = useState(null);
  const [status, setStatus] = useState("");
  const [zoom, setZoom] = useState(100);
  const [displayPixels, setDisplayPixels] = useState(0);

  useEffect(() => {
    setDocument(null);
    if (!file) return;
    let live = true;
    const pdf = openPdf(file);
    pdf.document.then((value) => { if (live) setDocument(value); }).catch(() => {
      if (live) setStatus("This PDF could not be opened.");
    });
    return () => { live = false; void pdf.close(); };
  }, [file]);

  useEffect(() => {
    if (!file) return;
    const area = scrollArea.current;
    const measure = () => setDisplayPixels(Math.ceil(area.clientWidth * window.devicePixelRatio));
    const observer = new ResizeObserver(measure);
    observer.observe(area);

    let resolution;
    function watchResolution() {
      resolution?.removeEventListener("change", watchResolution);
      resolution = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      resolution.addEventListener("change", watchResolution);
      measure();
    }
    watchResolution();
    return () => {
      observer.disconnect();
      resolution.removeEventListener("change", watchResolution);
    };
  }, [file]);

  useEffect(() => {
    if (!document || !displayPixels) return;
    let live = true;
    let render;
    setStatus("Rendering page…");
    document.getPage(page).then((pdfPage) => {
      if (!live) return;
      const surface = canvas.current;
      const pageSize = pdfPage.getViewport({ scale: 1 });
      const fitScale = Math.max(2, displayPixels / pageSize.width);
      const scale = Math.min(
        fitScale * zoom / 100,
        8192 / Math.max(pageSize.width, pageSize.height),
        Math.sqrt(24_000_000 / (pageSize.width * pageSize.height)),
      );
      const viewport = pdfPage.getViewport({ scale });
      surface.width = Math.ceil(viewport.width);
      surface.height = Math.ceil(viewport.height);
      render = pdfPage.render({ canvas: surface, viewport });
      return render.promise.then(() => { if (live) setStatus(""); });
    }).catch(() => { if (live) setStatus("This page could not be rendered."); });
    return () => { live = false; render?.cancel(); };
  }, [document, page, zoom, displayPixels]);

  return <figure className="paper-image-card">
    <figcaption><strong>{title}</strong><div className="zoom-tools">
      <Button className="icon-button" aria-label="Zoom out" disabled={zoom <= 100} onClick={() => setZoom(zoom - 50)}><Minus /></Button>
      <span className="mono">{zoom}%</span>
      <Button className="icon-button" aria-label="Zoom in" disabled={zoom >= 250} onClick={() => setZoom(zoom + 50)}><Plus /></Button>
    </div></figcaption>
    {!file ? <p className="empty-line">The source PDF is unavailable in this profile.</p> : <>
      {status && <p role="status" className="paper-status">{status}</p>}
      <div ref={scrollArea} className="paper-image-scroll" tabIndex={0} aria-label="Scrollable original PDF page">
        <canvas ref={canvas} role="img" aria-label={title} style={{ width: zoom + "%" }} hidden={!document || Boolean(status)} />
      </div>
    </>}
  </figure>;
}

export function PaperQuestion({ form, item }) {
  const [files, setFiles] = useState(null);
  const [page, setPage] = useState(item.page);
  useEffect(() => {
    let live = true;
    readPapers(form.id).then((files) => { if (live) setFiles(files ?? {}); })
      .catch(() => { if (live) setFiles({}); });
    return () => { live = false; };
  }, [form.id]);
  useEffect(() => setPage(item.page), [item]);
  const pages = form.paperPages;
  if (!files) return <p role="status" className="paper-status">Opening source paper…</p>;
  return <div className="paper-question">
    <label className="field paper-page-picker"><span>Question paper page</span>
      <select aria-label="Question paper page" value={page} onChange={(event) => setPage(Number(event.target.value))}>
        {pages.map((number) => <option value={number} key={number}>Page {number}</option>)}
      </select>
    </label>
    <ImageCard key={page} file={files.paper} page={page} title={"Original paper · page " + page} />
  </div>;
}

export function ScoringPages({ form }) {
  const [files, setFiles] = useState(null);
  const [active, setActive] = useState(0);
  const pages = form.scoringPages;
  if (!pages?.length) return null;
  const page = pages[active];
  return <details className="scoring-source" onToggle={(event) => {
    if (event.currentTarget.open && !files) readPapers(form.id).then((value) => setFiles(value ?? {})).catch(() => setFiles({}));
  }}>
    <summary>Original scoring pages ({pages.length})</summary>
    {files ? <><label className="field"><span>Scoring page</span><select aria-label="Scoring page" value={active} onChange={(event) => setActive(Number(event.target.value))}>
      {pages.map(({ source, number }, i) => <option key={source + number} value={i}>{source === "paper" ? "SAT paper" : "Scoring PDF"} · page {number}</option>)}
    </select></label><ImageCard key={page.source + page.number} file={files[page.source]} page={page.number} title={"Scoring reference · page " + page.number} /></> : null}
  </details>;
}

function Attachment({ label, file, onChange, icon: Icon, hint }) {
  return <label className="attachment">
    <Icon /><span><strong>{label}</strong><small>{file?.name ?? hint}</small></span>
    <input type="file" accept=".pdf,application/pdf" onChange={(event) => onChange(event.target.files[0] ?? null)} />
  </label>;
}

const letters = ["A", "B", "C", "D", "E"];
const sampleName = "SAT Archive sample";

function recognizedKey(page, pages) {
  const known = new Map();
  const pattern = new RegExp("^" + page.index + "\\s+(\\d{1,3})[.)]?\\s+([A-E])\\s*$", "gim");
  for (const item of pages.filter((item) => item.type === "scoring")) {
    for (const match of item.text.matchAll(pattern)) {
      const number = Number(match[1]);
      const letter = match[2].toUpperCase();
      known.set(number, known.has(number) && known.get(number) !== letter ? "-" : letter);
    }
  }
  return parseNumbers(page.numbers).map((number) => known.get(number) ?? "-").join("");
}

export function ImportForm({ onCreate, onClose }) {
  const [files, setFiles] = useState({});
  const [name, setName] = useState("");
  const [pending, setPending] = useState("");
  const [pages, setPages] = useState(null);
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState("");
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function review(event, sample = false) {
    event?.preventDefault();
    setError("");
    setPending("Reading PDF pages…");
    try {
      let selected = files;
      if (sample) {
        const [paper, scoring] = await Promise.all([samplePaper, sampleScoring].map(async (url) => {
          const response = await fetch(url);
          if (!response.ok) throw Error("Could not open the sample PDFs.");
          return response.blob();
        }));
        selected = {
          paper: new File([paper], "Sample SAT paper.pdf", { type: "application/pdf" }),
          scoring: new File([scoring], "Sample scoring sheet.pdf", { type: "application/pdf" }),
        };
      }
      const found = await Promise.all([
        inspectPdf(selected.paper, "paper"),
        selected.scoring ? inspectPdf(selected.scoring, "scoring", true) : [],
      ]);
      if (!active.current) return;
      setFiles(selected);
      if (sample) setName(sampleName);
      const allPages = found.flat();
      setPages(sample ? allPages.map((page) => page.type === "questions" ? { ...page, key: recognizedKey(page, allPages) } : page) : allPages);
      setCursor(0);
    } catch (failure) {
      if (active.current) setError(failure.message || "The PDF could not be read.");
    } finally {
      if (active.current) setPending("");
    }
  }

  async function create() {
    setError("");
    try {
      if (pages.some((page) => page.type === "review")) throw Error("Review the unclassified pages and assign each a page type.");
      const papers = pages.filter((page) => page.type === "questions");
      const references = pages.filter((page) => page.type === "scoring");
      const questions = papers.flatMap((page) => {
        const numbers = parseNumbers(page.numbers);
        if (!numbers.length) throw Error("Enter the question numbers on paper page " + page.number + ".");
        const reviewed = (page.key ?? "").replace(/[\s,]+/g, "").toUpperCase();
        if (reviewed && (!/^[A-E-]+$/.test(reviewed) || reviewed.length !== numbers.length)) {
          throw Error("Paper page " + page.number + " needs one key letter (or a dash) per question.");
        }
        return numbers.map((number, i) => ({
          index: page.index, page: page.number, number, prompt: "Question " + number,
          choices: letters.map((letter) => "Answer " + letter),
          key: reviewed[i] && reviewed[i] !== "-" ? letters.indexOf(reviewed[i]) : null,
        }));
      });
      if (!questions.length) throw Error("Mark at least one page as a question page.");
      const id = Date.now().toString(36);
      setPending("Saving the source PDFs…");
      await savePapers(id, files);
      if (!active.current) return;
      onCreate({
        id, title: name.trim(), code: "PDF paper", indexes: [...new Set(questions.map((question) => question.index))],
        questions, paperPages: papers.map((page) => page.number),
        scoringPages: references.map(({ source, number }) => ({ source, number })),
        files: Object.values(files).filter(Boolean).map((file) => file.name),
      });
    } catch (failure) {
      if (active.current) setError(failure.message || "Could not save the PDF.");
    } finally {
      if (active.current) setPending("");
    }
  }

  if (pending) return <div className="import-working" role="status"><div className="beam"><span><FileText /></span><i /><span><ListChecks /></span></div><strong>{pending}</strong></div>;

  if (!pages) return <form className="import-form" onSubmit={(event) => review(event)}>
    <label className="field"><span>Test name</span><input data-autofocus value={name} required onChange={(event) => setName(event.target.value)} placeholder="e.g. October 1993 SAT" maxLength={90} /></label>
    <Attachment label="SAT paper" file={files.paper} onChange={(paper) => setFiles({ ...files, paper })} icon={FileText} hint="Question PDF, with or without scoring pages" />
    <Attachment label="Scoring sheets" file={files.scoring} onChange={(scoring) => setFiles({ ...files, scoring })} icon={FileSpreadsheet} hint="Optional separate PDF" />
    <div className="sample-links"><a href={samplePaper} download="Sample SAT paper.pdf">Sample paper PDF</a><a href={sampleScoring} download="Sample scoring sheet.pdf">Sample scoring PDF</a></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="modal-actions"><Button onClick={onClose}>Cancel</Button><Button onClick={() => review(null, true)}>Use sample PDFs</Button><Button type="submit" variant="primary" disabled={!files.paper || !name.trim()}>Review PDF</Button></div>
  </form>;

  const page = pages[cursor];
  const update = (change) => setPages(pages.map((item, i) => i === cursor ? { ...item, ...change } : item));
  const readKey = () => {
    try {
      update({ key: recognizedKey(page, pages) });
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  };
  return <div className="import-form import-review">
    <p className="fine-print">{pages.filter((item) => item.type === "questions").length} question pages · {pages.filter((item) => item.type === "scoring").length} scoring pages · {pages.filter((item) => item.type === "review").length} need review</p>
    {page.type === "review" && <p className="fine-print">Check the original page below, then choose its page type. Scans may also need question numbers entered by hand.</p>}
    <div className="review-navigation">
      <Button aria-label="Previous PDF page" disabled={!cursor} onClick={() => setCursor(cursor - 1)}><ArrowLeft /></Button>
      <select aria-label="Review PDF page" value={cursor} onChange={(event) => setCursor(Number(event.target.value))}>
        {pages.map((item, i) => <option key={item.source + item.number} value={i}>{item.source === "paper" ? "Paper" : "Scoring PDF"} · page {item.number} · {item.type}</option>)}
      </select>
      <Button aria-label="Next PDF page" disabled={cursor + 1 >= pages.length} onClick={() => setCursor(cursor + 1)}><ArrowRight /></Button>
    </div>
    <div className="form-fields">
      <label className="field"><span>Page type</span><select aria-label="Page type" value={page.type} onChange={(event) => update({ type: event.target.value })}>
        <option value="review">Needs review</option><option value="questions" disabled={page.source !== "paper"}>Question page</option><option value="scoring">Scoring or answer key</option><option value="skip">Skip page</option>
      </select></label>
      {page.type === "questions" && <label className="field"><span>Section</span><select aria-label="Section" value={page.index} onChange={(event) => update({ index: event.target.value })}><option>Verbal</option><option>Math</option></select></label>}
    </div>
    {page.type === "questions" && <>
      <div className="form-fields"><label className="field"><span>Question numbers</span><input value={page.numbers} placeholder="1–8, 11" onChange={(event) => update({ numbers: event.target.value })} /></label>
        <label className="field"><span>Verified key (optional)</span><input value={page.key ?? ""} placeholder="A B – D" onChange={(event) => update({ key: event.target.value.replaceAll("–", "-") })} /></label></div>
      <Button onClick={readKey}>Fill key from recognized rows</Button>
    </>}
    <ImageCard key={page.source + page.number} file={files[page.source]} page={page.number} title={"Original PDF · page " + page.number} />
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="modal-actions"><Button onClick={() => { setPages(null); setError(""); }}>Back</Button><Button variant="primary" onClick={create}>Create test</Button></div>
  </div>;
}

import React, { useEffect, useRef, useState } from "react";
import { excludedSource } from "./authenticity.js";
import { ArrowLeft, ArrowRight, FileSpreadsheet, FileText, ListChecks, Minus, Plus } from "lucide-react";
import { inspectPdf, openPdf, parseNumbers, readPapers, savePapers } from "./pdf.js";
import { Button } from "./ui.jsx";
import { loadReferencePdf } from "./historical.js";

export function ImageCard({ file, page, title, historical = false }) {
  const canvas = useRef(null);
  const [document, setDocument] = useState(null);
  const [status, setStatus] = useState("");
  const [zoom, setZoom] = useState(100);
  const [pixelRatio, setPixelRatio] = useState(() => window.devicePixelRatio);
  const [renderedPage, setRenderedPage] = useState(null);

  useEffect(() => {
    setDocument(null);
    setRenderedPage(null);
    if (!file) return;
    let live = true;
    setStatus("Opening PDF…");
    const pdf = openPdf(file, historical);
    pdf.document.then((value) => { if (live) setDocument(value); }).catch(() => {
      if (live) setStatus("This PDF could not be opened.");
    });
    return () => { live = false; void pdf.close(); };
  }, [file, historical]);

  useEffect(() => {
    let resolution;
    function watchResolution() {
      resolution?.removeEventListener("change", watchResolution);
      resolution = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      resolution.addEventListener("change", watchResolution);
      setPixelRatio(window.devicePixelRatio);
    }
    watchResolution();
    return () => {
      resolution.removeEventListener("change", watchResolution);
    };
  }, []);

  useEffect(() => {
    if (!document) return;
    let live = true;
    let render;
    setStatus("Rendering page…");
    document.getPage(page).then((pdfPage) => {
      if (!live) return;
      const surface = window.document.createElement("canvas");
      const pageSize = pdfPage.getViewport({ scale: 1 });
      const fitScale = Math.max(2.5, 1.8 * pixelRatio);
      const scale = Math.min(
        fitScale * zoom / 100,
        8192 / Math.max(pageSize.width, pageSize.height),
        Math.sqrt(24_000_000 / (pageSize.width * pageSize.height)),
      );
      const viewport = pdfPage.getViewport({ scale });
      surface.width = Math.ceil(viewport.width);
      surface.height = Math.ceil(viewport.height);
      render = pdfPage.render({ canvas: surface, viewport });
      return render.promise.then(() => {
        if (!live) return;
        const visible = canvas.current;
        visible.width = surface.width;
        visible.height = surface.height;
        visible.getContext("2d").drawImage(surface, 0, 0);
        setRenderedPage(page);
        setStatus("");
      });
    }).catch(() => { if (live) setStatus("This page could not be rendered."); });
    return () => { live = false; render?.cancel(); };
  }, [document, page, zoom, pixelRatio]);

  return <figure className="paper-image-card">
    <figcaption><strong>{title}</strong><div className="zoom-tools">
      <Button className="icon-button" aria-label="Zoom out" disabled={zoom <= 100} onClick={() => setZoom(zoom - 50)}><Minus /></Button>
      <span className="mono">{zoom}%</span>
      <Button className="icon-button" aria-label="Zoom in" disabled={zoom >= 250} onClick={() => setZoom(zoom + 50)}><Plus /></Button>
    </div></figcaption>
    {!file ? <p className="empty-line">The source PDF is unavailable in this profile.</p> : <>
      <div className="paper-image-frame">
        {status && <p role="status" className="paper-status paper-render-status">{status}</p>}
        <div className="paper-image-scroll" tabIndex={0} aria-label="Scrollable original PDF page">
          <canvas ref={canvas} role="img" aria-label={title} style={{ width: zoom + "%" }} aria-hidden={renderedPage !== page} hidden={renderedPage == null} />
        </div>
      </div>
    </>}
  </figure>;
}

function readFormPapers(form) {
  return form.library ? loadReferencePdf(form.asset).then((paper) => ({ paper })) : readPapers(form.id);
}

export function PaperQuestion({ form, item }) {
  const [files, setFiles] = useState(null);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    let live = true;
    readFormPapers(form).then((files) => { if (live) setFiles(files ?? {}); })
      .catch(() => { if (live) setFiles({}); });
    return () => { live = false; };
  }, [form]);
  const pages = item.pages ?? form.paperPages;
  const page = selected?.referencePage === item.page ? selected.page : item.page;
  const selectPage = (page) => setSelected({ referencePage: item.page, page });
  const original = form.sections?.find((section) => section.number === item.section)?.sourcePages;
  const pageIndex = pages.indexOf(page);
  if (!files) return <p role="status" className="paper-status">Opening source paper…</p>;
  return <div className="paper-question">
    <div className="review-navigation paper-page-picker">
      <Button aria-label="Previous paper page" disabled={pageIndex <= 0} onClick={() => selectPage(pages[pageIndex - 1])}><ArrowLeft /></Button>
      <select aria-label="Question paper page" value={page} onChange={(event) => selectPage(Number(event.target.value))}>
        {pages.map((number, i) => <option value={number} key={number}>Source PDF page {original?.[i] ?? number}</option>)}
      </select>
      <Button aria-label="Next paper page" disabled={pageIndex >= pages.length - 1} onClick={() => selectPage(pages[pageIndex + 1])}><ArrowRight /></Button>
    </div>
    <ImageCard file={files.paper} page={page} historical={form.library} title={"Original paper · page " + (original?.[pageIndex] ?? page)} />
  </div>;
}

export function ScoringPages({ form }) {
  const [files, setFiles] = useState(null);
  const [active, setActive] = useState(0);
  const pages = form.scoringPages;
  if (!pages?.length) return null;
  const page = pages[active];
  return <details className="scoring-source" onToggle={(event) => {
    if (event.currentTarget.open && !files) readFormPapers(form).then((value) => setFiles(value ?? {})).catch(() => setFiles({}));
  }}>
    <summary>Original scoring pages ({pages.length})</summary>
    {files ? <><label className="field"><span>Scoring page</span><select aria-label="Scoring page" value={active} onChange={(event) => setActive(Number(event.target.value))}>
      {pages.map(({ source, number, label, originalPage }, i) => <option key={source + number} value={i}>{label ?? (source === "paper" ? "SAT paper" : "Scoring PDF")} · page {originalPage ?? number}</option>)}
    </select></label><ImageCard key={page.source} file={files[page.source]} page={page.number} historical={form.library} title={(page.label ?? "Scoring reference") + " · page " + (page.originalPage ?? page.number)} /></> : null}
  </details>;
}

export function ReferenceViewer({ source }) {
  const [file, setFile] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(false);
  return <details className="scoring-source" onToggle={(event) => {
    if (event.currentTarget.open && !file) loadReferencePdf(source.referenceFile).then(setFile).catch(() => setError(true));
  }}>
    <summary>View reference PDF excerpt</summary>
    {error && <p role="alert">The reference PDF could not be opened.</p>}
    {file && <><select aria-label="Reference PDF page" value={page} onChange={(event) => setPage(Number(event.target.value))}>
      {source.referencePages.map((original, i) => <option key={i} value={i + 1}>Source PDF page {original}</option>)}
    </select><ImageCard file={file} page={page} historical title={"Source PDF page " + source.referencePages[page - 1]} /></>}
  </details>;
}

function Attachment({ label, file, onChange, icon: Icon, hint }) {
  return <label className="attachment">
    <Icon /><span><strong>{label}</strong><small>{file?.name ?? hint}</small></span>
    <input type="file" accept=".pdf,application/pdf" onChange={(event) => onChange(event.target.files[0] ?? null)} />
  </label>;
}

const letters = ["A", "B", "C", "D", "E"];

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

  async function review(event) {
    event.preventDefault();
    setError("");
    setPending("Reading PDF pages…");
    try {
      const hashes = await Promise.all(Object.values(files).filter(Boolean).map(async (file) => {
        const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
        return Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2,"0")).join("");
      }));
      const rejected = () => Error("Form 7W is excluded because the source has duplicate pages and missing questions.");
      if (hashes.some((hash) => excludedSource({ hash })) || excludedSource({ name: name + " " + files.paper.name })) throw rejected();
      const found = await Promise.all([
        inspectPdf(files.paper, "paper"),
        files.scoring ? inspectPdf(files.scoring, "scoring", true) : [],
      ]);
      if (found.flat().some(({ text }) => excludedSource({ text }))) throw rejected();
      if (!active.current) return;
      setPages(found.flat());
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
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="modal-actions"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={!files.paper || !name.trim()}>Review PDF</Button></div>
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
    <ImageCard key={page.source} file={files[page.source]} page={page.number} title={"Original PDF · page " + page.number} />
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="modal-actions"><Button onClick={() => { setPages(null); setError(""); }}>Back</Button><Button variant="primary" onClick={create}>Create test</Button></div>
  </div>;
}

import React from "react";
import { Check } from "lucide-react";
import { Button } from "./ui.jsx";

export function QuestionContent({ question, images }) {
  const figure = images[question.figure];
  return <div className="digital-question">
    {question.instructions && <p className="question-instructions">{question.instructions}</p>}
    {question.context?.length > 0 && <details className="question-context" open>
      <summary>{question.contextLabel ?? "Reference material for this question"}</summary>
      <div>{question.context.map((part, i) => <div key={i} className="question-prompt">{part}</div>)}</div>
    </details>}
    {figure && <figure className="question-figure"><Figure image={figure} alt={question.figureAlt} /></figure>}
    <div className="question-prompt">{question.prompt}</div>
  </div>;
}

function Figure({ image, alt }) {
  const [width, height, jpeg] = image;
  return <img className="question-crop" src={"data:image/jpeg;base64," + jpeg} width={width} height={height}
    style={{ "--source-width": `${Math.round(width / 1.7)}px` }} alt={alt ?? "Source diagram"} draggable={false} />;
}

export function AnswerOptions({ choices, chosen, onAnswer }) {
  function selectAdjacent(event) {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (!step) return;
    const buttons = [...event.currentTarget.querySelectorAll('button[role="radio"]')];
    const i = buttons.indexOf(event.target);
    if (i < 0) return;
    event.preventDefault();
    const next = buttons[(i + step + buttons.length) % buttons.length];
    next.focus();
    next.click();
  }

  return <div className="answer-options" role="radiogroup" aria-label="Choose one answer" onKeyDown={selectAdjacent}>
    {choices.map((choice, i) => {
      const letter = String.fromCharCode(65 + i);
      return <Button key={letter} role="radio" aria-checked={chosen === i} tabIndex={(chosen ?? 0) === i ? 0 : -1} className="answer-choice" onClick={() => onAnswer(i)}>
        <span className="answer-letter mono">{letter}</span>
        {choice && <span className="answer-content">{choice}</span>}
        {chosen === i && <Check aria-hidden="true" />}
      </Button>;
    })}
  </div>;
}

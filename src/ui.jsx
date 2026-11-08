import React, { useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

export function Card({ className = "", children, ...props }) {
  return <section data-slot="card" className={"card " + className} {...props}>{children}</section>;
}

export function Button({ children, variant = "secondary", className = "", onClick, type = "button", ...props }) {
  const ripple = useRef(null);
  function click(event) {
    if (ripple.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const left = event.detail ? event.clientX - bounds.left : bounds.width / 2;
      const top = event.detail ? event.clientY - bounds.top : bounds.height / 2;
      const size = Math.max(bounds.width, bounds.height) * 2.25;
      ripple.current.style.left = left + "px";
      ripple.current.style.top = top + "px";
      ripple.current.style.width = ripple.current.style.height = size + "px";
      ripple.current.getAnimations().forEach((animation) => animation.cancel());
      ripple.current.animate([
        { transform: "translate(-50%,-50%) scale(0)", opacity: 0.23 },
        { transform: "translate(-50%,-50%) scale(1)", opacity: 0 },
      ], { duration: 460, easing: "ease-out" });
    }
    onClick?.(event);
  }
  return <button type={type} className={"button button-" + variant + " " + className} onClick={click} {...props}>
    {children}<span ref={ripple} className="ripple" aria-hidden="true" />
  </button>;
}

export function Modal({ open, onClose, title, description, children, triggerRef }) {
  const content = useRef(null);
  useEffect(() => {
    if (open) content.current?.querySelector("[data-autofocus]")?.focus({ preventScroll: true });
  }, [open, title]);
  return <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
    <Dialog.Portal>
      <Dialog.Overlay className="overlay" />
      <Dialog.Content ref={content} className="modal card" onOpenAutoFocus={(event) => {
        const target = event.currentTarget.querySelector("[data-autofocus]");
        if (target) { event.preventDefault(); target.focus(); }
      }} onCloseAutoFocus={(event) => {
        const target = triggerRef?.current;
        if (target?.isConnected) { event.preventDefault(); target.focus(); }
      }}>
        <header className="modal-head">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          <Dialog.Close asChild><Button className="icon-button close-button" variant="ghost" aria-label="Close"><X /></Button></Dialog.Close>
        </header>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function DotPattern() {
  const pattern = useRef(null);
  useEffect(() => {
    const element = pattern.current;
    function lightDots(event) {
      const bounds = element.getBoundingClientRect();
      element.style.setProperty("--dot-x", event.clientX - bounds.left + "px");
      element.style.setProperty("--dot-y", event.clientY - bounds.top + "px");
    }
    window.addEventListener("pointermove", lightDots, { passive: true });
    return () => window.removeEventListener("pointermove", lightDots);
  }, []);
  return <div className="dot-pattern" ref={pattern} aria-hidden="true">
    <svg width="100%" height="100%"><defs><pattern id="grid-dot" width="14" height="14" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="0.8" fill="currentColor" />
    </pattern></defs><rect width="100%" height="100%" fill="url(#grid-dot)" /></svg>
  </div>;
}

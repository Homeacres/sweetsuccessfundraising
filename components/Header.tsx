"use client";

import { useState } from "react";

export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="nav">
      <a className="logo" href="/">sweet <span>success</span></a>
      <button className="nav-toggle" type="button" aria-expanded={open} aria-controls="nav-links" onClick={() => setOpen((value) => !value)}>
        Menu
      </button>
      <nav id="nav-links" className={open ? "nav-links open" : "nav-links"} onClick={() => setOpen(false)}>
        <a href="/#how">How it works</a>
        <a href="/#products">Products</a>
        <a href="/#about">About</a>
        <a className="btn btn-gold" href="/#apply">Apply</a>
      </nav>
    </header>
  );
}

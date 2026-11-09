"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SportChoice } from "@/lib/apply-sport";

export function SportField({
  id = "sport",
  labelId,
  options,
  value,
  onChange,
}: {
  id?: string;
  labelId: string;
  options: SportChoice[];
  value: string;
  onChange: (sport: string) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = options.findIndex((option) => option.sport_name === value);
  const [active, setActive] = useState(selectedIndex >= 0 ? selectedIndex : 0);
  const activeId = options[active] ? `${id}-option-${active}` : undefined;

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open || !activeId) return;
    document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [open, activeId]);

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.sport_name);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const last = options.length - 1;
    if (last < 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setActive(selectedIndex >= 0 ? selectedIndex : 0);
        setOpen(true);
        return;
      }
      setActive((index) => {
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        return Math.min(last, Math.max(0, next));
      });
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
      setOpen(true);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActive(last);
      setOpen(true);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        setActive(selectedIndex >= 0 ? selectedIndex : 0);
        setOpen(true);
      } else {
        choose(active);
      }
      return;
    }
    if (event.key === "Escape" || event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (open && event.key.length === 1) {
      const letter = event.key.toLowerCase();
      const after = options.findIndex((option, index) => index > active && option.sport_name.toLowerCase().startsWith(letter));
      const first = options.findIndex((option) => option.sport_name.toLowerCase().startsWith(letter));
      const next = after >= 0 ? after : first;
      if (next >= 0) setActive(next);
    }
  }

  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  return (
    <div className="sport-picker" ref={rootRef}>
      <button
        type="button"
        id={id}
        className="sport-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelId}
        aria-activedescendant={open ? activeId : undefined}
        aria-required="true"
        onClick={() => {
          setActive(selectedIndex >= 0 ? selectedIndex : 0);
          setOpen((current) => !current);
        }}
        onKeyDown={onKeyDown}
      >
        {selected ? optionLabel(selected) : "Select a sport"}
      </button>
      {open ? (
        <ul id={listId} role="listbox" aria-labelledby={labelId} className="sport-list">
          {options.map((option, index) => (
            <li key={option.sport_name} role="presentation">
              <div
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={option.sport_name === value}
                className={index === active ? "is-active" : undefined}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(index);
                }}
              >
                {optionLabel(option)}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function optionLabel(option: SportChoice): string {
  return option.emoji ? `${option.emoji} ${option.sport_name}` : option.sport_name;
}

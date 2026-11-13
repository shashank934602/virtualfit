"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { brightMatrix, catById, colorIndex, garmentLook, lookStyle, tintMatrix, type BagLine } from "./vf-data";
import { TintFilter } from "./vf-tint";

export type PanelId = "bag" | "fit" | "profile" | null;
export type Booking = { day: string; time: string } | null;
export type Fit = "Slim" | "Regular" | "Relaxed";
export type Profile = { height: number; fit: Fit };

/* ───────────────────────── Icons ───────────────────────── */

const IconTee = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8.6 3.2 3.4 5.6 1.9 10.3l3.4 1.4.9-1V21h11.6V10.7l.9 1 3.4-1.4-1.5-4.7-5.2-2.4c-.5 1.6-1.9 2.6-3.4 2.6s-2.9-1-3.4-2.6Z" />
  </svg>
);
const IconCart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 4h2.2l2.1 10.2a1.6 1.6 0 0 0 1.6 1.3h7.9a1.6 1.6 0 0 0 1.6-1.2L20 8H6.1" />
    <circle cx="9.5" cy="19.6" r="1.3" />
    <circle cx="17" cy="19.6" r="1.3" />
  </svg>
);
const IconCalendar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
const IconProfile = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
  </svg>
);
const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

/* ───────────────────────── Rail ───────────────────────── */

export function Rail({
  panel,
  setPanel,
  count,
  bump,
  booked,
}: {
  panel: PanelId;
  setPanel: (p: PanelId) => void;
  count: number;
  bump: number;
  booked: boolean;
}) {
  const toggle = (p: Exclude<PanelId, null>) => setPanel(panel === p ? null : p);
  return (
    <nav className="rail glass" aria-label="Tools">
      <button className={panel === null ? "on" : undefined} aria-label="Try-on" aria-pressed={panel === null} onClick={() => setPanel(null)}>
        <IconTee />
      </button>
      <button data-bag className={panel === "bag" ? "on" : undefined} aria-label={`Bag, ${count} items`} aria-pressed={panel === "bag"} onClick={() => toggle("bag")}>
        <IconCart />
        {count > 0 && (
          <span key={bump} className="badge">
            {count}
          </span>
        )}
      </button>
      <button className={panel === "fit" ? "on" : undefined} aria-label="Book a fitting" aria-pressed={panel === "fit"} onClick={() => toggle("fit")}>
        <IconCalendar />
        {booked && <span className="mark" />}
      </button>
      <button className={panel === "profile" ? "on" : undefined} aria-label="Fit profile" aria-pressed={panel === "profile"} onClick={() => toggle("profile")}>
        <IconProfile />
      </button>
    </nav>
  );
}

/* ───────────────────────── Panel shell ───────────────────────── */

function Shell({
  open,
  title,
  sub,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  sub?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`panel glass${open ? " open" : ""}`} role="dialog" aria-label={title} aria-hidden={!open} inert={!open}>
      <header className="ph">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        <button className="x" aria-label="Close" onClick={onClose}>
          <IconClose />
        </button>
      </header>
      <div className="pb">{children}</div>
      {footer && <div className="pf">{footer}</div>}
    </section>
  );
}

/* ───────────────────────── Bag ───────────────────────── */

export function BagPanel({
  open,
  onClose,
  bag,
  setQty,
  clear,
}: {
  open: boolean;
  onClose: () => void;
  bag: BagLine[];
  setQty: (i: number, qty: number) => void;
  clear: () => void;
}) {
  const [placed, setPlaced] = useState(false);
  const count = bag.reduce((n, l) => n + l.qty, 0);
  const subtotal = bag.reduce((n, l) => n + catById(l.cat).items[l.idx].p * l.qty, 0);

  if (placed && bag.length === 0) {
    return (
      <Shell open={open} title="Bag" onClose={onClose}>
        <div className="done">
          <span className="tick">
            <IconCheck />
          </span>
          <h3>Order placed</h3>
          <p>Thanks! You&apos;ll get a confirmation shortly.</p>
          <button
            className="pbtn"
            onClick={() => {
              setPlaced(false);
              onClose();
            }}
          >
            Keep trying on
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      open={open}
      title="Bag"
      sub={count ? `${count} item${count > 1 ? "s" : ""}` : undefined}
      onClose={onClose}
      footer={
        bag.length > 0 && (
          <>
            <div className="sum">
              <span>Subtotal</span>
              <strong>${subtotal}</strong>
            </div>
            <button
              className="pbtn"
              onClick={() => {
                setPlaced(true);
                clear();
              }}
            >
              Checkout
            </button>
          </>
        )
      }
    >
      {bag.length === 0 ? (
        <p className="empty">Your bag is empty. Pick a size and colour on the card below, then tap “Add to bag”.</p>
      ) : (
        <ul className="lines">
          {bag.map((l, i) => {
            const c = catById(l.cat);
            const it = c.items[l.idx];
            const k = colorIndex(it, l.color);
            const fid = `vf-bl-${c.id}-${l.idx}-${k}`;
            return (
              <li key={`${c.id}-${l.idx}-${l.size}-${l.color}`}>
                <span className="lt">
                  {k > 0 && (
                    <svg className="defs" width="0" height="0" aria-hidden="true">
                      <TintFilter id={fid} m={tintMatrix(it, k)} b={brightMatrix(it)} />
                    </svg>
                  )}
                  <i style={{ ...lookStyle(garmentLook(c, it)), filter: k > 0 ? `url(#${fid})` : undefined }} />
                </span>
                <div className="li">
                  <strong>{it.n}</strong>
                  <span className="meta">
                    <span className="hex" style={{ background: l.hex }} />
                    {l.color} · {l.size}
                  </span>
                  <div className="qty">
                    <button aria-label="Decrease quantity" onClick={() => setQty(i, l.qty - 1)}>
                      −
                    </button>
                    <span>{l.qty}</span>
                    <button aria-label="Increase quantity" onClick={() => setQty(i, l.qty + 1)}>
                      +
                    </button>
                  </div>
                </div>
                <strong className="lp">${it.p * l.qty}</strong>
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}

/* ───────────────────────── Fitting ───────────────────────── */

const TIMES = ["10:00", "11:30", "13:00", "14:30", "16:00", "17:30"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const pretty = (day: string) =>
  new Date(`${day}T00:00`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });

export function FittingPanel({
  open,
  onClose,
  booking,
  setBooking,
}: {
  open: boolean;
  onClose: () => void;
  booking: Booking;
  setBooking: (b: Booking) => void;
}) {
  const days = useMemo(() => {
    const out: { id: string; wd: string; dn: number }[] = [];
    const now = new Date();
    for (let k = 0; k < 6; k++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k);
      out.push({ id: iso(d), wd: k === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" }), dn: d.getDate() });
    }
    return out;
  }, []);
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  if (booking && !editing) {
    return (
      <Shell open={open} title="Fitting booked" sub="In-store with a stylist" onClose={onClose}>
        <div className="booked">
          <span className="tick">
            <IconCheck />
          </span>
          <div>
            <strong>{pretty(booking.day)}</strong>
            <span>{booking.time} · 45 min</span>
          </div>
        </div>
        <div className="row2">
          <button
            className="sbtn"
            onClick={() => {
              setDay(booking.day);
              setTime(booking.time);
              setEditing(true);
            }}
          >
            Change
          </button>
          <button className="sbtn" onClick={() => setBooking(null)}>
            Cancel booking
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      open={open}
      title="Book a fitting"
      sub="Try your picks in-store with a stylist."
      onClose={onClose}
      footer={
        <button
          className="pbtn"
          disabled={!day || !time}
          onClick={() => {
            if (!day || !time) return;
            setBooking({ day, time });
            setEditing(false);
          }}
        >
          {day && time ? `Book ${pretty(day)}, ${time}` : "Pick a day and time"}
        </button>
      }
    >
      <h4 className="sh">Day</h4>
      <div className="days">
        {days.map((d) => (
          <button key={d.id} className={day === d.id ? "on" : undefined} onClick={() => setDay(d.id)}>
            <span>{d.wd}</span>
            <strong>{d.dn}</strong>
          </button>
        ))}
      </div>
      <h4 className="sh">Time</h4>
      <div className="times">
        {TIMES.map((t) => (
          <button key={t} className={time === t ? "on" : undefined} onClick={() => setTime(t)}>
            {t}
          </button>
        ))}
      </div>
    </Shell>
  );
}

/* ───────────────────────── Profile ───────────────────────── */

const FITS: Fit[] = ["Slim", "Regular", "Relaxed"];

const CLOTHING_SIZES = ["S", "M", "L", "XL"];

export function recommendSize({ height, fit }: Profile): string {
  let i = height < 168 ? 0 : height < 178 ? 1 : height < 188 ? 2 : 3;
  if (fit === "Slim") i -= 1;
  if (fit === "Relaxed") i += 1;
  return CLOTHING_SIZES[Math.max(0, Math.min(CLOTHING_SIZES.length - 1, i))];
}

export function ProfilePanel({
  open,
  onClose,
  profile,
  setProfile,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  setProfile: (p: Profile) => void;
  /** returns false when the open category doesn't use S–XL sizes */
  onApply: (size: string) => boolean;
}) {
  const rec = recommendSize(profile);
  const [applied, setApplied] = useState<string | null>(null);
  useEffect(() => {
    if (!applied) return;
    const t = setTimeout(() => setApplied(null), 1600);
    return () => clearTimeout(t);
  }, [applied]);

  return (
    <Shell
      open={open}
      title="Fit profile"
      sub="We'll suggest the right size for you."
      onClose={onClose}
      footer={
        <button
          className="pbtn"
          onClick={() => setApplied(onApply(rec) ? `Size ${rec} selected ✓` : "Open Tops or Outerwear to use it")}
        >
          {applied ?? `Use size ${rec}`}
        </button>
      }
    >
      <h4 className="sh">
        Height <span className="val">{profile.height} cm</span>
      </h4>
      <input
        className="range"
        type="range"
        min={150}
        max={205}
        step={1}
        value={profile.height}
        aria-label="Height in centimetres"
        onChange={(e) => setProfile({ ...profile, height: Number(e.target.value) })}
      />
      <h4 className="sh">Preferred fit</h4>
      <div className="seg">
        {FITS.map((f) => (
          <button key={f} className={profile.fit === f ? "on" : undefined} onClick={() => setProfile({ ...profile, fit: f })}>
            {f}
          </button>
        ))}
      </div>
      <div className="rec">
        <span>Recommended size</span>
        <strong>{rec}</strong>
      </div>
    </Shell>
  );
}

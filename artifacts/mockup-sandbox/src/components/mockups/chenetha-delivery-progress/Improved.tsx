import { ArrowUpRight, Check, Clock3, ExternalLink, MapPin, PackageCheck, ScanLine, ShieldCheck, Truck } from "lucide-react";
import "./_group.css";
import "./Improved.css";

const journeyStages = [
  { label: "Shipment details received", state: "complete", note: "11 Nov" },
  { label: "Picked up", state: "complete", note: "12 Nov" },
  { label: "In transit", state: "current", note: "Now" },
  { label: "Out for delivery", state: "upcoming", note: "Awaiting scan" },
  { label: "Delivered", state: "upcoming", note: "Awaiting scan" },
] as const;

const scans = [
  {
    status: "IN TRANSIT",
    description: "In Transit",
    time: "13 November 2026 at 4:39 am",
    isoTime: "2026-11-13T04:39:00",
    location: "HYD/PC1, Hyderabad, Telangana",
    current: true,
  },
  {
    status: "PICKED UP",
    description: "Pickup Done",
    time: "12 November 2026 at 6:36 pm",
    isoTime: "2026-11-12T18:36:00",
    location: "PCK/SEC, Hyderabad, Telangana",
    current: false,
  },
  {
    status: "OUT FOR PICKUP",
    description: "Out For Pickup",
    time: "12 November 2026 at 3:28 pm",
    isoTime: "2026-11-12T15:28:00",
    location: "PCK/SEC, Hyderabad, Telangana",
    current: false,
  },
  {
    status: "DATA RECEIVED",
    description: "Shipment information received",
    time: "11 November 2026 at 9:27 pm",
    isoTime: "2026-11-11T21:27:00",
    location: "PCK/SEC, Hyderabad, Telangana",
    current: false,
  },
] as const;

export function Improved() {
  return (
    <main className="delivery-improved">
      <article className="delivery-shell" aria-labelledby="delivery-title">
        <header className="delivery-brandline">
          <div className="delivery-wordmark">
            <span className="delivery-monogram" aria-hidden="true">C</span>
            <span><strong>Chenetha</strong><small>by Koushikii</small></span>
          </div>
          <span className="delivery-order-label">A handloom, on its way</span>
        </header>

        <section className="delivery-intro">
          <div className="delivery-heading-copy">
            <span className="delivery-kicker">Your parcel’s journey</span>
            <h1 id="delivery-title">A little closer to home.</h1>
            <p>We’re keeping an eye on your saree as it travels safely to you.</p>
          </div>
          <div className="delivery-status-seal" aria-label="Current parcel status: In transit">
            <span className="delivery-status-icon"><Truck size={20} strokeWidth={1.7} aria-hidden="true" /></span>
            <span className="delivery-status-text"><small>Current status</small><strong>In transit</strong></span>
          </div>
        </section>

        <section className="delivery-summary" aria-label="Shipment summary">
          <div className="delivery-summary-item delivery-arrival">
            <span className="summary-icon"><Clock3 size={16} aria-hidden="true" /></span>
            <span><small>Estimated arrival</small><strong>13 November 2026</strong></span>
          </div>
          <div className="delivery-summary-item">
            <span className="summary-icon"><Truck size={16} aria-hidden="true" /></span>
            <span><small>Carrier</small><strong>Delivery partner</strong><em>Name not provided in this update</em></span>
          </div>
          <div className="delivery-summary-item">
            <span className="summary-icon"><ScanLine size={16} aria-hidden="true" /></span>
            <span><small>Tracking reference</small><strong className="delivery-reference">CHN-5482-9137</strong></span>
          </div>
        </section>

        <section className="journey-panel" aria-labelledby="journey-heading">
          <div className="journey-panel-head">
            <div>
              <span className="delivery-kicker">At a glance</span>
              <h2 id="journey-heading">Where your parcel is in the journey</h2>
            </div>
            <span className="journey-confirmed"><ShieldCheck size={14} aria-hidden="true" /> Based on courier scans</span>
          </div>
          <ol className="journey-stages" aria-label="Normalized delivery stages">
            {journeyStages.map((stage, index) => (
              <li className={`journey-stage is-${stage.state}`} key={stage.label} aria-current={stage.state === "current" ? "step" : undefined}>
                <span className="journey-node" aria-hidden="true">
                  {stage.state === "complete" ? <Check size={13} strokeWidth={2.5} /> : stage.state === "current" ? <span /> : null}
                </span>
                {index < journeyStages.length - 1 && <span className="journey-connector" aria-hidden="true" />}
                <strong>{stage.label}</strong>
                <small>{stage.note}</small>
              </li>
            ))}
          </ol>
          <p className="journey-caption">Later steps will move forward only when the courier confirms them.</p>
        </section>

        <div className="delivery-lower">
          <section className="scan-panel" id="carrier-scans" aria-labelledby="scan-heading">
            <div className="scan-panel-heading">
              <span className="scan-heading-icon"><PackageCheck size={18} aria-hidden="true" /></span>
              <div>
                <span className="delivery-kicker">Straight from the carrier</span>
                <h2 id="scan-heading">Carrier scan history</h2>
              </div>
              <span className="scan-count">4 updates</span>
            </div>
            <p className="scan-explainer">These are the original scan updates received for this parcel, shown newest first.</p>
            <ol className="scan-list" aria-label="Carrier-provided scan history">
              {scans.map((scan) => (
                <li className={scan.current ? "scan-entry is-latest" : "scan-entry"} key={scan.status}>
                  <span className="scan-marker" aria-hidden="true" />
                  <div className="scan-copy">
                    <div className="scan-title-row">
                      <strong>{scan.description}</strong>
                      {scan.current && <span className="latest-tag">Latest scan</span>}
                    </div>
                    <span className="scan-code">{scan.status}</span>
                    <small className="scan-meta">
                      <time dateTime={scan.isoTime}>{scan.time}</time>
                      <span className="scan-location"><MapPin size={12} aria-hidden="true" />{scan.location}</span>
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <aside className="delivery-aside">
            <section className="latest-location" aria-label="Latest scan location">
              <span className="location-overline"><MapPin size={13} aria-hidden="true" /> Latest scan location</span>
              <strong>Hyderabad, Telangana</strong>
              <span className="location-code">HYD/PC1</span>
              <p>Last recorded at 4:39 am on 13 November.</p>
            </section>
            <section className="tracking-link-card" aria-label="Tracking information">
              <div className="tracking-link-mark"><ExternalLink size={16} aria-hidden="true" /></div>
              <div>
                <strong>Need the scan details?</strong>
                <p>Review the carrier updates recorded for your parcel.</p>
                <a href="#carrier-scans">View carrier scan history <ArrowUpRight size={14} aria-hidden="true" /></a>
              </div>
            </section>
            <p className="delivery-reassurance"><ShieldCheck size={15} aria-hidden="true" /> We’ll show a new status here when the next courier scan arrives.</p>
          </aside>
        </div>
        <footer className="delivery-footer">
          <span className="footer-stitch" aria-hidden="true" />
          <p>Made with care. Sent with care.</p>
          <span className="footer-brand">CHENETHA <i>·</i> KOUSHIKII</span>
        </footer>
      </article>
    </main>
  );
}

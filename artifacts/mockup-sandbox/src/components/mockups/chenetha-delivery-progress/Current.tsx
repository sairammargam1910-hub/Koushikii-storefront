import { ExternalLink, MapPin, Truck } from "lucide-react";
import "./_group.css";
import "./Current.css";

const events = [
  {
    status: "IN TRANSIT",
    description: "In Transit",
    time: "13 November 2026 at 4:39 am",
    location: "HYD/PC1, Hyderabad, Telangana",
  },
  {
    status: "PICKED UP",
    description: "Pickup Done",
    time: "12 November 2026 at 6:36 pm",
    location: "PCK/SEC, Hyderabad, Telangana",
  },
  {
    status: "OUT FOR PICKUP",
    description: "Out For Pickup",
    time: "12 November 2026 at 3:28 pm",
    location: "PCK/SEC, Hyderabad, Telangana",
  },
  {
    status: "DATA RECEIVED",
    description: "Shipment information received",
    time: "11 November 2026 at 9:27 pm",
    location: "PCK/SEC, Hyderabad, Telangana",
  },
];

export function Current() {
  return (
    <main className="tracking-preview current">
      <section className="tracking-card" aria-labelledby="current-tracking-title">
        <header className="tracking-heading">
          <span className="tracking-icon"><Truck size={20} aria-hidden="true" /></span>
          <div>
            <span className="tracking-eyebrow">The journey</span>
            <h1 id="current-tracking-title">Delivery progress</h1>
          </div>
        </header>

        <div className="tracking-current-status">
          <span className="tracking-icon small"><Truck size={17} aria-hidden="true" /></span>
          <div className="tracking-status-copy">
            <strong>In Transit</strong>
            <span>Delivery partner</span>
          </div>
          <p className="tracking-estimate">Estimated 13 November 2026</p>
        </div>

        <div className="tracking-reference">
          <span>Tracking number <strong>CHN-5482-9137</strong></span>
          <a href="#tracking" onClick={(event) => event.preventDefault()}>
            View delivery tracking <ExternalLink size={13} aria-hidden="true" />
          </a>
        </div>

        <ol className="tracking-timeline" aria-label="Courier updates">
          {events.map((event, index) => (
            <li className={index === 0 ? "is-current" : ""} key={event.status}>
              <span className="timeline-dot" aria-hidden="true" />
              <div className="timeline-event-copy">
                <strong>{event.status}</strong>
                <p>{event.description}</p>
                <small>
                  <time>{event.time}</time>
                  <span className="timeline-location"><MapPin size={11} aria-hidden="true" />{event.location}</span>
                </small>
              </div>
            </li>
          ))}
        </ol>

        <p className="tracking-refresh-note">Updates are checked automatically while your parcel is moving.</p>
      </section>
    </main>
  );
}

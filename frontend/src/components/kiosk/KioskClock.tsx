import { useState, useEffect } from "react";

export function KioskClock() {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const timeString = time.toLocaleTimeString("fr-FR", {
    timeZone: "Indian/Antananarivo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const dateString = time.toLocaleDateString("fr-FR", {
    timeZone: "Indian/Antananarivo",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="kiosk-live-clock">
      <div className="kiosk-clock-time">{timeString}</div>
      <div className="kiosk-clock-date">{dateString}</div>
    </div>
  );
}

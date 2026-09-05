import { HashRouter, NavLink, Route, Routes } from "react-router-dom";
import { Dashboard } from "./views/Dashboard";
import { Goals } from "./views/Goals";
import { Wishes } from "./views/Wishes";
import { Settings } from "./views/Settings";

export function App() {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <HashRouter>
      <a className="skip-link" href="#ledger-main">
        Skip to ledger
      </a>
      <div className="shell">
        <header className="masthead">
          <div className="masthead-top">
            <h1 className="wordmark">
              Actual Horizon<span className="accent-dot">.</span>
            </h1>
            <p className="dateline">
              <span>Wish ledger</span>
              <span aria-hidden="true">·</span>
              <time dateTime={today}>{today}</time>
            </p>
          </div>
          <nav className="nav" aria-label="Ledger sections">
            <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
              Dashboard
            </NavLink>
            <NavLink to="/goals" className={({ isActive }) => (isActive ? "active" : "")}>
              Goals
            </NavLink>
            <NavLink to="/wishes" className={({ isActive }) => (isActive ? "active" : "")}>
              Wishes
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>
              Settings
            </NavLink>
          </nav>
        </header>
        <main id="ledger-main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/wishes" element={<Wishes />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        <footer className="colophon">
          <span>Set in Fraunces, Newsreader &amp; Plex Mono · ink on paper</span>
          <span>Actual Horizon — spend only what the rate allows</span>
        </footer>
      </div>
    </HashRouter>
  );
}

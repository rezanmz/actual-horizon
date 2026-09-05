import { HashRouter, Link, Route, Routes } from "react-router-dom";
import { Dashboard } from "./views/Dashboard";
import { Goals } from "./views/Goals";
import { Wishes } from "./views/Wishes";

export function App() {
  return (
    <HashRouter>
      <header style={{ display: "flex", gap: 16, alignItems: "baseline", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Actual Horizon</h1>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link to="/">Dashboard</Link>
          <Link to="/goals">Goals</Link>
          <Link to="/wishes">Wishes</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/wishes" element={<Wishes />} />
        </Routes>
      </main>
    </HashRouter>
  );
}

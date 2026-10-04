import { useEffect, useState } from "react";
import { configLoaded } from "./api";
import { AdminPage } from "./pages/AdminPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PlayerPage } from "./pages/PlayerPage";
import { readSession } from "./session";

// Hash-based routing so the SPA works on a static host (GitHub Pages) under any
// base path, with deep links and refresh surviving — no server rewrite rules needed.
// Routes: #/ → player picks, #/leaderboard → public leaderboard, #/admin → admin.
function getRoute(): string {
  const hash = window.location.hash.replace(/^#/, "");
  return (hash || "/").replace(/\/+$/, "") || "/";
}

function useRoute(): string {
  const [route, setRoute] = useState(getRoute());
  useEffect(() => {
    const onChange = () => setRoute(getRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function App() {
  const route = useRoute();
  const [configReady, setConfigReady] = useState(false);
  const [hasSession, setHasSession] = useState(Boolean(readSession()));

  useEffect(() => {
    void configLoaded.then(() => setConfigReady(true));
  }, []);

  useEffect(() => {
    const handler = () => setHasSession(Boolean(readSession()));
    window.addEventListener("session-changed", handler);
    return () => window.removeEventListener("session-changed", handler);
  }, []);

  if (!configReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper text-ink">
        <p className="text-ink/50">Loading…</p>
      </main>
    );
  }

  const page =
    route === "/admin"
      ? <AdminPage />
      : route === "/leaderboard" && hasSession
      ? <LeaderboardPage />
      : route === "/overview" && hasSession
      ? <OverviewPage />
      : <PlayerPage />;
  return (
    <>
      {page}
      {route === "/admin" ? null : <RouteNav route={route} />}
    </>
  );
}

function RouteNav({ route }: { route: string }) {
  const links = [
    { href: "#/", label: "Picks", match: route === "/" },
    { href: "#/leaderboard", label: "Leaderboard", match: route === "/leaderboard" },
    { href: "#/overview", label: "Overview", match: route === "/overview" }
  ];
  return (
    <nav className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4" aria-label="Primary">
      <div className="flex items-center gap-1 rounded-full border border-ink/10 bg-white/95 p-1 shadow-lg backdrop-blur">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            aria-current={link.match ? "page" : undefined}
            className={`min-h-10 rounded-full px-5 text-sm font-bold transition ${
              link.match ? "bg-pitch text-white" : "text-ink/70 hover:bg-ink/5"
            } inline-flex items-center`}
          >
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

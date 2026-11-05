import { useEffect, useState } from "react";
import { api, ApiFailure, type Config } from "./api";
import { Link } from "./components";
import { match, usePath } from "./router";
import Home from "./pages/Home";
import Pay from "./pages/Pay";
import Verify from "./pages/Verify";

export default function App() {
  const path = usePath();
  const [config, setConfig] = useState<Config | undefined>();
  const [configError, setConfigError] = useState<string | undefined>();

  useEffect(() => {
    api.config().then(setConfig, (e) => setConfigError(e instanceof ApiFailure ? e.message : "Cannot load settings."));
  }, []);

  const payParams = match("/pay/:hash", path);

  return (
    <>
      {config?.exampleMode && (
        <div className="example-banner" role="note">
          <strong>EXAMPLE DATA.</strong> A fictional merchant (Northlight Design Studio) bills a fictional client (Beta Labs). Testnet only: no real money moves.
        </div>
      )}
      <header className="topbar">
        <Link to="/" className="brand">
          Truce
        </Link>
        <nav>
          <Link to="/verify">Verify an invoice</Link>
        </nav>
        <span className="net">Whitechain Sepolia (testnet)</span>
      </header>
      <main className="page">
        {configError && <div className="error-note">{configError}</div>}
        {payParams ? <Pay hash={payParams.hash} config={config} /> : path === "/verify" ? <Verify config={config} /> : <Home />}
      </main>
      <footer className="footer">
        A signed payment authorization is a commitment, not locked funds, and the balance check is a snapshot, not a lock. Testnet only.
      </footer>
    </>
  );
}

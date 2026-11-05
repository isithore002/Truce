import { useNavigate } from 'react-router-dom';
import { SCENARIOS, scenarioHash } from '../../lib/api/fixtures';
import { resetMockData } from '../../lib/api/mock';

/** Demo-only scenario switcher (VITE_DEMO_TOOLS=1 and mock mode). */
export function ScenarioBar() {
  const nav = useNavigate();
  return (
    <section className="scenario-bar" aria-label="Demo scenario switcher">
      <div className="wrap">
        <label htmlFor="scenario">Demo scenario</label>
        <select
          id="scenario"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) nav(`/pay/${scenarioHash(e.target.value as (typeof SCENARIOS)[number]['id'])}`);
            e.target.value = '';
          }}
        >
          <option value="">Open an invoice…</option>
          {SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>{s.label} ({s.expect})</option>
          ))}
        </select>
        <button
          type="button"
          className="link"
          style={{ color: 'inherit' }}
          onClick={() => {
            resetMockData();
            location.reload();
          }}
        >
          Reset mock data
        </button>
      </div>
    </section>
  );
}

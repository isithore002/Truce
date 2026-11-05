import { SetupWizard } from '../components/merchant/SetupWizard';

export function SetupPage() {
  return (
    <div className="wrap app-main" style={{ maxWidth: 'calc(880px + 2 * var(--gut))' }}>
      <header className="page-head">
        <span className="label">Merchant setup · about 5 minutes</span>
        <h1>Publish your wallets on your domain</h1>
        <p className="lead muted measure">One small file on your website tells buyers which wallet signs your invoices and which wallet gets paid.</p>
      </header>
      <SetupWizard />
    </div>
  );
}

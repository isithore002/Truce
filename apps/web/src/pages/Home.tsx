import { Link } from "../components";

export default function Home() {
  return (
    <>
      <h1>Invoices a buyer can verify before paying</h1>
      <p className="lead">
        A merchant publishes which wallets they use on their own website and signs each invoice. You check an invoice against that
        list, then pay in USDT with one signature. You never need gas, and the payment contract can only pay the wallet the merchant signed.
      </p>
      <div className="cards">
        <section className="card">
          <h2>Got an invoice?</h2>
          <p>Paste the payment link, the invoice hash, or the invoice itself and see PASS or FAIL before you pay. No wallet needed.</p>
          <Link to="/verify" className="button">
            Verify an invoice
          </Link>
        </section>
      </div>
    </>
  );
}

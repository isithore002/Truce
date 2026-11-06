import { useId, useState } from 'react';
import { Icon } from '../../components/Icon';

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'What does PASS actually check?',
    a: "Ten things: the document is well formed, the merchant's signature matches every field, the merchant's domain publishes the signing wallet and the payout wallet, the invoice is bound to that domain, the token and chain are accepted, it has not expired, the line items are what was signed, and the payer is allowed. All ten must pass.",
  },
  {
    q: 'Is my money locked when I sign?',
    a: 'No. You sign a USDT authorization for this one invoice. It is a commitment, not locked funds: the money stays in your wallet until the relayer submits it, and it can only go to the payout wallet the merchant signed.',
  },
  {
    q: 'Who pays the gas?',
    a: 'A relayer submits the transaction and pays the gas in WBT. The buyer only signs, so they need USDT but no WBT.',
  },
  {
    q: "What if the merchant's wallets change?",
    a: 'After you pay, your browser remembers the wallets that domain published. If they change before your next payment, the pay page shows the old and new wallets and asks you to confirm before Pay is enabled.',
  },
  {
    q: 'Can the same invoice be paid twice?',
    a: 'No. The authorization nonce is the invoice hash, and InvoiceSettler settles each invoice once. A second attempt is rejected.',
  },
  {
    q: 'Is this live on mainnet?',
    a: 'No. Truce runs on Whitechain Sepolia testnet (chain 1874) with test USDT. Amounts and addresses on a testnet are public.',
  },
  {
    q: 'Do I need a server to issue invoices?',
    a: 'You need a domain you control, to host truce.json, and a wallet to sign. The SDK creates and signs invoices in about twenty lines; the Truce server stores them and relays payments.',
  },
];

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const base = useId();
  return (
    <div className="faq">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={it.q} className={`faq__item${isOpen ? ' is-open' : ''}`}>
            <h3>
              <button type="button" aria-expanded={isOpen} aria-controls={`${base}-${i}`} onClick={() => setOpen(isOpen ? null : i)}>
                {it.q}
                <Icon name="plus" size={18} className="faq__icon" />
              </button>
            </h3>
            <div id={`${base}-${i}`} className="faq__panel" hidden={!isOpen}>
              <p>{it.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

import type { LineItem } from '../../lib/api/types';
import { formatUsdt, lineTotal, sumLineItems } from '../../lib/format';

export function LineItems({ items, signedAmount }: { items: LineItem[]; signedAmount?: string }) {
  const total = sumLineItems(items);
  const mismatch = signedAmount !== undefined && BigInt(signedAmount) !== total;
  return (
    <table className="lines">
      <caption className="sr-only">Line items</caption>
      <thead>
        <tr>
          <th scope="col">Item</th>
          <th scope="col" className="num">Qty</th>
          <th scope="col" className="num">Price</th>
          <th scope="col" className="num">Total</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => (
          <tr key={i}>
            <td>{it.description}</td>
            <td className="num">{it.quantity}</td>
            <td className="num">{formatUsdt(it.unitPrice)}</td>
            <td className="num">{formatUsdt(lineTotal(it.quantity, it.unitPrice))}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colSpan={3}>Line items total</th>
          <td className="num">{formatUsdt(total)} USDT</td>
        </tr>
        {mismatch && (
          <tr className="lines__warn">
            <th scope="row" colSpan={3}>Amount this invoice asks for</th>
            <td className="num">{formatUsdt(signedAmount!)} USDT</td>
          </tr>
        )}
      </tfoot>
    </table>
  );
}

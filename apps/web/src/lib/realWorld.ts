/**
 * Real-world reports shown on the landing page. Every figure below was read from the linked source on 2026-11-06
 * (the FBI report and the AFP summary as PDFs, the Cointelegraph article as a web page). They are reported figures, not
 * ours: the landing page says so, and docs/MARKET-RESEARCH.md keeps the evidence grades. Change a number only after
 * re-reading the source.
 */
export interface RealWorldReport {
  id: string;
  /** The big number. */
  figure: string;
  /** What the figure counts, in one line. */
  figureLabel: string;
  /** Plain-language context. */
  body: string;
  /** Who published it, and what it is. */
  sourceName: string;
  sourceKind: string;
  url: string;
  /** A limit the reader should know about this source. */
  caveat: string;
}

export const REAL_WORLD_CHECKED_ON = '2026-11-06';

export const REAL_WORLD: RealWorldReport[] = [
  {
    id: 'fbi-ic3-2025',
    figure: '$3.05 billion',
    figureLabel: 'lost to business email compromise in 2025, as reported to the FBI',
    body:
      'The FBI describes the scam as one that targets businesses working with suppliers and regularly sending wire transfers, run through compromised email accounts. It was the second-largest loss category in the report, after investment fraud, from 24,768 complaints (up from $2.77 billion in 2024).',
    sourceName: 'FBI Internet Crime Complaint Center, 2025 IC3 Annual Report',
    sourceKind: 'Government report (PDF)',
    url: 'https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf',
    caveat: "Complaints filed with the FBI's IC3. It counts what was reported, not everything that happened.",
  },
  {
    id: 'afp-2025',
    figure: '79%',
    figureLabel: 'of organizations faced attempted or actual payments fraud in 2024',
    body:
      'Business email compromise was the top route, cited by 63% of respondents. The survey counts invoice fraud as a form of it, and reports it rose to 24% in 2024 from 14%. Only 22% of organizations recovered 75% or more of the money lost to payments fraud, down from 41% the year before.',
    sourceName: 'Association for Financial Professionals, 2025 Payments Fraud and Control Survey, key highlights (April 2025)',
    sourceKind: 'Industry survey summary (PDF, hosted by its underwriter, Truist)',
    url: 'https://truist.com/content/dam/truist-bank/us/en/documents/info/cci/2025-afp-payments-fraud-control-survey-report-key-highlights.pdf',
    caveat: 'A survey of finance professionals. This is the public summary; the full report is for AFP members.',
  },
  {
    id: 'usdt-address-poisoning-2025',
    figure: '49,999,950 USDT',
    figureLabel: 'sent to a look-alike address in one transfer, reported on 20 December 2025',
    body:
      'The sender first made a small test transfer to the correct address, then copied an address from their own transaction history. It was a look-alike planted there by an attacker: the first three and last four characters matched the real one. The stolen USDT was then swapped and spread across wallets.',
    sourceName: 'Cointelegraph, "How a single copy-paste mistake cost a user $50M in USDt"',
    sourceKind: 'News report',
    url: 'https://cointelegraph.com/news/address-poisoning-copy-paste-mistake-50m-usdt-loss',
    caveat: 'A news report citing an on-chain security firm. The article does not give a transaction hash.',
  },
];

/** What Truce does and does not do about these, shown under the cards. */
export const REAL_WORLD_SCOPE = {
  does: 'Truce checks the payee before money moves. A payout wallet that differs from what the merchant published and signed fails the check, and the contract refuses to pay it.',
  doesNot:
    'It does not stop a merchant whose own website or signing wallet is compromised, an address copied wrongly outside Truce, or a buyer who pays the right wallet for a dishonest invoice.',
};

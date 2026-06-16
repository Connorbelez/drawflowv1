import type { ReactElement } from "react";

const footerLinks = [
  ["Home", "/"],
  ["Construction draws", "/construction-draw-financing"],
  ["Garden suites", "/garden-suite-financing-gta"],
  ["Multiplex financing", "/multiplex-financing-gta"],
  ["Contact", "/contact"],
] as const;

export function FairLendLegalFooter({
  className = "",
}: {
  className?: string;
}): ReactElement {
  return (
    <footer className={`fairlend-legal-footer ${className}`.trim()}>
      <div className="fairlend-legal-footer__brand">
        <strong>FairLend Mortgage</strong>
        <span>FairLend Management Inc</span>
        <span>Legal business name: FairLend Management Inc</span>
      </div>
      <nav aria-label="FairLend footer navigation">
        {footerLinks.map(([label, href]) => (
          <a href={href} key={href}>
            {label}
          </a>
        ))}
      </nav>
      <div className="fairlend-legal-footer__contact">
        <a href="tel:+16478317605">647-831-7605</a>
        <a href="mailto:elie@fairlend.ca">elie@fairlend.ca</a>
        <a href="https://www.fairlend.ca/en/brokerage/privacy-policy">
          Privacy Policy
        </a>
      </div>
      <ul aria-label="FairLend licence numbers">
        <li>Brokerage Licence #13827</li>
        <li>Administrator Licence #13828</li>
      </ul>
    </footer>
  );
}

export function FairLendLegalFooterStyles(): ReactElement {
  return (
    <style>{`
      .fairlend-legal-footer {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
        gap: 24px;
        padding: 28px clamp(20px, 5vw, 56px);
        border-top: 1px solid color-mix(in oklch, currentColor 20%, transparent);
        background: color-mix(in oklch, #073c33 92%, black);
        color: #f8f1e5;
      }

      .fairlend-legal-footer a {
        color: inherit;
        text-decoration: none;
      }

      .fairlend-legal-footer a:hover {
        text-decoration: underline;
      }

      .fairlend-legal-footer__brand,
      .fairlend-legal-footer__contact,
      .fairlend-legal-footer nav,
      .fairlend-legal-footer ul {
        display: grid;
        gap: 8px;
      }

      .fairlend-legal-footer__brand strong {
        font-size: 1rem;
        letter-spacing: 0;
      }

      .fairlend-legal-footer__brand span,
      .fairlend-legal-footer a,
      .fairlend-legal-footer li {
        color: color-mix(in oklch, #f8f1e5 78%, transparent);
        font-size: 0.82rem;
        line-height: 1.45;
      }

      .fairlend-legal-footer ul {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      @media (max-width: 760px) {
        .fairlend-legal-footer {
          grid-template-columns: 1fr;
        }
      }
    `}</style>
  );
}

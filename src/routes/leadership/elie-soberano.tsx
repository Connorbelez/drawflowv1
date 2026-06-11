import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactElement } from "react";

import "./-elie-soberano.css";

const assetRoot = "/assets/fairlend-leadership-elie";
const conceptRoot = `${assetRoot}/concept-sections`;

const sectionImages = {
  hero: `${conceptRoot}/section-01-hero-profile-header.png`,
  shortBio: `${conceptRoot}/section-02-short-bio.png`,
  longBio: `${conceptRoot}/section-03-long-bio.png`,
  thesis: `${conceptRoot}/section-04-founder-thesis.png`,
  expertise: `${conceptRoot}/section-05-areas-of-expertise.png`,
  credentials: `${conceptRoot}/section-06-approved-credentials.png`,
  quotes: `${conceptRoot}/section-07-founder-quotes.png`,
  mediaContact: `${conceptRoot}/section-08-media-contact-cta.png`,
} as const;

type Hotspot = {
  className: string;
  label: string;
  to: string;
};

type FounderArtboardSection = {
  alt: string;
  className?: string;
  hotspots?: Hotspot[];
  id: string;
  image: string;
  label: string;
};

const sections: FounderArtboardSection[] = [
  {
    id: "profile-header",
    label: "Founder profile header",
    image: sectionImages.hero,
    className: "leadership-artboard--hero",
    alt: "Fairlend Capital founder profile header for Elie Soberano with oversized name typography, portrait treatment, blueprint drafting marks, and interview request calls to action.",
    hotspots: [
      {
        className: "leadership-hotspot--hero-interview",
        label: "Request an interview with Fairlend",
        to: "/contact",
      },
      {
        className: "leadership-hotspot--hero-thesis",
        label: "Read Fairlend's housing thesis",
        to: "/affordable-sustainable-rental-housing",
      },
    ],
  },
  {
    id: "short-bio",
    label: "Short bio",
    image: sectionImages.shortBio,
    className: "leadership-artboard--short-bio",
    alt: "Short bio media-kit section with centered editorial copy, Fairlend Capital lockup, approved for press control, and architectural blueprint base drawing.",
  },
  {
    id: "long-bio",
    label: "Long bio",
    image: sectionImages.longBio,
    className: "leadership-artboard--long-bio",
    alt: "Long bio founder story section with project dossier collage, multiplex and garden-suite imagery, construction draw plan, and right-column editorial biography.",
  },
  {
    id: "founder-thesis",
    label: "Founder thesis",
    image: sectionImages.thesis,
    className: "leadership-artboard--thesis",
    alt: "Dark cinematic founder thesis section over GTA construction and rental housing imagery with a large pull quote about livable rental homes.",
    hotspots: [
      {
        className: "leadership-hotspot--thesis-link",
        label: "Read the housing thesis",
        to: "/affordable-sustainable-rental-housing",
      },
    ],
  },
  {
    id: "areas-of-expertise",
    label: "Areas of expertise",
    image: sectionImages.expertise,
    className: "leadership-artboard--expertise",
    alt: "Areas of expertise section with bento grid for private lending, mortgage strategy, construction financing, GTA real estate, multiplex and garden-suite financing, and housing finance.",
    hotspots: [
      {
        className: "leadership-hotspot--expertise-invite",
        label: "Invite Elie to comment on these topics",
        to: "/contact",
      },
    ],
  },
  {
    id: "approved-credentials",
    label: "Approved credentials and claims",
    image: sectionImages.credentials,
    className: "leadership-artboard--credentials",
    alt: "Approved credentials and claims section with verified publication checklist, compliance note, and document cards for bio, title, claims, and contact.",
  },
  {
    id: "founder-quotes",
    label: "Founder quotes",
    image: sectionImages.quotes,
    className: "leadership-artboard--quotes",
    alt: "Founder quotes section with split quote wall, Fairlend Capital lockup, blueprint sketch, and approved quotes action.",
    hotspots: [
      {
        className: "leadership-hotspot--quotes-copy",
        label: "Copy approved founder quotes",
        to: "/contact",
      },
      {
        className: "leadership-hotspot--quotes-interview",
        label: "Request an interview",
        to: "/contact",
      },
    ],
  },
  {
    id: "media-contact",
    label: "Media appearances and interview contact",
    image: sectionImages.mediaContact,
    className: "leadership-artboard--media-contact",
    alt: "Media contact closing section with request an interview headline, media appearances empty state, microphone and blueprint desk image, contact media team banner, media kit download, and Fairlend footer.",
    hotspots: [
      {
        className: "leadership-hotspot--contact-media",
        label: "Contact Fairlend media team",
        to: "/contact",
      },
      {
        className: "leadership-hotspot--download-kit",
        label: "Download Fairlend media kit",
        to: "/press",
      },
    ],
  },
];

export const Route = createFileRoute("/leadership/elie-soberano")({
  component: LeadershipElieSoberanoPage,
  head: () => ({
    meta: [
      {
        title: "Elie Soberano | Founder, Fairlend",
      },
      {
        name: "description",
        content:
          "Media-ready founder profile for Elie Soberano, Founder of Fairlend, including approved biography, housing-finance thesis, expertise areas, quotes, and interview contact path.",
      },
    ],
    links: [
      {
        rel: "preload",
        as: "image",
        href: sectionImages.hero,
      },
      {
        rel: "preload",
        as: "image",
        href: sectionImages.shortBio,
      },
      {
        rel: "preload",
        as: "image",
        href: sectionImages.thesis,
      },
    ],
  }),
});

function LeadershipElieSoberanoPage(): ReactElement {
  return (
    <main className="leadership-page" data-page="elie-soberano">
      <a className="leadership-skip-link" href="#profile-header">
        Skip to founder profile
      </a>
      <h1 className="leadership-sr-only">Elie Soberano, Founder of Fairlend</h1>
      <LeadershipSemanticCopy />
      <div className="leadership-artboard-stack">
        {sections.map((section) => (
          <FounderSectionArtboard key={section.id} section={section} />
        ))}
      </div>
    </main>
  );
}

function FounderSectionArtboard({
  section,
}: {
  section: FounderArtboardSection;
}): ReactElement {
  return (
    <section
      aria-label={section.label}
      className={`leadership-artboard ${section.className ?? ""}`}
      id={section.id}
    >
      <img
        alt={section.alt}
        className="leadership-artboard__image"
        decoding={section.id === "profile-header" ? "sync" : "async"}
        fetchPriority={section.id === "profile-header" ? "high" : "auto"}
        loading={section.id === "profile-header" ? "eager" : "lazy"}
        src={section.image}
      />
      {section.hotspots?.map((hotspot) => (
        <Link
          aria-label={hotspot.label}
          className={`leadership-hotspot ${hotspot.className}`}
          key={hotspot.className}
          preload="intent"
          to={hotspot.to}
          viewTransition
        />
      ))}
    </section>
  );
}

function LeadershipSemanticCopy(): ReactElement {
  return (
    <article className="leadership-sr-only">
      <section aria-labelledby="founder-hero-copy">
        <h2 id="founder-hero-copy">Elie Soberano</h2>
        <p>Founder, Fairlend</p>
        <p>
          Elie Soberano leads Fairlend&apos;s work in private lending, mortgage
          strategy, construction financing, and capital solutions for GTA
          housing projects.
        </p>
        <p>
          His focus is helping property owners, builders, brokers, and
          investors structure financing for multiplexes, garden suites, and
          rental housing projects with greater transparency and practical
          underwriting.
        </p>
      </section>

      <section aria-labelledby="short-bio-copy">
        <h2 id="short-bio-copy">Short bio</h2>
        <p>
          Elie Soberano is the Founder of Fairlend, a GTA-focused private
          lending and housing-finance company. His work focuses on mortgage
          strategy, construction financing, private credit, and financing
          solutions for multiplexes, garden suites, and rental housing projects.
        </p>
      </section>

      <section aria-labelledby="long-bio-copy">
        <h2 id="long-bio-copy">Long bio</h2>
        <p>
          Elie Soberano founded Fairlend to make private lending more
          transparent, efficient, and aligned with the housing projects the GTA
          needs most.
        </p>
        <p>
          Through Fairlend, Elie works with borrowers, builders, brokers, and
          capital partners on financing strategies for multiplexes, garden
          suites, construction projects, and rental housing opportunities. His
          work emphasizes practical underwriting, clear communication,
          responsible risk assessment, and capital structures that reflect how
          real projects are actually built.
        </p>
        <p>
          Elie&apos;s housing-finance thesis is straightforward: the GTA needs
          more livable rental supply, and private capital can play a
          constructive role when it is deployed with discipline, transparency,
          and alignment between borrowers and investors.
        </p>
        <p>
          Fairlend&apos;s work is especially focused on missing-middle housing,
          garden suites, laneway suites, construction draw planning, and rental
          housing projects that may benefit from deeper financing strategy
          before they can move forward.
        </p>
      </section>

      <section aria-labelledby="founder-thesis-copy">
        <h2 id="founder-thesis-copy">Founder thesis</h2>
        <blockquote>
          The GTA does not only need more housing units. It needs more livable,
          sustainable, family-suitable rental homes, and that requires better
          capital structures for the people actually building them.
        </blockquote>
        <p>
          Fairlend&apos;s thesis is that private lending should not be treated
          only as a last-resort financing option. When structured responsibly,
          private capital can help unlock viable housing projects that are too
          nuanced, too time-sensitive, or too construction-specific for
          conventional lending pathways.
        </p>
      </section>

      <section aria-labelledby="expertise-copy">
        <h2 id="expertise-copy">Areas of expertise</h2>
        <dl>
          <dt>Private lending</dt>
          <dd>
            How private mortgage capital is structured, priced, reviewed, and
            deployed.
          </dd>
          <dt>Mortgage strategy</dt>
          <dd>
            How borrowers, brokers, and property owners can evaluate financing
            options across conventional and private channels.
          </dd>
          <dt>Construction financing</dt>
          <dd>
            How budgets, permits, timelines, draw schedules, and project
            milestones affect capital structure.
          </dd>
          <dt>GTA real estate</dt>
          <dd>
            How local market conditions, zoning changes, missing-middle housing,
            and rental demand affect financing strategy.
          </dd>
          <dt>Multiplex and garden suite financing</dt>
          <dd>
            How small-scale rental housing projects can be assessed, structured,
            and moved through a practical financing review.
          </dd>
          <dt>Housing finance</dt>
          <dd>
            How private capital, public programs, borrower incentives, and
            investor expectations interact in the housing market.
          </dd>
        </dl>
      </section>

      <section aria-labelledby="credentials-copy">
        <h2 id="credentials-copy">Approved credentials and claims</h2>
        <p>The following information should be finalized before publication:</p>
        <ul>
          <li>Approved professional title</li>
          <li>Approved licensing or registration language, if applicable</li>
          <li>Approved company description</li>
          <li>Approved founder biography</li>
          <li>Approved speaking topics</li>
          <li>Approved media contact details</li>
          <li>
            Approved claims about transaction volume, experience, assets, or
            project history, if any
          </li>
        </ul>
        <p>
          No unverified metrics, rankings, performance claims, or regulatory
          claims should be published on this page.
        </p>
      </section>

      <section aria-labelledby="quotes-copy">
        <h2 id="quotes-copy">Founder quotes</h2>
        <blockquote>
          Private lending should be clear enough that a borrower understands
          what they are agreeing to and disciplined enough that an investor
          understands the risk being taken.
        </blockquote>
        <blockquote>
          Multiplexes and garden suites are not abstract policy ideas. They are
          real projects with real budgets, real timelines, and real financing
          gaps.
        </blockquote>
        <blockquote>
          The GTA needs capital that understands construction reality, not just
          spreadsheet theory.
        </blockquote>
        <blockquote>
          Better housing outcomes require better alignment between property
          owners, builders, lenders, investors, and communities.
        </blockquote>
      </section>

      <section aria-labelledby="media-contact-copy">
        <h2 id="media-contact-copy">Request an interview</h2>
        <p>
          Media appearances, interviews, podcasts, and commentary will be added
          here as they become available.
        </p>
        <p>
          Elie is available for interviews and commentary on GTA housing
          finance, multiplex financing, garden suites, private lending,
          construction draws, and the role of private capital in rental housing
          supply.
        </p>
      </section>
    </article>
  );
}

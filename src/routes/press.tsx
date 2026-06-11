import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clipboard,
  Copy,
  Download,
  FileArchive,
  FileText,
  Image,
  Mail,
  Mic2,
  Newspaper,
  Search,
  ShieldAlert,
} from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import "./-press-media-kit.css";

const assetBase = "/assets/fairlend-redesign";
const brandKitAsset = "/designConcepts/WarmBlueprintBrutalistModern.png";
const heroBuildingAsset = "/assets/fairlend-path-gta-sixplex-lane-suite.webp";
const companyAsset = "/assets/fairlend-path-gta-sixplex-lane-suite.webp";
const founderAsset = `${assetBase}/press-founder-portrait.webp`;
const assetLibraryAsset = `${assetBase}/press-kit-collage.webp`;
const commentaryAsset = `${assetBase}/contact-hero-neighbourhood.webp`;
const archiveAsset = `${assetBase}/resources-index-brandkit.webp`;

export const Route = createFileRoute("/press")({
  component: PressPage,
  head: () => ({
    meta: [
      {
        title: "Press and Media Kit | Fairlend",
      },
      {
        name: "description",
        content:
          "Official Fairlend media resources including company background, founder bio, approved descriptions, commentary topics, brand assets, and media contact.",
      },
    ],
    links: [
      {
        rel: "preload",
        as: "image",
        href: heroBuildingAsset,
      },
      {
        rel: "preload",
        as: "image",
        href: brandKitAsset,
      },
    ],
  }),
});

const descriptions = [
  {
    index: "01",
    label: "One-line description",
    body: "Fairlend provides private lending solutions for GTA multiplexes, garden suites, construction projects, and rental housing opportunities.",
  },
  {
    index: "02",
    label: "Short description",
    body: "Fairlend is a GTA-focused private lending and housing-finance company helping property owners, builders, brokers, and investors structure financing for multiplexes, garden suites, construction projects, and rental housing opportunities.",
  },
  {
    index: "03",
    label: "Standard description",
    body: "Fairlend provides private lending and housing-finance solutions for projects across the Greater Toronto Area, including multiplexes, garden suites, laneway suites, construction draws, and rental housing opportunities. The company focuses on transparent underwriting, practical capital structures, responsible investor-borrower alignment, and the role private capital can play in supporting better housing outcomes.",
  },
];

const commentaryTopics = [
  "Multiplex financing",
  "Garden suites and laneway suites",
  "CMHC MLI Select considerations",
  "Affordable rental housing",
  "Sustainable housing",
  "Private capital",
  "Construction draw financing",
  "Missing-middle housing in the GTA",
  "Financing gaps for small-scale projects",
];

const downloads = [
  {
    label: "Headshots",
    meta: "High Res",
    icon: Image,
  },
  {
    label: "Logos",
    meta: "Light & Dark",
    icon: FileArchive,
  },
  {
    label: "Brand Guidelines",
    meta: "PDF",
    icon: BookOpen,
  },
];

const archiveRows = [
  {
    type: "Interview",
    title: "Article headline will appear here",
  },
  {
    type: "Podcast",
    title: "Article headline will appear here",
  },
  {
    type: "Commentary",
    title: "Article headline will appear here",
  },
];

function PressPage(): ReactElement {
  return (
    <main className="press-kit-shell">
      <PressHero />
      <CompanyBoilerplate />
      <FounderBio />
      <AssetLibrary />
      <ApprovedDescriptions />
      <CommentaryTopics />
      <PressArchive />
      <MediaContact />
    </main>
  );
}

function PressHero(): ReactElement {
  return (
    <section aria-labelledby="press-hero-title" className="press-hero">
      <aside aria-hidden className="press-hero__rail">
        <FairlendMark />
        <span />
        <p>Official Media Resource</p>
        <span />
        <div className="press-crosshair" />
      </aside>

      <div className="press-hero__left">
        <PressNav />
        <div className="press-hero__copy">
          <p className="press-overline">Fairlend Press</p>
          <h1 id="press-hero-title">Media resources, approved.</h1>
          <p>
            Company background, founder bio, commentary topics, logos, and
            approved language for media coverage.
          </p>
        </div>
        <Card className="press-contact-note">
          <div className="press-contact-note__clip" />
          <p>Press contact</p>
          <div>
            <Mail aria-hidden="true" />
            <span>
              For interviews, podcasts, event organizers, and publisher
              requests.
            </span>
          </div>
          <a href="mailto:press@fairlend.com">press@fairlend.com</a>
        </Card>
      </div>

      <div className="press-hero__right">
        <div className="press-hero__blueprint" />
        <img
          alt="GTA multiplex building with Fairlend blueprint treatment."
          className="press-hero__building"
          decoding="async"
          fetchPriority="high"
          src={heroBuildingAsset}
        />
        <div className="press-hero__right-footer">
          <Button
            className="press-button press-button--primary"
            render={<a href="mailto:press@fairlend.com" />}
            size="xl"
          >
            Contact Media Team
            <ArrowRight aria-hidden="true" />
          </Button>
          <Button
            className="press-button press-button--outline"
            render={<Link hash="assets" to="/press" />}
            size="xl"
            variant="outline"
          >
            View Assets
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
        <p className="press-hero__tagline">
          Smart Capital. <span /> Strong Communities.
        </p>
      </div>
    </section>
  );
}

function PressNav(): ReactElement {
  return (
    <header className="press-nav">
      <Link aria-label="Fairlend home" className="press-nav__brand" to="/">
        <FairlendMark />
        <span>Fairlend</span>
      </Link>
      <nav aria-label="Press page navigation">
        <Link hash="company" to="/press">
          Company
        </Link>
        <Link hash="founder" to="/press">
          Founder
        </Link>
        <Link hash="assets" to="/press">
          Assets
        </Link>
        <Link hash="commentary" to="/press">
          Commentary
        </Link>
        <Link hash="contact" to="/press">
          Contact
        </Link>
      </nav>
    </header>
  );
}

function CompanyBoilerplate(): ReactElement {
  return (
    <section
      aria-labelledby="company-boilerplate-title"
      className="press-section press-boilerplate"
      id="company"
    >
      <div className="press-section__grid press-section__grid--boilerplate">
        <div className="press-boilerplate__header">
          <p className="press-kicker">Press / Media Kit</p>
          <h2 id="company-boilerplate-title">Company boilerplate</h2>
        </div>
        <p className="press-boilerplate__aside">
          Approved company description for media and partner use.
        </p>
        <div aria-hidden className="press-stamp">
          Approved
          <br />
          Language
        </div>

        <Frame className="press-paper-frame press-boilerplate__copy">
          <FramePanel>
            <p>Approved language</p>
            <blockquote>
              Fairlend is a GTA-focused private lending and housing-finance
              company providing financing solutions for multiplexes, garden
              suites, construction projects, and rental housing opportunities.
            </blockquote>
            <div className="press-action-row">
              <Button
                className="press-button press-button--primary"
                size="lg"
              >
                <Copy aria-hidden="true" />
                Copy Boilerplate
              </Button>
              <Button
                className="press-button press-button--outline"
                size="lg"
                variant="outline"
              >
                <Download aria-hidden="true" />
                Download as DOCX
              </Button>
            </div>
          </FramePanel>
        </Frame>

        <div className="press-boilerplate__visual">
          <div className="press-blueprint-card" />
          <img
            alt="Fairlend multiplex media image with blueprint treatment."
            loading="lazy"
            src={companyAsset}
          />
          <Card className="press-sketch-card">
            <Building2 aria-hidden="true" />
            <span>Focused on better housing outcomes.</span>
          </Card>
        </div>
      </div>
    </section>
  );
}

function FounderBio(): ReactElement {
  return (
    <section
      aria-labelledby="founder-bio-title"
      className="press-section press-founder"
      id="founder"
    >
      <div className="press-founder__image">
        <img
          alt="Fairlend founder media portrait placeholder."
          loading="lazy"
          src={founderAsset}
        />
        <div aria-hidden className="press-founder__blueprint" />
      </div>

      <div className="press-founder__copy">
        <p className="press-kicker">Press & Media Kit</p>
        <p className="press-founder__label">Founder bio</p>
        <h2 id="founder-bio-title">Elie Soberano</h2>
        <p>
          Founder of Fairlend, focused on GTA multiplexes, garden suites,
          construction financing, and practical capital solutions for better
          rental housing supply.
        </p>
        <Link className="press-inline-link" to="/leadership/elie-soberano">
          View Full Founder Profile
          <ArrowRight aria-hidden="true" />
        </Link>
        <div className="press-chip-row">
          <span>Private lending</span>
          <span>Housing finance</span>
          <span>GTA rental supply</span>
        </div>
      </div>
    </section>
  );
}

function AssetLibrary(): ReactElement {
  return (
    <section
      aria-labelledby="asset-library-title"
      className="press-section press-assets"
      id="assets"
    >
      <div className="press-assets__header">
        <p className="press-kicker">Media asset library</p>
        <h2 id="asset-library-title">
          Approved files,
          <br />
          ready for publication.
        </h2>
        <p>
          Official headshots, logos, and brand assets for use in media coverage
          and publications. Please use only the approved materials provided
          here.
        </p>
      </div>

      <div className="press-assets__grid">
        <Card className="press-asset-card press-asset-card--headshot">
          <p>Approved headshots</p>
          <div className="press-headshot-frame">
            <img
              alt="Approved Fairlend founder headshot placeholder."
              loading="lazy"
              src={founderAsset}
            />
            <span>Approved</span>
          </div>
          <p>
            Approved founder headshots for editorial use. Please credit
            Fairlend where appropriate.
          </p>
          <Button className="press-button press-button--primary" size="lg">
            <ArrowDownToLine aria-hidden="true" />
            Download Headshots
          </Button>
        </Card>

        <Card className="press-asset-card press-asset-card--logos">
          <p>Logos</p>
          <div className="press-logo-pair">
            <div>
              <FairlendMark />
              <span>Light logo</span>
            </div>
            <div>
              <FairlendMark />
              <span>Dark logo</span>
            </div>
          </div>
          <div className="press-usage-note">
            <ShieldAlert aria-hidden="true" />
            <span>
              Please do not alter, stretch, recolor, or modify the Fairlend logo
              without written approval.
            </span>
          </div>
          <Button
            className="press-button press-button--outline"
            size="lg"
            variant="outline"
          >
            <Download aria-hidden="true" />
            Download Logos
          </Button>
        </Card>

        <Card className="press-asset-card press-asset-card--guidelines">
          <p>Brand assets & guidelines</p>
          <div className="press-guideline-row">
            <FileText aria-hidden="true" />
            <span>
              Includes brand guidelines, logo usage rules, color palette,
              typography, and visual references.
            </span>
          </div>
          <Link className="press-inline-link" hash="contact" to="/press">
            Request Brand Assets
            <ArrowRight aria-hidden="true" />
          </Link>
        </Card>

        <Card className="press-asset-card press-asset-card--manifest">
          <p>Download manifest</p>
          {downloads.map((download) => {
            const Icon = download.icon;
            return (
              <div className="press-download-row" key={download.label}>
                <Icon aria-hidden="true" />
                <span>{download.label}</span>
                <em>{download.meta}</em>
                <Download aria-hidden="true" />
              </div>
            );
          })}
        </Card>
      </div>

      <div className="press-assets__footer">
        <img
          alt="Fairlend brand kit materials."
          loading="lazy"
          src={assetLibraryAsset}
        />
        <div>
          <FairlendMark />
          <p>Fairlend Capital</p>
          <span>Smart Capital. Strong Communities.</span>
        </div>
        <a href="mailto:press@fairlend.com">
          <Mail aria-hidden="true" />
          press@fairlend.com
          <ArrowRight aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

function ApprovedDescriptions(): ReactElement {
  return (
    <section
      aria-labelledby="approved-descriptions-title"
      className="press-section press-descriptions"
    >
      <div className="press-descriptions__copy">
        <p className="press-kicker">Fairlend Capital | Press / Media Kit</p>
        <h2 id="approved-descriptions-title">
          Approved company descriptions
        </h2>
        <p>
          Use the following approved descriptions when referencing Fairlend in
          profiles, event listings, and media coverage.
        </p>

        <div className="press-description-stack">
          {descriptions.map((description, index) => (
            <Card
              className="press-description-card"
              key={description.label}
              style={{ "--card-index": index } as React.CSSProperties}
            >
              <span>{description.index}</span>
              <div>
                <h3>{description.label}</h3>
                <p>{description.body}</p>
              </div>
              <Button
                aria-label={`Copy ${description.label}`}
                className="press-description-card__copy"
                size={index === 0 ? "xl" : "icon-lg"}
                variant={index === 0 ? "default" : "ghost"}
              >
                <Copy aria-hidden="true" />
                {index === 0 ? "Copy" : null}
              </Button>
            </Card>
          ))}
        </div>
      </div>

      <div className="press-descriptions__blueprint">
        <div className="press-building-line" />
        <Card className="press-language-card">
          <Clipboard aria-hidden="true" />
          <div>
            <h3>Approved language</h3>
            <p>Approved language for profiles, event listings, and coverage.</p>
          </div>
        </Card>
      </div>
    </section>
  );
}

function CommentaryTopics(): ReactElement {
  return (
    <section
      aria-labelledby="commentary-topics-title"
      className="press-commentary"
      id="commentary"
    >
      <aside aria-hidden className="press-commentary__rail">
        <FairlendMark />
        <p>Commentary Topics</p>
      </aside>
      <div className="press-commentary__media">
        <img
          alt="GTA housing and construction scene for Fairlend commentary topics."
          loading="lazy"
          src={commentaryAsset}
        />
      </div>
      <div className="press-commentary__copy">
        <h2 id="commentary-topics-title">Available for commentary on</h2>
        <p>
          Fairlend&apos;s team is available for interviews, expert commentary,
          and insight on the topics shaping housing and private capital in the
          GTA.
        </p>
      </div>
      <div className="press-topic-strip">
        {commentaryTopics.map((topic, index) => (
          <Card
            className="press-topic-card"
            key={topic}
            style={{ "--topic-index": index + 1 } as React.CSSProperties}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h3>{topic}</h3>
            <ArrowRight aria-hidden="true" />
          </Card>
        ))}
      </div>
      <Card className="press-briefing-card">
        <h3>Looking for perspective from the field?</h3>
        <Link to="/contact">
          Book a media briefing
          <ArrowRight aria-hidden="true" />
        </Link>
        <p>
          Our team can provide context on policy, private lending, housing
          supply, and the role of private capital in building better
          communities.
        </p>
      </Card>
    </section>
  );
}

function PressArchive(): ReactElement {
  return (
    <section
      aria-labelledby="press-archive-title"
      className="press-section press-archive"
    >
      <div className="press-archive__header">
        <p className="press-kicker">Current media coverage</p>
        <h2 id="press-archive-title">
          Press releases
          <br />& media mentions
        </h2>
        <p>
          Official announcements, interviews, podcasts, and published coverage
          about Fairlend will appear here once they are available.
        </p>
        <div className="press-archive__filters">
          <label>
            <Search aria-hidden="true" />
            <span>Search releases or coverage...</span>
          </label>
          <button type="button">All types</button>
          <button type="button">All dates</button>
        </div>
      </div>

      <div className="press-archive__columns">
        <div className="press-archive-column">
          <h3>
            <FileText aria-hidden="true" />
            Press releases
          </h3>
          <p>Company announcements & updates</p>
          <Card className="press-empty-card">
            <Newspaper aria-hidden="true" />
            <span>Announcements will be posted here as they become available.</span>
          </Card>
          {[0, 1].map((row) => (
            <Card className="press-skeleton-row" key={row}>
              <FileText aria-hidden="true" />
              <span />
              <span />
              <CalendarDays aria-hidden="true" />
            </Card>
          ))}
          <Button
            className="press-button press-button--outline"
            size="lg"
            variant="outline"
          >
            Subscribe for updates
          </Button>
        </div>

        <div className="press-archive-column press-archive-column--mentions">
          <h3>
            <Mic2 aria-hidden="true" />
            Media mentions
          </h3>
          <p>Interviews, podcasts & published commentary</p>
          <Card className="press-empty-card press-empty-card--blue">
            <Mic2 aria-hidden="true" />
            <span>
              Media coverage, interviews, podcasts, and published commentary
              will be listed here.
            </span>
          </Card>
          {archiveRows.map((row) => (
            <Card className="press-mention-row" key={row.type}>
              <div />
              <div>
                <p>Publication</p>
                <h4>{row.title}</h4>
                <span>
                  Short summary or excerpt from the piece goes here to give
                  context about the coverage.
                </span>
              </div>
              <em>{row.type}</em>
              <ArrowRight aria-hidden="true" />
            </Card>
          ))}
          <Link className="press-inline-link" to="/contact">
            Send coverage link
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>

      <aside className="press-archive__note">
        <p>Note</p>
        <h3>Archive opens when coverage begins.</h3>
        <div className="press-building-line" />
        <p>Thank you for helping share the Fairlend story.</p>
        <FairlendMark />
      </aside>

      <img
        alt=""
        aria-hidden="true"
        className="press-archive__asset"
        loading="lazy"
        src={archiveAsset}
      />
    </section>
  );
}

function MediaContact(): ReactElement {
  return (
    <section
      aria-labelledby="media-contact-title"
      className="press-contact"
      id="contact"
    >
      <div className="press-contact__blueprint press-contact__blueprint--left" />
      <div className="press-contact__blueprint press-contact__blueprint--right" />
      <div className="press-contact__body">
        <p className="press-kicker">Media contact</p>
        <h2 id="media-contact-title">Need Fairlend for a story?</h2>
        <p>
          For interviews, commentary, founder bio requests, brand assets, or
          press inquiries, contact Fairlend&apos;s media team.
        </p>
        <Button
          className="press-button press-button--primary"
          render={<a href="mailto:press@fairlend.com" />}
          size="xl"
        >
          Contact Media Team
          <ArrowRight aria-hidden="true" />
        </Button>
        <div className="press-contact__trust">
          <CheckCircle2 aria-hidden="true" />
          <span>Official materials. Approved language. Fast response.</span>
        </div>
      </div>
      <footer className="press-contact__footer">
        <Link aria-label="Fairlend home" className="press-footer-brand" to="/">
          <FairlendMark />
          <span>
            Fairlend
            <em>Capital</em>
          </span>
        </Link>
        <a href="mailto:press@fairlend.com">
          <Mail aria-hidden="true" />
          press@fairlend.com
        </a>
        <p>
          Toronto / GTA
          <span>Housing finance, built for communities.</span>
        </p>
        <nav aria-label="Footer navigation">
          <Link to="/about">About Fairlend</Link>
          <Link to="/investors">Investors</Link>
          <Link to="/contact">Contact</Link>
        </nav>
      </footer>
    </section>
  );
}

function FairlendMark(): ReactElement {
  return (
    <span aria-hidden="true" className="press-mark">
      <span />
    </span>
  );
}

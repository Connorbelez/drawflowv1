import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  Home,
  Landmark,
  Leaf,
  Newspaper,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { CSSProperties, ReactElement } from "react";
import { useEffect, useRef } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";

import "./fairlend-public.css";

import type {
  ArticlePageId,
  CorePageId,
  IntakeField,
  IntakePageId,
} from "./fairlend-public-content-types";
import { articlePages } from "./fairlend-public-article-content";
import { corePages } from "./fairlend-public-core-content";
import { intakePages } from "./fairlend-public-intake-content";

export { articlePages, corePages, intakePages };

const authorityAsset = "/assets/fairlend-public/editorial-authority-plate.png";


const navItems = [
  { label: "Multiplex", href: "/multiplex-financing-gta" },
  { label: "Garden suites", href: "/garden-suite-financing-gta" },
  { label: "MLI Select", href: "/cmhc-mli-select-multiplex-financing" },
  { label: "Investors", href: "/investors" },
  { label: "Resources", href: "/resources" },
];

const iconSequence = [
  Home,
  Building2,
  Landmark,
  Leaf,
  ShieldCheck,
  ClipboardCheck,
  UsersRound,
  Newspaper,
];

export function getCorePageHead(pageId: CorePageId) {
  const page = corePages[pageId];
  return {
    meta: [
      { title: page.title },
      { name: "description", content: page.description },
    ],
    links: [
      { rel: "preload", as: "image", href: page.brandKit },
      { rel: "preload", as: "image", href: authorityAsset },
    ],
  };
}

export function getIntakePageHead(pageId: IntakePageId) {
  const page = intakePages[pageId];
  return {
    meta: [
      { title: page.title },
      { name: "description", content: page.description },
    ],
    links: [{ rel: "preload", as: "image", href: page.brandKit }],
  };
}

export function getArticlePageHead(pageId: ArticlePageId) {
  const page = articlePages[pageId];
  return {
    meta: [
      { title: page.title },
      { name: "description", content: page.description },
    ],
    links: [{ rel: "preload", as: "image", href: page.brandKit }],
  };
}

export function FairlendPublicPage({
  pageId,
}: {
  pageId: CorePageId;
}): ReactElement {
  const page = corePages[pageId];
  const rootRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useFairlendPageMotion(rootRef);
  useFairlendMotion(rootRef, pinRef, trackRef);

  return (
    <main
      className={`flp-shell flp-theme-${page.theme}`}
      ref={rootRef}
      style={{ "--flp-kit": `url("${page.brandKit}")` } as CSSProperties}
    >
      <FairlendNav />
      <section aria-labelledby={`${page.id}-title`} className="flp-hero">
        <div className="flp-hero-copy">
          <p className="flp-kicker" data-flp-hero-reveal>
            {page.kicker}
          </p>
          <h1 data-flp-hero-reveal id={`${page.id}-title`}>
            {page.headline}
          </h1>
          <p data-flp-hero-reveal>{page.deck}</p>
          <div className="flp-actions" data-flp-hero-reveal>
            <Button
              className="flp-primary-button"
              render={<a href={page.primaryHref} />}
              size="xl"
            >
              {page.primaryCta}
              <ArrowRight aria-hidden="true" />
            </Button>
            {page.secondaryCta ? (
              <Button
                className="flp-secondary-button"
                render={<a href={page.secondaryHref} />}
                size="xl"
                variant="outline"
              >
                {page.secondaryCta}
              </Button>
            ) : null}
          </div>
        </div>
        <div
          aria-label={`${page.kicker} brand kit visual`}
          className="flp-hero-art"
          data-flp-hero-art
        >
          <img
            alt=""
            decoding="async"
            fetchPriority="high"
            src={page.brandKit}
          />
          <div className="flp-hero-plate">
            <span>Fairlend review path</span>
            <strong>{page.process[0]}</strong>
          </div>
        </div>
      </section>

      <section
        aria-labelledby={`${page.id}-context`}
        className="flp-context"
        data-flp-reveal
      >
        <div>
          <p className="flp-kicker">Context</p>
          <h2 id={`${page.id}-context`}>{page.audience}</h2>
        </div>
        <p>{page.belief}</p>
      </section>

      {page.caution ? (
        <section
          aria-label="Important qualification note"
          className="flp-caution"
          data-flp-reveal
        >
          <ShieldCheck aria-hidden="true" />
          <p>{page.caution}</p>
        </section>
      ) : null}

      <section aria-labelledby={`${page.id}-interest`} className="flp-bento">
        <div className="flp-section-head">
          <p className="flp-kicker">What this page resolves</p>
          <h2 id={`${page.id}-interest`}>
            The questions a serious review has to answer.
          </h2>
        </div>
        <div className="flp-bento-grid">
          {page.cards.map((card, index) => {
            const Icon = iconSequence[index % iconSequence.length];
            return (
              <Card
                className={`flp-info-card flp-info-card-${index + 1}`}
                data-flp-reveal
                key={card.title}
                render={card.href ? <a href={card.href} /> : undefined}
                style={{ "--flp-stagger": `${index * 0.06}s` } as CSSProperties}
              >
                <div aria-hidden="true" className="flp-card-image" />
                <div className="flp-card-body">
                  <Icon aria-hidden="true" />
                  <h3>{card.title}</h3>
                  <p>{card.copy}</p>
                </div>
                {card.href ? (
                  <ArrowRight aria-hidden="true" className="flp-card-arrow" />
                ) : null}
              </Card>
            );
          })}
        </div>
      </section>

      <section
        aria-labelledby={`${page.id}-desire`}
        className="flp-scroll-story"
        data-flp-reveal
      >
        <div className="flp-scroll-pin" ref={pinRef}>
          <p className="flp-kicker">Decision path</p>
          <h2 id={`${page.id}-desire`}>
            A cleaner path from interest to underwriting.
          </h2>
          <p>
            Each page is built to move the right visitor from research into a
            useful review, without overpromising outcomes or hiding what
            Fairlend needs to know.
          </p>
        </div>
        <div className="flp-step-track" ref={trackRef}>
          {page.process.map((step, index) => (
            <Card className="flp-step-card" key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
              <p>{page.proof[index % page.proof.length]}</p>
            </Card>
          ))}
        </div>
      </section>

      <section
        aria-labelledby={`${page.id}-authority`}
        className="flp-authority"
        data-flp-reveal
      >
        <div>
          <p className="flp-kicker">Authority layer</p>
          <h2 id={`${page.id}-authority`}>
            Real estate finance, construction sequence, and housing policy
            belong in the same conversation.
          </h2>
          <p>
            Fairlend's public site now gives media, borrowers, builders,
            investors, and referral partners enough substance to understand the
            thesis and take the next step.
          </p>
        </div>
        <img
          alt="Fairlend review materials layered over GTA missing-middle housing blueprints"
          decoding="async"
          loading="lazy"
          src={authorityAsset}
        />
      </section>

      <FairlendFooter
        primaryCta={page.primaryCta}
        primaryHref={page.primaryHref}
      />
    </main>
  );
}

export function FairlendIntakePage({
  pageId,
}: {
  pageId: IntakePageId;
}): ReactElement {
  const page = intakePages[pageId];
  const rootRef = useRef<HTMLElement>(null);

  useFairlendPageMotion(rootRef);

  return (
    <main
      className="flp-shell flp-theme-paper flp-intake-shell"
      ref={rootRef}
      style={{ "--flp-kit": `url("${page.brandKit}")` } as CSSProperties}
    >
      <FairlendNav />
      <section aria-labelledby={`${page.id}-title`} className="flp-intake-hero">
        <div>
          <p className="flp-kicker" data-flp-hero-reveal>
            Fairlend intake
          </p>
          <h1 data-flp-hero-reveal id={`${page.id}-title`}>
            {page.headline}
          </h1>
          <p data-flp-hero-reveal>{page.deck}</p>
          <Button
            className="flp-secondary-button"
            data-flp-hero-reveal
            render={<a href={page.parentHref} />}
            variant="outline"
          >
            Review context first
          </Button>
        </div>
        <img
          alt=""
          data-flp-hero-art
          decoding="async"
          fetchPriority="high"
          src={page.brandKit}
        />
      </section>

      {page.routes ? (
        <section
          aria-label="Choose your Fairlend path"
          className="flp-route-grid"
        >
          {page.routes.map((route, index) => (
            <Card
              className="flp-route-card"
              data-flp-reveal
              key={route.title}
              render={<a href={route.href} />}
              style={{ "--flp-stagger": `${index * 0.05}s` } as CSSProperties}
            >
              <h2>{route.title}</h2>
              <p>{route.copy}</p>
              <ArrowRight aria-hidden="true" />
            </Card>
          ))}
        </section>
      ) : (
        <section
          aria-labelledby={`${page.id}-form`}
          className="flp-intake-form-section"
          data-flp-reveal
        >
          <div className="flp-section-head">
            <p className="flp-kicker">First review</p>
            <h2 id={`${page.id}-form`}>
              Share the essentials. Fairlend will ask for more only when it
              matters.
            </h2>
          </div>
          {page.compliance ? (
            <div className="flp-caution flp-intake-caution">
              <ShieldCheck aria-hidden="true" />
              <p>{page.compliance}</p>
            </div>
          ) : null}
          <form className="flp-intake-form">
            {page.fields.map((field, index) => (
              <label
                className={
                  field.type === "textarea"
                    ? "flp-field flp-field-wide"
                    : "flp-field"
                }
                data-flp-reveal
                key={field.label}
                style={
                  { "--flp-stagger": `${index * 0.025}s` } as CSSProperties
                }
              >
                <span>
                  {field.label}
                  {field.required ? <i aria-hidden="true">*</i> : null}
                </span>
                <FieldControl field={field} />
              </label>
            ))}
            <Button
              className="flp-primary-button flp-form-submit"
              type="button"
            >
              Submit for Fairlend review
              <ArrowRight aria-hidden="true" />
            </Button>
          </form>
        </section>
      )}

      <FairlendFooter primaryCta="Back to contact" primaryHref="/contact" />
    </main>
  );
}

export function FairlendArticlePage({
  pageId,
}: {
  pageId: ArticlePageId;
}): ReactElement {
  const page = articlePages[pageId];
  const rootRef = useRef<HTMLElement>(null);

  useFairlendPageMotion(rootRef);

  return (
    <main
      className="flp-shell flp-theme-paper flp-article-shell"
      ref={rootRef}
      style={{ "--flp-kit": `url("${page.brandKit}")` } as CSSProperties}
    >
      <FairlendNav />
      <article aria-labelledby={`${page.id}-title`} className="flp-article">
        <header className="flp-article-header">
          <p className="flp-kicker" data-flp-hero-reveal>
            Fairlend resource
          </p>
          <h1 data-flp-hero-reveal id={`${page.id}-title`}>
            {page.headline}
          </h1>
          <p data-flp-hero-reveal>{page.deck}</p>
          <Button
            className="flp-primary-button"
            data-flp-hero-reveal
            render={<a href={page.audienceHref} />}
            size="xl"
          >
            {page.audienceCta}
            <ArrowRight aria-hidden="true" />
          </Button>
        </header>
        <img
          alt=""
          className="flp-article-image"
          data-flp-hero-art
          decoding="async"
          fetchPriority="high"
          src={page.brandKit}
        />
        <section aria-label="Resource takeaways" className="flp-article-points">
          {page.points.map((point, index) => (
            <Card
              className="flp-step-card"
              data-flp-reveal
              key={point.title}
              style={{ "--flp-stagger": `${index * 0.05}s` } as CSSProperties}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{point.title}</strong>
              <p>{point.copy}</p>
            </Card>
          ))}
        </section>
      </article>
      <FairlendFooter
        primaryCta={page.audienceCta}
        primaryHref={page.audienceHref}
      />
    </main>
  );
}

function FieldControl({ field }: { field: IntakeField }): ReactElement {
  if (field.type === "textarea") {
    return <Textarea aria-label={field.label} name={field.label} />;
  }

  if (field.type === "select") {
    return (
      <select aria-label={field.label} name={field.label}>
        <option value="">Select one</option>
        {field.options?.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "checkbox") {
    return (
      <span className="flp-checkbox-line">
        <input aria-label={field.label} name={field.label} type="checkbox" />
        <span>
          I acknowledge this request is informational and subject to review.
        </span>
      </span>
    );
  }

  return (
    <Input
      aria-label={field.label}
      name={field.label}
      nativeInput
      type={field.type ?? "text"}
    />
  );
}

function FairlendNav(): ReactElement {
  return (
    <header className="flp-nav">
      <a aria-label="Fairlend home" className="flp-brand" href="/">
        <span>Fairlend</span>
        <small>Capital</small>
      </a>
      <nav aria-label="Fairlend public navigation">
        {navItems.map((item) => (
          <a href={item.href} key={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      <Button className="flp-nav-button" render={<a href="/start" />}>
        Start review
      </Button>
    </header>
  );
}

function FairlendFooter({
  primaryCta,
  primaryHref,
}: {
  primaryCta: string;
  primaryHref: string;
}): ReactElement {
  return (
    <footer className="flp-footer">
      <div>
        <p className="flp-kicker">Fairlend Capital</p>
        <h2>
          Move the right housing project into the right capital conversation.
        </h2>
      </div>
      <div className="flp-footer-links">
        <a href="/about">About</a>
        <a href="/press">Press</a>
        <a href="/resources">Resources</a>
        <a href="/contact">Contact</a>
      </div>
      <Button
        className="flp-primary-button"
        render={<a href={primaryHref} />}
        size="xl"
      >
        {primaryCta}
        <ArrowRight aria-hidden="true" />
      </Button>
      <p className="flp-footer-note">
        Fairlend pages are informational and do not guarantee financing, CMHC
        qualification, investment suitability, or approval.
      </p>
    </footer>
  );
}

function useFairlendPageMotion(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const root = rootRef.current;
    if (!root) {
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const setScrollState = () => {
      root.classList.toggle("flp-scrolled", window.scrollY > 24);
    };

    setScrollState();
    window.addEventListener("scroll", setScrollState, { passive: true });

    if (media.matches) {
      root.classList.add("flp-motion-reduced");
      return () => window.removeEventListener("scroll", setScrollState);
    }

    root.classList.add("flp-motion-ready");
    let active = true;
    let cleanup = () => {};

    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(
      ([gsapModule, scrollTriggerModule]) => {
        if (!active) {
          return;
        }

        const gsap = gsapModule.default;
        const { ScrollTrigger } = scrollTriggerModule;
        gsap.registerPlugin(ScrollTrigger);

        const ctx = gsap.context(() => {
          gsap.to("[data-flp-hero-reveal]", {
            autoAlpha: 1,
            duration: 0.78,
            ease: "expo.out",
            stagger: 0.09,
            y: 0,
          });

          gsap.to("[data-flp-hero-art]", {
            autoAlpha: 1,
            duration: 0.9,
            ease: "expo.out",
            scale: 1,
            y: 0,
          });

          gsap.utils
            .toArray<HTMLElement>("[data-flp-reveal]")
            .forEach((item) => {
              gsap.to(item, {
                autoAlpha: 1,
                duration: 0.72,
                ease: "power4.out",
                scrollTrigger: {
                  once: true,
                  start: "top 88%",
                  trigger: item,
                },
                y: 0,
                delay:
                  Number.parseFloat(
                    item.style.getPropertyValue("--flp-stagger")
                  ) || 0,
              });
            });
        }, root);

        cleanup = () => ctx.revert();
      }
    );

    return () => {
      active = false;
      cleanup();
      window.removeEventListener("scroll", setScrollState);
    };
  }, [rootRef]);
}

function useFairlendMotion(
  rootRef: React.RefObject<HTMLElement | null>,
  pinRef: React.RefObject<HTMLDivElement | null>,
  trackRef: React.RefObject<HTMLDivElement | null>
) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let active = true;
    let cleanup = () => {};

    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(
      ([gsapModule, scrollTriggerModule]) => {
        if (!active) {
          return;
        }

        const gsap = gsapModule.default;
        const { ScrollTrigger } = scrollTriggerModule;
        gsap.registerPlugin(ScrollTrigger);

        const ctx = gsap.context(() => {
          gsap.fromTo(
            ".flp-hero-art img, .flp-authority img",
            { opacity: 0.72, scale: 0.88 },
            {
              opacity: 1,
              scale: 1,
              ease: "power4.out",
              scrollTrigger: {
                end: "bottom top",
                scrub: true,
                start: "top 82%",
                trigger: ".flp-hero-art",
              },
            }
          );

          if (pinRef.current && trackRef.current) {
            ScrollTrigger.create({
              end: "bottom bottom",
              pin: pinRef.current,
              pinSpacing: false,
              start: "top 96px",
              trigger: trackRef.current,
            });
          }

          gsap.utils
            .toArray<HTMLElement>(".flp-step-card")
            .forEach((card, index) => {
              gsap.fromTo(
                card,
                { opacity: 0.32, scale: 0.9, y: 36 },
                {
                  opacity: 1,
                  scale: 1,
                  y: 0,
                  ease: "power4.out",
                  scrollTrigger: {
                    end: "top 42%",
                    scrub: true,
                    start: "top 92%",
                    trigger: card,
                  },
                  delay: index * 0.02,
                }
              );
            });
        }, rootRef);

        cleanup = () => ctx.revert();
      }
    );

    return () => {
      active = false;
      cleanup();
    };
  }, [pinRef, rootRef, trackRef]);
}

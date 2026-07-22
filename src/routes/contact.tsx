import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Camera,
  CheckCircle2,
  FileText,
  Handshake,
  Landmark,
  Mail,
  MapPinned,
  MessageSquareText,
  Phone,
  Send,
  ShieldCheck,
} from "lucide-react";
import type { ComponentType, ReactElement } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () => ({
    meta: [
      { title: "Contact Fairlend Capital | Start the right conversation" },
      {
        name: "description",
        content:
          "Route builder, borrower, broker, investor, and media inquiries to the right Fairlend Capital intake path.",
      },
    ],
    links: [
      { rel: "preload", as: "image", href: heroImage },
      { rel: "preload", as: "image", href: routingImage },
    ],
  }),
});

const heroImage = "/assets/fairlend-redesign/contact-hero-neighbourhood.webp";
const routingImage = "/assets/fairlend-redesign/contact-routing-desk.webp";
const dossierImage = "/assets/fairlend-redesign/contact-brand-dossier.webp";

const intakePaths = [
  {
    audience: "Builders and borrowers",
    title: "Start a build financing request",
    body: "For multiplex, garden suite, infill, rental housing, or construction draw financing. Share the site, budget, permit stage, and timing.",
    href: "/start/builder",
    cta: "Open builder intake",
    icon: Building2,
    signal: "Primary path",
    fit: ["Borrower working capital", "Build proposal", "Draw plan"],
  },
  {
    audience: "Brokers and lending partners",
    title: "Refer a deal or discuss lending operations",
    body: "For brokered opportunities, lender policy questions, review workflows, and capital release coordination.",
    href: "/start/broker",
    cta: "Open broker intake",
    icon: BriefcaseBusiness,
    signal: "Partner path",
    fit: ["Referral context", "Policy fit", "Review lane"],
  },
  {
    audience: "Investors",
    title: "Review capital partnership fit",
    body: "For aligned capital, long-term housing strategy, mandate fit, and responsible return conversations.",
    href: "/start/investor",
    cta: "Open investor intake",
    icon: Landmark,
    signal: "Capital path",
    fit: ["Allocation intent", "Mandate fit", "Impact lens"],
  },
  {
    audience: "Media",
    title: "Request comment, background, or assets",
    body: "For interviews, source requests, founder background, publication deadlines, and Fairlend Capital brand materials.",
    href: "/start/media",
    cta: "Open media intake",
    icon: Camera,
    signal: "Editorial path",
    fit: ["Topic", "Deadline", "Format"],
  },
] satisfies Array<{
  audience: string;
  title: string;
  body: string;
  href: "/start/builder" | "/start/broker" | "/start/investor" | "/start/media";
  cta: string;
  icon: ComponentType<{ className?: string }>;
  signal: string;
  fit: string[];
}>;

const triageSteps = [
  {
    title: "Name the role",
    body: "Builder, borrower, broker, investor, lender, journalist, or civic partner. The first split keeps the response precise.",
    icon: MessageSquareText,
  },
  {
    title: "Bring the useful facts",
    body: "Location, property type, stage, budget range, capital need, deadline, or publication timing beats a long introduction.",
    icon: FileText,
  },
  {
    title: "Expect the right handoff",
    body: "Fairlend routes capital, construction, media, and partnership inquiries to different review lanes.",
    icon: Send,
  },
] satisfies Array<{
  title: string;
  body: string;
  icon: ComponentType<{ className?: string }>;
}>;

const directLines = [
  {
    label: "General inquiries",
    value: "hello@fairlend.ca",
    href: "mailto:hello@fairlend.ca",
    icon: Mail,
  },
  {
    label: "Broker and lending partners",
    value: "partners@fairlend.ca",
    href: "mailto:partners@fairlend.ca",
    icon: Handshake,
  },
  {
    label: "Media desk",
    value: "media@fairlend.ca",
    href: "mailto:media@fairlend.ca",
    icon: Camera,
  },
] satisfies Array<{
  label: string;
  value: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}>;

const trustNotes = [
  "Reimbursement-based construction financing",
  "Evidence and inspection aware draw governance",
  "Versioned budget and decision records",
  "Neighbourhood-scale rental housing focus",
] as const;

function ContactPage(): ReactElement {
  return (
    <main className="min-h-screen bg-[oklch(0.965_0.018_88)] text-[oklch(0.18_0.052_158)]">
      <HeroSection />
      <IntakeRoutingSection />
      <TriageSection />
      <DirectContactSection />
      <ClosingSection />
    </main>
  );
}

function HeroSection(): ReactElement {
  return (
    <section
      aria-labelledby="contact-hero-title"
      className="relative isolate overflow-hidden border-[oklch(0.28_0.054_158_/_0.28)] border-b"
    >
      <PaperBlueprint />
      <div className="mx-auto grid min-h-[88svh] max-w-[1560px] grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.62fr)]">
        <div className="relative flex flex-col justify-between px-5 py-6 sm:px-8 md:px-12 lg:min-h-[88svh] lg:border-[oklch(0.28_0.054_158_/_0.28)] lg:border-r lg:py-8">
          <PublicNav />

          <div className="max-w-[58rem] py-14 md:py-18 lg:py-20">
            <p className="mb-6 w-fit rounded-full border border-[oklch(0.32_0.071_158_/_0.3)] bg-[oklch(0.985_0.012_88_/_0.72)] px-4 py-2 font-medium text-sm">
              Contact Fairlend Capital
            </p>
            <h1
              className="max-w-[11ch] text-6xl leading-none sm:text-7xl md:text-8xl xl:text-9xl"
              id="contact-hero-title"
            >
              Start in the right lane.
            </h1>
            <p className="mt-7 max-w-[39rem] text-[oklch(0.28_0.045_158)] text-xl leading-snug md:text-2xl">
              Builders, borrowers, investors, brokers, and media come to
              Fairlend with different stakes. Pick the intake path that matches
              the decision you need from us.
            </p>
          </div>

          <div className="grid gap-3 pb-6 sm:max-w-[42rem] sm:grid-cols-[1fr_auto]">
            <Button
              className="h-12 justify-between bg-[oklch(0.24_0.084_158)] px-5 text-[oklch(0.965_0.018_88)] hover:bg-[oklch(0.2_0.073_158)]"
              render={
                <Link preload="intent" to="/start/builder" viewTransition />
              }
              size="xl"
            >
              I am a builder or borrower
              <ArrowRight aria-hidden="true" />
            </Button>
            <Button
              className="h-12 justify-between border-[oklch(0.32_0.071_158_/_0.32)] bg-[oklch(0.985_0.012_88_/_0.76)] px-5"
              render={
                <Link preload="intent" to="/start/broker" viewTransition />
              }
              size="xl"
              variant="outline"
            >
              I am a broker
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="relative min-h-[34rem] overflow-hidden bg-[oklch(0.19_0.052_158)] lg:min-h-full">
          <img
            alt="Fairlend neighbourhood housing website concept with garden homes and a community walkway."
            className="h-full min-h-[34rem] w-full object-cover"
            decoding="async"
            fetchPriority="high"
            height={520}
            src={heroImage}
            width={610}
          />
          <div className="absolute inset-0 bg-[oklch(0.18_0.052_158_/_0.12)]" />
          <div className="absolute right-4 bottom-4 left-4 sm:right-6 sm:bottom-6 sm:left-auto sm:w-80">
            <Frame className="rounded-[1.15rem] bg-[oklch(0.965_0.018_88_/_0.68)] p-1">
              <FramePanel className="rounded-[0.95rem] border-[oklch(0.965_0.018_88_/_0.36)] bg-[oklch(0.975_0.015_88_/_0.94)] p-4">
                <div className="flex items-start gap-3">
                  <MapPinned
                    aria-hidden="true"
                    className="mt-0.5 size-5 text-[oklch(0.55_0.132_39)]"
                  />
                  <p className="text-base leading-snug">
                    Tell us where the build, capital, referral, or story starts.
                    We will route from there.
                  </p>
                </div>
              </FramePanel>
            </Frame>
          </div>
        </div>
      </div>
    </section>
  );
}

function IntakeRoutingSection(): ReactElement {
  return (
    <section
      aria-labelledby="contact-routing-title"
      className="relative overflow-hidden px-5 py-20 sm:px-8 md:px-12 lg:py-28"
    >
      <div className="mx-auto max-w-[1420px]">
        <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
          <div>
            <p className="mb-4 font-semibold text-[oklch(0.55_0.132_39)] text-sm">
              Intake routing
            </p>
            <h2
              className="max-w-[12ch] text-5xl leading-none md:text-6xl"
              id="contact-routing-title"
            >
              One front door. Four useful paths.
            </h2>
          </div>
          <p className="max-w-[45rem] text-[oklch(0.31_0.046_158)] text-lg leading-relaxed md:text-xl">
            Fairlend works across build financing, draw governance, capital
            partnership, broker referrals, and public commentary. The fastest
            response starts with the right context.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-4">
          {intakePaths.map((path, index) => (
            <Card
              className="group overflow-hidden rounded-[1.35rem] border-[oklch(0.28_0.054_158_/_0.2)] bg-[oklch(0.985_0.012_88_/_0.78)] transition-transform duration-300 ease-out hover:-translate-y-1"
              key={path.href}
              render={<Link preload="intent" to={path.href} viewTransition />}
            >
              <div className="flex min-h-[27rem] flex-col p-5">
                <div className="flex items-start justify-between gap-4">
                  <span className="rounded-full bg-[oklch(0.91_0.04_140_/_0.86)] px-3 py-1 font-medium text-[oklch(0.26_0.073_158)] text-sm">
                    {path.signal}
                  </span>
                  <span className="text-[oklch(0.38_0.048_158_/_0.7)] text-sm">
                    0{index + 1}
                  </span>
                </div>

                <div className="mt-12 grid size-14 place-items-center rounded-full border border-[oklch(0.28_0.054_158_/_0.22)] bg-[oklch(0.965_0.018_88)]">
                  <path.icon
                    aria-hidden="true"
                    className="size-6 text-[oklch(0.24_0.084_158)]"
                  />
                </div>

                <p className="mt-8 font-semibold text-[oklch(0.55_0.132_39)] text-sm">
                  {path.audience}
                </p>
                <h3 className="mt-3 text-2xl leading-tight">{path.title}</h3>
                <p className="mt-4 text-[oklch(0.34_0.045_158)] text-base leading-relaxed">
                  {path.body}
                </p>

                <div className="mt-auto pt-8">
                  <ul className="mb-6 flex flex-wrap gap-2">
                    {path.fit.map((item) => (
                      <li
                        className="rounded-full border border-[oklch(0.28_0.054_158_/_0.16)] px-3 py-1 text-[oklch(0.34_0.045_158)] text-xs"
                        key={item}
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                  <span className="inline-flex items-center gap-2 font-semibold text-[oklch(0.24_0.084_158)] text-sm">
                    {path.cta}
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 transition-transform duration-300 ease-out group-hover:translate-x-1"
                    />
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function TriageSection(): ReactElement {
  return (
    <section
      aria-labelledby="contact-triage-title"
      className="px-5 pb-20 sm:px-8 md:px-12 lg:pb-28"
    >
      <div className="mx-auto grid max-w-[1420px] gap-5 lg:grid-cols-[minmax(0,0.88fr)_minmax(360px,0.52fr)]">
        <Frame className="rounded-[1.4rem] bg-[oklch(0.28_0.054_158_/_0.12)] p-1">
          <FramePanel className="overflow-hidden rounded-[1.2rem] border-[oklch(0.28_0.054_158_/_0.16)] bg-[oklch(0.985_0.012_88)] p-0">
            <div className="grid lg:grid-cols-[0.68fr_1fr]">
              <div className="relative min-h-[29rem] overflow-hidden bg-[oklch(0.19_0.052_158)]">
                <img
                  alt="Fairlend contact routing page concept with housing photography and intake modules."
                  className="h-full min-h-[29rem] w-full object-cover"
                  decoding="async"
                  height={690}
                  loading="lazy"
                  src={routingImage}
                  width={608}
                />
                <div className="absolute inset-0 bg-[oklch(0.18_0.052_158_/_0.1)]" />
              </div>

              <div className="flex flex-col justify-between p-6 sm:p-8 lg:p-10">
                <div>
                  <p className="mb-4 font-semibold text-[oklch(0.55_0.132_39)] text-sm">
                    What makes a good first message
                  </p>
                  <h2
                    className="max-w-[13ch] text-4xl leading-none md:text-5xl"
                    id="contact-triage-title"
                  >
                    Less preamble. Better signal.
                  </h2>
                </div>

                <div className="mt-10 grid gap-3">
                  {triageSteps.map((step) => (
                    <div
                      className="grid gap-4 rounded-[1rem] bg-[oklch(0.955_0.026_87)] p-4 sm:grid-cols-[auto_1fr]"
                      key={step.title}
                    >
                      <div className="grid size-11 place-items-center rounded-full bg-[oklch(0.24_0.084_158)] text-[oklch(0.965_0.018_88)]">
                        <step.icon aria-hidden="true" className="size-5" />
                      </div>
                      <div>
                        <h3 className="text-xl leading-tight">{step.title}</h3>
                        <p className="mt-2 text-[oklch(0.34_0.045_158)] text-base leading-relaxed">
                          {step.body}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FramePanel>
        </Frame>

        <Frame className="rounded-[1.4rem] bg-[oklch(0.28_0.054_158_/_0.12)] p-1">
          <FramePanel className="flex h-full flex-col justify-between rounded-[1.2rem] border-[oklch(0.28_0.054_158_/_0.16)] bg-[oklch(0.88_0.052_178)] p-6 sm:p-8">
            <div>
              <ShieldCheck
                aria-hidden="true"
                className="size-9 text-[oklch(0.24_0.084_158)]"
              />
              <h2 className="mt-8 max-w-[16ch] text-3xl leading-none sm:text-4xl md:text-5xl">
                Built for serious housing conversations.
              </h2>
              <p className="mt-5 text-[oklch(0.29_0.046_158)] text-lg leading-relaxed">
                We are direct because construction capital gets expensive when
                requirements are vague. The intake paths collect what each team
                needs to make the next decision.
              </p>
            </div>

            <ul className="mt-10 grid gap-3">
              {trustNotes.map((note) => (
                <li className="flex items-start gap-3" key={note}>
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-0.5 size-5 text-[oklch(0.55_0.132_39)]"
                  />
                  <span className="text-base leading-snug">{note}</span>
                </li>
              ))}
            </ul>
          </FramePanel>
        </Frame>
      </div>
    </section>
  );
}

function DirectContactSection(): ReactElement {
  return (
    <section
      aria-labelledby="direct-contact-title"
      className="px-5 pb-20 sm:px-8 md:px-12 lg:pb-28"
    >
      <div className="mx-auto grid max-w-[1420px] gap-5 lg:grid-cols-[0.7fr_1fr]">
        <div className="flex flex-col justify-between rounded-[1.4rem] bg-[oklch(0.24_0.084_158)] p-6 text-[oklch(0.965_0.018_88)] sm:p-8 lg:p-10">
          <div>
            <p className="mb-5 font-semibold text-[oklch(0.84_0.072_143)] text-sm">
              Direct contact
            </p>
            <h2
              className="max-w-[12ch] text-4xl leading-none md:text-6xl"
              id="direct-contact-title"
            >
              Email is fine when the path is obvious.
            </h2>
          </div>
          <p className="mt-10 max-w-[35rem] text-[oklch(0.92_0.02_88_/_0.82)] text-lg leading-relaxed">
            Use a direct line for simple asks. Use intake for financing,
            referrals, investor review, or media requests that need routing.
          </p>
        </div>

        <Frame className="rounded-[1.4rem] bg-[oklch(0.28_0.054_158_/_0.12)] p-1">
          <FramePanel className="rounded-[1.2rem] border-[oklch(0.28_0.054_158_/_0.16)] bg-[oklch(0.985_0.012_88)] p-4 sm:p-5">
            <div className="grid gap-3">
              {directLines.map((line) => (
                <a
                  className="group grid gap-4 rounded-[1rem] bg-[oklch(0.955_0.026_87)] p-4 transition-colors duration-300 ease-out hover:bg-[oklch(0.935_0.034_87)] sm:grid-cols-[auto_1fr_auto] sm:items-center"
                  href={line.href}
                  key={line.href}
                >
                  <div className="grid size-12 place-items-center rounded-full border border-[oklch(0.28_0.054_158_/_0.18)] bg-[oklch(0.985_0.012_88)]">
                    <line.icon
                      aria-hidden="true"
                      className="size-5 text-[oklch(0.24_0.084_158)]"
                    />
                  </div>
                  <div>
                    <p className="font-semibold text-[oklch(0.55_0.132_39)] text-sm">
                      {line.label}
                    </p>
                    <p className="mt-1 text-2xl leading-tight">{line.value}</p>
                  </div>
                  <ArrowRight
                    aria-hidden="true"
                    className="hidden size-5 transition-transform duration-300 ease-out group-hover:translate-x-1 sm:block"
                  />
                </a>
              ))}
            </div>

            <div className="mt-4 rounded-[1rem] border border-[oklch(0.28_0.054_158_/_0.16)] bg-[oklch(0.985_0.012_88)] p-5">
              <div className="flex items-start gap-3">
                <Phone
                  aria-hidden="true"
                  className="mt-1 size-5 text-[oklch(0.55_0.132_39)]"
                />
                <p className="text-[oklch(0.34_0.045_158)] text-base leading-relaxed">
                  If your inquiry includes confidential loan documents or
                  borrower data, start through the relevant intake path so the
                  right secure follow-up can be arranged.
                </p>
              </div>
            </div>
          </FramePanel>
        </Frame>
      </div>
    </section>
  );
}

function ClosingSection(): ReactElement {
  return (
    <section className="relative overflow-hidden border-[oklch(0.28_0.054_158_/_0.24)] border-t px-5 py-16 sm:px-8 md:px-12 lg:py-20">
      <PaperBlueprint />
      <div className="mx-auto grid max-w-[1420px] gap-8 lg:grid-cols-[1fr_0.62fr] lg:items-center">
        <div>
          <p className="mb-5 font-semibold text-[oklch(0.55_0.132_39)] text-sm">
            Fairlend Capital
          </p>
          <h2 className="max-w-[13ch] text-5xl leading-none md:text-7xl">
            Bring us the real constraint.
          </h2>
          <p className="mt-6 max-w-[42rem] text-[oklch(0.31_0.046_158)] text-lg leading-relaxed md:text-xl">
            Timing, working capital, policy fit, release risk, or public
            context. The sharper the starting point, the faster we can route the
            next step.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              className="h-12 justify-between bg-[oklch(0.24_0.084_158)] px-5 text-[oklch(0.965_0.018_88)] hover:bg-[oklch(0.2_0.073_158)]"
              render={
                <Link preload="intent" to="/start/builder" viewTransition />
              }
              size="xl"
            >
              Start builder intake
              <ArrowRight aria-hidden="true" />
            </Button>
            <Button
              className="h-12 justify-between border-[oklch(0.32_0.071_158_/_0.32)] bg-[oklch(0.985_0.012_88_/_0.76)] px-5"
              render={
                <Link preload="intent" to="/start/investor" viewTransition />
              }
              size="xl"
              variant="outline"
            >
              Investor inquiry
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </div>

        <Frame className="rounded-[1.4rem] bg-[oklch(0.28_0.054_158_/_0.12)] p-1">
          <FramePanel className="overflow-hidden rounded-[1.2rem] border-[oklch(0.28_0.054_158_/_0.16)] bg-[oklch(0.985_0.012_88)] p-0">
            <img
              alt="Fairlend Capital brand dossier with palette, icons, typography, and housing sketches."
              className="aspect-[1.3] w-full object-cover"
              decoding="async"
              height={640}
              src={dossierImage}
              width={832}
            />
          </FramePanel>
        </Frame>
      </div>
    </section>
  );
}

function PublicNav(): ReactElement {
  return (
    <nav
      aria-label="Fairlend contact navigation"
      className="flex items-center justify-between gap-4"
    >
      <Link
        className="group inline-flex items-center gap-3"
        preload="intent"
        to="/about"
        viewTransition
      >
        <span className="grid size-11 place-items-center rounded-[0.85rem] border border-[oklch(0.28_0.054_158_/_0.28)] bg-[oklch(0.985_0.012_88_/_0.72)] text-2xl leading-none">
          F
        </span>
        <span className="leading-none">
          <span className="block text-2xl">Fairlend</span>
          <span className="block font-semibold text-[oklch(0.42_0.047_158)] text-xs">
            Capital
          </span>
        </span>
      </Link>

      <div className="hidden items-center gap-2 md:flex">
        <Button
          className="border-[oklch(0.32_0.071_158_/_0.22)] bg-[oklch(0.985_0.012_88_/_0.64)]"
          render={<Link preload="intent" to="/investors" viewTransition />}
          size="sm"
          variant="outline"
        >
          Investors
        </Button>
        <Button
          className="border-[oklch(0.32_0.071_158_/_0.22)] bg-[oklch(0.985_0.012_88_/_0.64)]"
          render={<Link preload="intent" to="/press" viewTransition />}
          size="sm"
          variant="outline"
        >
          Media
        </Button>
      </div>
    </nav>
  );
}

function PaperBlueprint(): ReactElement {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 opacity-70 [background-image:linear-gradient(to_right,oklch(0.62_0.076_226_/_0.13)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.62_0.076_226_/_0.1)_1px,transparent_1px),radial-gradient(circle_at_22%_18%,oklch(0.99_0.012_88)_0,transparent_32%),radial-gradient(circle_at_84%_68%,oklch(0.91_0.04_140_/_0.36)_0,transparent_30%)] [background-size:84px_84px,84px_84px,auto,auto]"
    />
  );
}

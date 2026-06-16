import { linkOptions } from "@tanstack/react-router";

export type NavItem = {
  label: string;
  description?: string;
  link?: FairlendNavLinkOption;
};

export type NavColumn = {
  heading: string;
  items: NavItem[];
  accent?: boolean;
};

export type NavMenu = {
  id: string;
  columns: NavColumn[];
};

export type NavLink = {
  label: string;
  link?: FairlendNavLinkOption;
  menu?: NavMenu;
};

export const fairlendNavLinks = {
  home: linkOptions({ to: "/" }),
  about: linkOptions({ to: "/about" }),
  affordableHousing: linkOptions({
    to: "/affordable-sustainable-rental-housing",
  }),
  backoffice: linkOptions({ to: "/backoffice" }),
  cmhcMliSelect: linkOptions({ to: "/cmhc-mli-select-multiplex-financing" }),
  constructionDraws: linkOptions({ to: "/construction-draw-financing" }),
  contact: linkOptions({ to: "/contact" }),
  gardenSuite: linkOptions({ to: "/garden-suite-financing-gta" }),
  investors: linkOptions({ to: "/investors" }),
  leadership: linkOptions({ to: "/leadership/elie-soberano" }),
  multiplex: linkOptions({ to: "/multiplex-financing-gta" }),
  press: linkOptions({ to: "/press" }),
  resources: linkOptions({ to: "/resources" }),
  resourceCmhc: linkOptions({
    to: "/resources/cmhc-mli-select-guide-for-multiplex-builds",
  }),
  resourceDraws: linkOptions({
    to: "/resources/construction-draws-small-builders",
  }),
  resourceFinancingGap: linkOptions({
    to: "/resources/financing-gap-gta-multiplex-builds",
  }),
  resourceGardenSuites: linkOptions({
    to: "/resources/garden-suites-family-suitable-rental-supply",
  }),
  resourceHousingCapital: linkOptions({
    to: "/resources/private-capital-affordable-housing",
  }),
  resourceHousingReturns: linkOptions({
    to: "/resources/sustainable-rental-housing-investor-returns",
  }),
  resourceMultiplexCompare: linkOptions({
    to: "/resources/multiplex-vs-garden-suite-vs-laneway-suite",
  }),
  start: linkOptions({ to: "/start" }),
  startBroker: linkOptions({ to: "/start/broker" }),
  startBuilder: linkOptions({ to: "/start/builder" }),
  startGardenSuite: linkOptions({ to: "/start/garden-suite" }),
  startInvestor: linkOptions({ to: "/start/investor" }),
  startMedia: linkOptions({ to: "/start/media" }),
  startMultiplex: linkOptions({ to: "/start/multiplex" }),
} as const;

export type FairlendNavLinkOption =
  (typeof fairlendNavLinks)[keyof typeof fairlendNavLinks];

export const NAV_LINKS: NavLink[] = [
  {
    label: "Borrowers",
    menu: {
      id: "borrowers",
      columns: [
        {
          heading: "Financing",
          items: [
            {
              label: "Multiplex financing",
              description: "Capital for 2-6 unit Ontario projects",
              link: fairlendNavLinks.multiplex,
            },
            {
              label: "Garden suite financing",
              description: "Backyard housing and laneway builds",
              link: fairlendNavLinks.gardenSuite,
            },
            {
              label: "Construction draws",
              description: "Reimbursement-based draw funding",
              link: fairlendNavLinks.constructionDraws,
            },
          ],
        },
        {
          heading: "Programs",
          items: [
            {
              label: "CMHC MLI Select",
              description: "Financing for efficient rental housing",
              link: fairlendNavLinks.cmhcMliSelect,
            },
            {
              label: "Affordable rentals",
              description: "Sustainable housing capital",
              link: fairlendNavLinks.affordableHousing,
            },
            {
              label: "Start a borrower request",
              description: "Tell us about the project",
              link: fairlendNavLinks.startMultiplex,
            },
            {
              label: "Garden suite intake",
              description: "Scope a secondary-suite file",
              link: fairlendNavLinks.startGardenSuite,
            },
          ],
        },
        {
          heading: "Planning",
          accent: true,
          items: [
            {
              label: "Draw planning guide",
              description: "How builders protect working capital",
              link: fairlendNavLinks.resourceDraws,
            },
            {
              label: "Talk to FairLend",
              description: "Get lender-ready before you commit",
              link: fairlendNavLinks.contact,
            },
          ],
        },
      ],
    },
  },
  {
    label: "Investors",
    menu: {
      id: "investors",
      columns: [
        {
          heading: "Access",
          items: [
            {
              label: "Investor overview",
              description: "Private mortgage exposure with discipline",
              link: fairlendNavLinks.investors,
            },
            {
              label: "Start investor intake",
              description: "Share mandate, account type, and timing",
              link: fairlendNavLinks.startInvestor,
            },
            {
              label: "Broker introductions",
              description: "Bring suitable clients into the FairLend flow",
              link: fairlendNavLinks.startBroker,
            },
          ],
        },
        {
          heading: "Standards",
          items: [
            {
              label: "Underwriting discipline",
              description: "Asset-backed files, transparent reporting",
              link: fairlendNavLinks.about,
            },
            {
              label: "Leadership",
              description: "Meet the operating team",
              link: fairlendNavLinks.leadership,
            },
          ],
        },
        {
          heading: "Signals",
          items: [
            {
              label: "Press",
              description: "Company updates and media contact",
              link: fairlendNavLinks.press,
            },
            {
              label: "Resources",
              description: "Guides for borrowers and capital partners",
              link: fairlendNavLinks.resources,
            },
          ],
        },
      ],
    },
  },
  {
    label: "Resources",
    menu: {
      id: "resources",
      columns: [
        {
          heading: "Builder guides",
          items: [
            {
              label: "Construction draws for small builders",
              description: "Plan reimbursement draws without starving cash",
              link: fairlendNavLinks.resourceDraws,
            },
            {
              label: "GTA multiplex financing gap",
              description: "Where capital stacks get tight",
              link: fairlendNavLinks.resourceFinancingGap,
            },
            {
              label: "Multiplex vs garden suite vs laneway",
              description: "Compare project paths and financing needs",
              link: fairlendNavLinks.resourceMultiplexCompare,
            },
          ],
        },
        {
          heading: "Housing programs",
          items: [
            {
              label: "CMHC MLI Select guide",
              description: "Use affordability and efficiency to improve terms",
              link: fairlendNavLinks.resourceCmhc,
            },
            {
              label: "Garden suites and family-suitable rentals",
              description: "How small sites add useful supply",
              link: fairlendNavLinks.resourceGardenSuites,
            },
            {
              label: "Private capital for affordable housing",
              description: "Why disciplined capital matters",
              link: fairlendNavLinks.resourceHousingCapital,
            },
          ],
        },
        {
          heading: "Capital notes",
          accent: true,
          items: [
            {
              label: "Sustainable rental housing returns",
              description: "Investor return logic for efficient housing",
              link: fairlendNavLinks.resourceHousingReturns,
            },
            {
              label: "Resource library",
              description: "All FairLend guides",
              link: fairlendNavLinks.resources,
            },
          ],
        },
      ],
    },
  },
  {
    label: "Company",
    menu: {
      id: "company",
      columns: [
        {
          heading: "About",
          items: [
            {
              label: "Marketing home",
              description: "FairLend Mortgage landing page",
              link: fairlendNavLinks.home,
            },
            {
              label: "About FairLend",
              description: "A fairer construction lending model",
              link: fairlendNavLinks.about,
            },
            {
              label: "Leadership",
              description: "Operators behind the platform",
              link: fairlendNavLinks.leadership,
            },
          ],
        },
        {
          heading: "Connect",
          items: [
            {
              label: "Contact",
              description: "Reach the capital team",
              link: fairlendNavLinks.contact,
            },
            {
              label: "Press",
              description: "Media notes and announcements",
              link: fairlendNavLinks.press,
            },
            {
              label: "Media inquiry",
              description: "Share interview or coverage details",
              link: fairlendNavLinks.startMedia,
            },
          ],
        },
        {
          heading: "Start",
          accent: true,
          items: [
            {
              label: "General intake",
              description: "Route your request to the right team",
              link: fairlendNavLinks.start,
            },
            {
              label: "Builder intake",
              description: "Submit a project for review",
              link: fairlendNavLinks.startBuilder,
            },
            {
              label: "Platform sign in",
              description: "Open the DrawFlow workspace",
              link: fairlendNavLinks.backoffice,
            },
          ],
        },
      ],
    },
  },
];

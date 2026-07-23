
import { createRoot } from "react-dom/client";

import "../../src/styles.css";
import {
  EMPTY_PROPOSAL_DIRECTORY_FILTERS,
  ProposalDirectoryControls,
} from "../../src/features/production-proposals/ProposalDirectoryControls.tsx";

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("Proposal directory controls fixture root is missing");
}

createRoot(root).render(
  <main className="min-h-screen bg-background p-4">
    <ProposalDirectoryControls
      activeFilterCount={0}
      filters={EMPTY_PROPOSAL_DIRECTORY_FILTERS}
      loading={false}
      onFiltersChange={() => undefined}
      onReset={() => undefined}
      onSearchChange={() => undefined}
      options={{ brokers: [], builders: [] }}
      resultCount={38}
      search=""
    />
  </main>
);

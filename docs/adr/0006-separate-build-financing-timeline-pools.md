# Keep financing capacity separate from Build cash

The Build timeline maintains cash on hand, each on-demand Loan's Available Credit, and the single reimbursement-gated Loan's Unlocked Draw Capacity as separate projections. Only an explicit upfront disbursement, credit advance, or released construction Draw moves value into cash, and each transfer remains tied to its Loan and schedule-event lineage. This prevents unused borrowing capacity from hiding cash shortfalls while allowing the optimizer to propose, but never silently execute, the deployment of hybrid financing.

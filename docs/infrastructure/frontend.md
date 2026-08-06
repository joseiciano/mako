# Frontend Technologies

**Last reconciled**: 2026-03-30 (Documentation Drift Resolution Plan)

- **Cloudflare Workers**: This website will be hosted on Cloudflare Workers. **NEVER** use Cloudflare Pages. 
- **Zod**: Zod is used for form parsing and defining our data shape before sending to our backend API. 
- **Tanstack Start**: [`Tanstack Start`](https://tanstack.com/start/latest/docs/framework/react/overview) is used for our frontend setup. **NEVER** recommend or use Nextjs or React Router. 
- **Tanstack Query**: You use Tanstack query (formerly React Query) to handle data fetching from the backend. 
- **Tailwind CSS**: Tailwind CSS handles any styling related.
- **Lucide**: We use Lucide for iconography in the frontend UI.
- **Excalidraw**: Used for the collaborative whiteboard in system design interviews.
- **Cloudflare RealtimeKit React SDK**: Used for real-time interview audio/video communication.
- **Stripe Elements**: Credit-card checkout on `/billing` uses `@stripe/stripe-js` and
  `@stripe/react-stripe-js` (Stripe Payment Element). Stripe needs a publishable key at
  runtime through the standard `VITE_*` frontend environment pattern. Configure
  `VITE_STRIPE_PUBLISHABLE_KEY` for local development and deployment. When it is unset, the
  checkout renders an unavailable state rather than crashing. Client-side confirmation only
  completes the payment; credits are granted asynchronously by the backend Stripe webhook,
  so the client never mutates balances and always invalidates/refetches the account query
  after confirmation. Stripe setup stays in the focused `src/lib/stripe.ts` helper and the
  billing checkout boundary (`src/routes/billing/billing-checkout-smart.tsx`) — it is never
  placed inside package-selection or balance-display components.
    - **Constraints**: Do not use Stripe Checkout Sessions, subscriptions, saved payment
      methods, invoices, refunds, or admin billing controls.

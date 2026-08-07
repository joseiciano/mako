# CRUD & Account Flows

This diagram illustrates the primary user flows for account management, payments, and interviewer registration within the Mako platform.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Frontend (TanStack Start)
    participant BE as Backend (Hono)
    participant Auth as Better Auth
    participant DB as Neon Postgres (via Hyperdrive)
    participant Stripe as Stripe API
    actor Admin

    Note over User, DB: 1. Create Account
    User->>FE: Click Sign Up
    FE->>BE: Submit Credentials
    BE->>Auth: Request Registration
    Auth->>DB: Persist User Record
    Auth-->>BE: Success (JWT/Session)
    BE-->>FE: Account Created

    Note over User, DB: 2. Update/Delete Account
    User->>FE: Edit Profile / Delete Request
    FE->>BE: PATCH/DELETE /api/account
    BE->>Auth: Validate Session
    BE->>DB: Update or Soft-Delete Record
    DB-->>BE: Ack
    BE-->>FE: Success

    Note over User, Stripe: 3. Pay for Credits (Stripe Elements)
    User->>FE: Select Credit Package
    FE->>BE: POST /api/payments/create-intent
    BE->>Stripe: Create Payment Intent
    Stripe-->>BE: client_secret
    BE-->>FE: Return client_secret
    FE->>User: Render Stripe Payment Element
    User->>FE: Submit Payment
    FE->>Stripe: Confirm Payment (Client-side)
    Stripe-->>FE: Success/Failure
    Stripe->>BE: Webhook (payment_intent.succeeded)
    BE->>DB: Increment User Credits
    BE-->>User: (UI) Credits Updated

    Note over User, Admin: 4. Register as Interviewer (Verification Flow)
    User->>FE: Apply (Email, Select Complete Employment Records)
    FE->>BE: POST /api/interviewer/apply (Employment Record IDs)
    BE->>DB: Validate Ownership and Save Immutable Snapshot (Pending)
    Admin->>BE: Review Application and Submit Decision
    alt Approved
        BE->>DB: Set Application Approved + Reviewer Metadata + companies=True
    else Rejected
        BE->>DB: Set Application Rejected + Reviewer Metadata
    end
    User->>FE: View Current Application Status
    FE->>BE: GET /api/interviewer/status
    BE-->>FE: Return Status + Immutable Employment Snapshot
```

## Flow Descriptions

1.  **Account Creation:** Authentication is done via **Better Auth**. Data is stored in **Neon** instance. 
2.  **Account Management:** Standard Hono REST endpoints protected by Auth middleware. Deletions are  "soft-deletes".
3.  **Credit Purchase:** Uses **Stripe Elements** (embedded Payment Element) for a seamless in-app checkout experience while maintaining PCI compliance. Fulfillment is handled asynchronously via **Stripe Webhooks** (`payment_intent.succeeded`) to ensure credits are granted even if the client-side confirmation is interrupted.
4.  **Interviewer Onboarding:** The user selects complete canonical employment records. The backend validates ownership and stores an immutable snapshot before a human admin manually approves or rejects the pending application. Approval sets the account-level interviewer eligibility flag in the same decision transaction. Profile edits do not rewrite submitted evidence, and automated verification/decision email is outside the MVP contract.

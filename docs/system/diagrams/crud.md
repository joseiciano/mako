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
    participant Email as Email Service (Resend/SES)

    Note over User, Email: 1. Create Account
    User->>FE: Click Sign Up
    FE->>BE: Submit Credentials
    BE->>Auth: Request Registration
    Auth->>DB: Persist User Record
    Auth-->>BE: Success (JWT/Session)
    BE-->>FE: Account Created

    Note over User, Email: 2. Update/Delete Account
    User->>FE: Edit Profile / Delete Request
    FE->>BE: PUT/DELETE /api/account
    BE->>Auth: Validate Session
    BE->>DB: Update or Soft-Delete Record
    DB-->>BE: Ack
    BE-->>FE: Success

    Note over User, Email: 3. Pay for Credits (Stripe Elements)
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

    Note over User, Email: 4. Register as Interviewer (Verification Flow)
    User->>FE: Apply (Email, Employment History)
    FE->>BE: POST /api/interviewer/apply
    BE->>DB: Save Application (Status: Pending Review)
    Note over BE: Internal Review Process (Admin/AI)
    alt Approved
        BE->>DB: Set status: Interviewer (Flag: True)
        BE->>Email: Send "Welcome Interviewer" Email
    else Rejected
        BE->>DB: Set status: Rejected
        BE->>Email: Send "Rejection" Email
    end
    Email-->>User: Receives Final Status Update
```

## Flow Descriptions

1.  **Account Creation:** Authentication is done via **Better Auth**. Data is stored in **Neon** instance. 
2.  **Account Management:** Standard Hono REST endpoints protected by Auth middleware. Deletions are  "soft-deletes".
3.  **Credit Purchase:** Uses **Stripe Elements** (embedded Payment Element) for a seamless in-app checkout experience while maintaining PCI compliance. Fulfillment is handled asynchronously via **Stripe Webhooks** (`payment_intent.succeeded`) to ensure credits are granted even if the client-side confirmation is interrupted.
4.  **Interviewer Onboarding:** A multi-step process involving manual or semi-automated review. The user's application (including employment history) is held in a "Pending" state until an approval decision triggers the "Interviewer" flag update and a confirmation email.

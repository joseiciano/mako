
## Backend Coding Patterns 

The following is useful information when working specifically in the backend. 

### Controller-Service-Repository Pattern

Within a package: 

1. Always use controller service repository pattern for backend code. This separates concerns and makes code more maintainable.
2. Controller level handles parsing of input params and passes on the request to the service level call. 
3. Service level handles validation of the data (i.e Is the user authenticated? Do they have proper permissions), and calls the Repository level as needed 
4. Repository level handles the low level operations (DB queries, external API calls). 

Example structure:

```typescript
|packages/
|- Foo/
|-- foo-controller.ts 
|-- foo-service.ts 
|-- foo-repository.ts
|-- types.ts
|-- index.ts // <-- This holds the barrel imports for the rest of the package
```

We structure the controller in this way, and then insert the controller in our router. This promotes structure and cleanliness. 

- **Controller**: Handles input and output from the HTTP route. Here is where you define what the client will be able to send and how the route is defined (path params, query parameters, body parsing). Any inputs received are to be parsed and sent to the service layer.
  Example:

  ```typescript
  // inside foo/foo-controller.ts
  export interface InviteControllerOptions {
    supabaseFactory: (bindings: WorkerBindings) => SupabaseClient;
    createService: (context: { supabase: SupabaseClient; env: WorkerBindings }) => InviteService;
  }

  export const registerInviteController = (
    app: Hono<{ Bindings: WorkerBindings }>,
    options: FooControllerOptions,
  ): void => {
    app.post('/foo/:userId', async (c) => {
      // Handle path param validation
      const pathMatch = c.req.path.match(/^\/foo\/([^/]+)\/userId/);
      if (!pathMatch) {
        return c.notFound();
      }

      const wishlistIdParam = pathMatch[1];

      // Call service
      const fooService = options.createService({ supabase, env: c.env });
      await fooService.foo();

      return c.json(invite, 201);
    });
  };
  ```

- **Service**: Handles high level business logic. Auth validation as well as data shaping are to exist here.
  Example:

  ```typescript
  // inside foo/foo-service.ts
  export class FooService() {
    constructor(
      private readonly fooRepository: FooRepository
    ){}

    async foo() {
      await this.fooRepository.foo()
    }
  }
  ```

- **Repository**: Handles low-level data manipulation. API calls and DB queries are to exist here.
  Example:

  ```typescript
  export class FooRepository() {
    constructor(
      private readonly supabase: SupabaseClient
    ){}

    async foo() {
      this.supabase.query(<insert query here>)
    }
  }
  ```


### Domain Driven Design

1. Always use zod for defining data that exists within our db.
2. Always create an an initial zod schema that is what exists within the db table.
3. From the zod schema, define a type using zod.infer<>.
4. For any data that is returned from an api, if it is not using the entire type, define a partial type using pick/omit on the base type.

## Backend Development Structure

When it comes to writing backend, you are a Backend Code Wizard - an elite backend developer with mastery over all aspects of backend implementation. You possess deep expertise across multiple programming languages, frameworks, database systems, API architectures, and backend infrastructure patterns. Your implementations are renowned for their clarity, maintainability, performance, and robustness.

### Code Structure/Style

For backend code you always follow the following conventions:

- You favor explicit `function x()` over arrow functions. 
- You prefer to keep files small, preferably 1-2 functions per file. If more are needed, that's what extra files are for.
- Following the above code structure of Controller Service Repo, you organize your code in packages that are barrel imported. 

### Tools

These are the main tools you prefer to use when developing backend services.

Reference `../infrastructure/backend.md`. Only use technologies mentioned in the doc. If we need more get buy in and confirmation from the user. 


### Dependency Injection

Favor dependency injection when possible. This allows for loose coupling of resources and easy modularity of the codebase.
Unless it is a service provided by a library (i.e. `supabaseClient` comes from the supabase library, so we would not create our own), you prefer to use D.I. when creating new classes.


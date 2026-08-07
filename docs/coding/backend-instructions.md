
## Backend Coding Patterns 

The following is useful information when working specifically in the backend. 

### API Documentation

1. Every route must be backed by shared, validated Zod schemas (`@mako/shared`) that are used for both request validation and response typing, and every route must have exact, current API documentation (request/response shapes, error states, cache/ordering semantics) in `docs/system/system-design/api-routes.md` plus contract tests that lock those schemas down.
2. Generated OpenAPI/Swagger annotation tooling is deferred to a separate repository-wide initiative. Individual feature tickets must not invent partial annotation conventions (for example ad-hoc `zod-to-openapi` decorators or bespoke OpenAPI metadata) on their routes; when such tooling lands it will be adopted uniformly across the codebase.
3. Every endpoint's exact request/response schemas, possible error states, and behavior rules must be documented and enforced by contract tests, independent of any generated-spec tooling.

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
  type FooControllerOptions<Bindings extends Record<string, unknown>> = {
    createService: (context: { bindings: Bindings }) => FooService
  }

  export function registerFooController<Bindings extends Record<string, unknown>>(
    app: Hono<{ Bindings: Bindings }>,
    options: FooControllerOptions<Bindings>,
  ): void {
    app.post('/foo/:userId', async (c) => {
      // Parse and validate path params
      const userIdParam = c.req.param('userId')

      // Call service with parsed params
      const fooService = options.createService({ bindings: c.env })
      const foo = await fooService.foo(userIdParam)

      return c.json(foo, 201)
    })
  }
  ```

- **Service**: Handles high level business logic. Auth validation as well as data shaping are to exist here.
  Example:

  ```typescript
  // inside foo/foo-service.ts
  type FooServiceDependencies = {
    fooRepository: FooRepository
  }

  export class FooService {
    constructor(private readonly fooRepository: FooRepository) {}

    async foo() {
      await this.fooRepository.foo()
    }
  }
  ```

- **Repository**: Handles low-level data manipulation. API calls and DB queries are to exist here, executed as raw SQL through a `SqlQueryExecutor` (the Hyperdrive-backed executor from `apps/backend-rest/src/database.ts`).
  Example:

  ```typescript
  // inside foo/foo-repository.ts
  type FooRepositoryDependencies = {
    queryExecutor: SqlQueryExecutor
  }

  export class FooRepository {
    constructor(private readonly queryExecutor: SqlQueryExecutor) {}

    async getFooById(fooId: string): Promise<FooRow | null> {
      const result = await this.queryExecutor.query<FooRow>(
        createSqlQuery(
          `
          SELECT id, name
          FROM foo
          WHERE id = $1;
          `,
          [fooId],
        ),
      )
      return result.rows[0] ?? null
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
- Prefer `type` over `interface` for shared data shapes, options, and dependencies; use `interface` only for class contracts where unavoidable.

### Tools

These are the main tools you prefer to use when developing backend services.

Reference `../infrastructure/backend.md`. Only use technologies mentioned in the doc. If we need more get buy in and confirmation from the user. 


### Wiring

Repositories are constructed with a `SqlQueryExecutor` (typically the Hyperdrive-backed executor created in `apps/backend-rest/src/database.ts`) and injected into the service through a factory that resolves the executor from `c.env`. Prefer constructor injection for repository and service classes so the data source can be swapped for tests and transactions. When creating new classes, inject their dependencies rather than reaching for globals.


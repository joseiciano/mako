# Mako Projects 

The applications here are part of the monorepo setup for Mako, an AI-first interviewing platform . 


## Application Structure 

```
|/apps
| - /backend-rest <-- Hosts the backend rest api for this application 
| - /frontend <-- Hosts the application serving the frontend website of this application 
```

Each application within this `/apps` directory serves as one part of the overall product. If needed, within one application, reference the other's for a holistic understanding of how data is to be handled/served. 

If needing to create a new application, prompt the user first to confirm it is to be done, and make sure that the scope is well defined. 

## Working Rules

When working on a change, only modify the application I reference. Do not change anything within the other application without explicit permission. If changes need to be done, you must ask first and get user approval. 
